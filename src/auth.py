"""
Wallet-based authentication for Colony.

Flow:
1. Frontend: GET /api/auth/message?wallet=0x... → gets a nonce-backed message
2. Frontend: wallet signs the message via wallet provider
3. Frontend: POST /api/auth/verify with {wallet, signature, nonce}
4. Backend: verifies nonce is valid & unused, checks rate limit, returns JWT
5. All subsequent requests: Bearer token in header

Security features:
- Nonce-based replay prevention (each nonce is single-use, TTL 10 min)
- Per-IP rate limiting (5 auth attempts per minute)
- JWT_SECRET from environment variable (never hardcoded)
- Configurable token expiry (default 24h)
"""

import os
import time
import hmac
import json
import hashlib
import base64
import secrets
import logging
from dataclasses import dataclass, field
from collections import defaultdict
from threading import Lock

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# CONFIGURATION (from environment)
# ──────────────────────────────────────────────

JWT_SECRET: str = os.environ.get(
    "JWT_SECRET",
    "CHANGE-ME-IN-PRODUCTION-" + secrets.token_hex(16),  # random fallback for dev
)

JWT_EXPIRY: int = int(os.environ.get("JWT_EXPIRY_SECONDS", str(86400)))  # 24h default
NONCE_TTL: int = int(os.environ.get("NONCE_TTL_SECONDS", str(600)))  # 10 min
RATE_LIMIT_MAX: int = int(os.environ.get("AUTH_RATE_LIMIT_MAX", "5"))  # per IP
RATE_LIMIT_WINDOW: int = int(os.environ.get("AUTH_RATE_LIMIT_WINDOW", "60"))  # seconds


# ──────────────────────────────────────────────
# NONCE STORE  (wallet_address → {nonce, created_at})
# ──────────────────────────────────────────────

@dataclass
class NonceEntry:
    nonce: str
    created_at: float
    used: bool = False


_nonce_store: dict[str, NonceEntry] = {}
_nonce_lock = Lock()


def _cleanup_expired_nonces() -> None:
    """Remove expired nonces (called lazily on each request)."""
    now = time.time()
    with _nonce_lock:
        expired = [
            addr for addr, entry in _nonce_store.items()
            if now - entry.created_at > NONCE_TTL
        ]
        for addr in expired:
            del _nonce_store[addr]


def generate_nonce(wallet_address: str) -> str:
    """
    Generate a cryptographic nonce for a wallet address.
    Stores it in-memory with a TTL. Any previous nonce for the same
    wallet is invalidated.
    """
    wallet_address = wallet_address.lower()
    nonce = secrets.token_hex(32)  # 64-char hex string
    _cleanup_expired_nonces()
    with _nonce_lock:
        _nonce_store[wallet_address] = NonceEntry(
            nonce=nonce,
            created_at=time.time(),
        )
    logger.debug("Generated nonce for %s", wallet_address)
    return nonce


def verify_and_consume_nonce(wallet_address: str, nonce: str) -> bool:
    """
    Verify that a nonce matches the one we issued for this wallet,
    and that it hasn't expired or already been used.

    Returns True if valid (and marks it as consumed), False otherwise.
    """
    wallet_address = wallet_address.lower()
    _cleanup_expired_nonces()
    with _nonce_lock:
        entry = _nonce_store.get(wallet_address)
        if entry is None:
            return False
        if entry.used:
            return False
        if time.time() - entry.created_at > NONCE_TTL:
            del _nonce_store[wallet_address]
            return False
        if not hmac.compare_digest(entry.nonce, nonce):
            return False
        # Consume the nonce (single-use)
        entry.used = True
        # Remove after validation so it can't be reused
        del _nonce_store[wallet_address]
    logger.debug("Consumed nonce for %s", wallet_address)
    return True


# ──────────────────────────────────────────────
# RATE LIMITING  (IP → list of attempt timestamps)
# ──────────────────────────────────────────────

_rate_limit_store: dict[str, list[float]] = defaultdict(list)
_rate_limit_lock = Lock()


def check_rate_limit(ip_address: str) -> bool:
    """
    Check whether the IP is within the rate limit window.

    Returns True if allowed, False if rate-limited.
    """
    now = time.time()
    with _rate_limit_lock:
        attempts = _rate_limit_store[ip_address]
        # Prune old entries outside the window
        _rate_limit_store[ip_address] = [
            t for t in attempts if now - t < RATE_LIMIT_WINDOW
        ]
        if len(_rate_limit_store[ip_address]) >= RATE_LIMIT_MAX:
            logger.warning("Rate limit exceeded for IP %s", ip_address)
            return False
        _rate_limit_store[ip_address].append(now)
    return True


def get_rate_limit_retry_after(ip_address: str) -> int:
    """Return seconds until the IP can try again (0 if allowed now)."""
    now = time.time()
    with _rate_limit_lock:
        attempts = _rate_limit_store.get(ip_address, [])
        if not attempts:
            return 0
        oldest = min(attempts)
        remaining = RATE_LIMIT_WINDOW - (now - oldest)
        return max(0, int(remaining))


# ──────────────────────────────────────────────
# JWT HELPERS (HS256, no external deps)
# ──────────────────────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


def create_token(wallet_address: str, user_id: str = "") -> str:
    """
    Create a signed HS256 JWT for a wallet address.

    Payload includes:
      - sub: wallet address (lowercased)
      - uid: user ID
      - iat: issued-at timestamp
      - exp: expiry timestamp
      - jti: unique token ID (for future revocation support)
    """
    now = int(time.time())
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url(json.dumps({
        "sub": wallet_address.lower(),
        "uid": user_id,
        "iat": now,
        "exp": now + JWT_EXPIRY,
        "jti": secrets.token_hex(16),
    }).encode())
    sig_input = f"{header}.{payload}".encode()
    signature = _b64url(
        hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{signature}"


def verify_token(token: str) -> dict | None:
    """
    Verify a JWT token and return its payload, or None if invalid/expired.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload, sig = parts

        # Verify signature
        sig_input = f"{header}.{payload}".encode()
        expected = _b64url(
            hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest()
        )
        if not hmac.compare_digest(sig, expected):
            return None

        # Decode and validate payload
        data = json.loads(_b64url_decode(payload))

        # Check expiry with a small clock-skew tolerance (30s)
        if data.get("exp", 0) < time.time() - 30:
            return None

        return data
    except (json.JSONDecodeError, ValueError, KeyError):
        logger.debug("Token verification failed: malformed token")
        return None


# ──────────────────────────────────────────────
# AUTH MESSAGE
# ──────────────────────────────────────────────

def get_auth_message(wallet_address: str) -> dict:
    """
    Generate the message that the wallet needs to sign.

    Returns a dict with:
      - message: human-readable message for the wallet to sign
      - nonce: the nonce the frontend must include in /verify
    """
    nonce = generate_nonce(wallet_address)
    message = (
        f"Welcome to Colony HQ!\n\n"
        f"Sign this message to verify your wallet.\n\n"
        f"Wallet: {wallet_address}\n"
        f"Nonce: {nonce}\n"
        f"Timestamp: {int(time.time())}\n\n"
        f"This request will not trigger a blockchain transaction "
        f"or cost any gas fees."
    )
    return {"message": message, "nonce": nonce}


# ──────────────────────────────────────────────
# ERROR MESSAGES (structured for API responses)
# ──────────────────────────────────────────────

class AuthError:
    """Standardized auth error responses."""
    INVALID_WALLET = {
        "error": "invalid_wallet",
        "message": "A valid Ethereum wallet address starting with 0x is required.",
    }
    INVALID_NONCE = {
        "error": "invalid_nonce",
        "message": "The provided nonce is invalid or has expired. Please request a new message to sign.",
    }
    MISSING_NONCE = {
        "error": "missing_nonce",
        "message": "The nonce field is required. Request a message from /api/auth/message first.",
    }
    RATE_LIMITED = {
        "error": "rate_limited",
        "message": "Too many authentication attempts. Please try again later.",
    }
    INVALID_TOKEN = {
        "error": "invalid_token",
        "message": "The provided authentication token is invalid or has expired.",
    }

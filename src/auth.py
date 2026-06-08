"""
Wallet-based authentication for Colony.

Flow:
1. Frontend: user clicks "Connect Wallet" → wallet signs a message
2. Frontend: sends wallet address + signature to /api/auth/verify
3. Backend: verifies signature → returns JWT token
4. All subsequent requests: Bearer token in header

No passwords, no emails. Pure wallet auth.
"""

import time
import hashlib
import hmac
import json
import base64
from dataclasses import dataclass


# Simple JWT implementation (no external deps)
JWT_SECRET = "colony-dev-secret-change-in-production"
JWT_EXPIRY = 86400 * 7  # 7 days


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


def create_token(wallet_address: str, user_id: str = "") -> str:
    """Create a JWT token for a wallet address."""
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64url(json.dumps({
        "sub": wallet_address.lower(),
        "uid": user_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRY,
    }).encode())
    sig_input = f"{header}.{payload}".encode()
    signature = _b64url(hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def verify_token(token: str) -> dict | None:
    """Verify a JWT token and return payload, or None if invalid."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload, sig = parts
        # Verify signature
        sig_input = f"{header}.{payload}".encode()
        expected = _b64url(hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        # Decode payload
        data = json.loads(_b64url_decode(payload))
        # Check expiry
        if data.get("exp", 0) < time.time():
            return None
        return data
    except Exception:
        return None


def get_auth_message(wallet_address: str) -> str:
    """Generate the message that the wallet needs to sign."""
    return (
        f"Welcome to Colony HQ!\n\n"
        f"Sign this message to verify your wallet.\n\n"
        f"Wallet: {wallet_address}\n"
        f"Timestamp: {int(time.time())}\n\n"
        f"This request will not trigger a blockchain transaction or cost any gas fees."
    )

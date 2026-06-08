"""
USDC payment integration for Colony on Base chain.

Flow:
1. User wants to install a paid agent
2. Frontend calls /api/payments/create → gets payment details (amount, recipient, reference)
3. User sends USDC on Base chain from their wallet
4. Frontend calls /api/payments/confirm with tx hash
5. Backend verifies tx on-chain → confirms payment → triggers install

Base chain USDC contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
"""

import asyncio
import logging
import os
import re

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration – pulled from environment with sane defaults
# ---------------------------------------------------------------------------
BASE_CHAIN_ID = 8453
USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
USDC_DECIMALS = 6
TOLERANCE = 0.99  # 1 % tolerance on amount comparison

BASE_RPC_URL: str = os.environ.get(
    "BASE_RPC_URL", "https://mainnet.base.org"
)

# Platform wallet – MUST be set in production
PLATFORM_WALLET: str = os.environ.get("PLATFORM_WALLET", "")
if not PLATFORM_WALLET:
    logger.warning(
        "PLATFORM_WALLET is not set. "
        "Set the PLATFORM_WALLET environment variable before accepting payments."
    )

PLATFORM_FEE_PERCENT = 20

# Retry / timeout settings
_RPC_MAX_RETRIES = 3
_RPC_INITIAL_BACKOFF = 1.0  # seconds, doubles each retry
_RPC_TIMEOUT = 15.0  # seconds per HTTP request

# Valid tx-hash pattern: 0x followed by exactly 64 hex characters
_TX_HASH_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _validate_tx_hash(tx_hash: str) -> None:
    """Raise *ValueError* if *tx_hash* doesn't look like an Ethereum tx hash."""
    if not isinstance(tx_hash, str) or not _TX_HASH_RE.match(tx_hash):
        raise ValueError(
            f"Invalid transaction hash format: {tx_hash!r}. "
            "Expected '0x' followed by 64 hexadecimal characters."
        )


async def _rpc_call(method: str, params: list) -> dict:
    """
    Execute a JSON-RPC call against BASE_RPC_URL with retry + exponential backoff.

    Returns the parsed JSON response dict.
    Raises *RPCError* after exhausting retries.
    """
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    last_exc: Exception | None = None

    for attempt in range(1, _RPC_MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    BASE_RPC_URL, json=payload, timeout=_RPC_TIMEOUT
                )
                resp.raise_for_status()
                data = resp.json()

                if "error" in data:
                    err = data["error"]
                    raise RPCError(
                        f"RPC error on {method}: {err.get('message', err)} "
                        f"(code {err.get('code', '?')})"
                    )

                if "result" not in data:
                    raise RPCError(
                        f"RPC response missing 'result' field for {method}: {data}"
                    )

                return data

        except (httpx.TimeoutException, httpx.ConnectError, RPCError) as exc:
            last_exc = exc
            if attempt < _RPC_MAX_RETRIES:
                wait = _RPC_INITIAL_BACKOFF * (2 ** (attempt - 1))
                logger.warning(
                    "RPC %s attempt %d/%d failed (%s). Retrying in %.1fs…",
                    method, attempt, _RPC_MAX_RETRIES, exc, wait,
                )
                await asyncio.sleep(wait)
            else:
                logger.error(
                    "RPC %s failed after %d attempts: %s",
                    method, _RPC_MAX_RETRIES, exc,
                )

    raise RPCError(
        f"RPC call {method} failed after {_RPC_MAX_RETRIES} attempts: {last_exc}"
    )


# ---------------------------------------------------------------------------
# Public exceptions
# ---------------------------------------------------------------------------

class RPCError(Exception):
    """Raised when an RPC call fails after all retries."""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_usdc_balance(wallet_address: str) -> float:
    """
    Return the USDC balance (human-readable, 6-decimal) for *wallet_address* on Base.

    Raises *RPCError* if the RPC call ultimately fails.
    Raises *ValueError* if the address looks malformed.
    """
    if not isinstance(wallet_address, str) or not wallet_address.startswith("0x") or len(wallet_address) != 42:
        raise ValueError(
            f"Invalid wallet address: {wallet_address!r}. "
            "Expected a 42-character hex string starting with '0x'."
        )

    # balanceOf(address) selector = 0x70a08231
    data = "0x70a08231" + wallet_address[2:].lower().zfill(64)
    result = await _rpc_call(
        "eth_call", [{"to": USDC_CONTRACT, "data": data}, "latest"]
    )
    balance_raw = int(result["result"], 16)
    return balance_raw / (10 ** USDC_DECIMALS)


async def get_transaction_status(tx_hash: str) -> dict:
    """
    Return the on-chain status of a transaction.

    Returns::

        {
            "found": True/False,
            "status": "success" | "failed" | "pending" | None,
            "block_number": int | None,
            "to": str | None,
            "error": str,
        }

    Raises *ValueError* for malformed hashes, *RPCError* on network failure.
    """
    _validate_tx_hash(tx_hash)

    result = await _rpc_call("eth_getTransactionReceipt", [tx_hash])
    receipt = result["result"]

    if receipt is None:
        return {
            "found": False,
            "status": "pending",
            "block_number": None,
            "to": None,
            "error": "",
        }

    status_hex = receipt.get("status")
    status_map = {"0x1": "success", "0x0": "failed"}
    block_number = int(receipt["blockNumber"], 16) if receipt.get("blockNumber") else None

    return {
        "found": True,
        "status": status_map.get(status_hex, "unknown"),
        "block_number": block_number,
        "to": receipt.get("to"),
        "error": "" if status_hex == "0x1" else f"Transaction reverted (status={status_hex})",
    }


async def verify_usdc_transfer(
    tx_hash: str,
    expected_from: str,
    expected_to: str,
    expected_amount_usdc: float,
) -> dict:
    """
    Verify a USDC transfer on Base chain.

    Returns::

        {"verified": bool, "amount": float, "error": str}

    Raises *ValueError* for malformed inputs, *RPCError* on network failure.
    """
    _validate_tx_hash(tx_hash)

    result = await _rpc_call("eth_getTransactionReceipt", [tx_hash])
    receipt = result["result"]

    if receipt is None:
        return {
            "verified": False,
            "error": "Transaction receipt not available. The transaction may still be pending.",
            "amount": 0,
        }

    # Check tx was successful
    if receipt.get("status") != "0x1":
        return {
            "verified": False,
            "error": (
                "Transaction failed on-chain (status="
                f"{receipt.get('status')}). The transfer was reverted."
            ),
            "amount": 0,
        }

    # Check it was sent to the USDC contract
    if (receipt.get("to") or "").lower() != USDC_CONTRACT.lower():
        return {
            "verified": False,
            "error": (
                f"Transaction target is {receipt.get('to')}, not the USDC contract "
                f"({USDC_CONTRACT}). This is not a USDC transfer."
            ),
            "amount": 0,
        }

    # Parse Transfer event logs
    # Transfer(address,address,uint256) topic
    TRANSFER_TOPIC = (
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    )

    for log in receipt.get("logs", []):
        topics = log.get("topics", [])
        if len(topics) != 3 or topics[0] != TRANSFER_TOPIC:
            continue

        from_addr = "0x" + topics[1][26:]
        to_addr = "0x" + topics[2][26:]
        amount_wei = int(log.get("data", "0x0"), 16)
        amount_usdc = amount_wei / (10 ** USDC_DECIMALS)

        if from_addr.lower() != expected_from.lower():
            continue
        if to_addr.lower() != expected_to.lower():
            continue

        if amount_usdc >= expected_amount_usdc * TOLERANCE:
            return {"verified": True, "amount": amount_usdc, "error": ""}
        else:
            return {
                "verified": False,
                "error": (
                    f"Amount mismatch: expected ≥{expected_amount_usdc:.6f} USDC, "
                    f"got {amount_usdc:.6f} USDC."
                ),
                "amount": amount_usdc,
            }

    return {
        "verified": False,
        "error": (
            "No matching USDC Transfer event found in transaction logs. "
            f"Expected from={expected_from}, to={expected_to}."
        ),
        "amount": 0,
    }


def calculate_payment(total_usdc: float) -> dict:
    """Calculate payment split between creator and platform."""
    platform_fee = total_usdc * PLATFORM_FEE_PERCENT / 100
    creator_receives = total_usdc - platform_fee
    return {
        "total_usdc": round(total_usdc, 6),
        "platform_fee_usdc": round(platform_fee, 6),
        "creator_receives_usdc": round(creator_receives, 6),
        "fee_percent": PLATFORM_FEE_PERCENT,
    }

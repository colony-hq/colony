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

import httpx
import json

# Base chain config
BASE_CHAIN_ID = 8453
BASE_RPC_URL = "https://mainnet.base.org"
USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# Platform wallet (receives 20% fee)
PLATFORM_WALLET = "0x0000000000000000000000000000000000000000"  # Set this
PLATFORM_FEE_PERCENT = 20


async def get_usdc_balance(wallet_address: str) -> float:
    """Get USDC balance for a wallet on Base chain."""
    # balanceOf(address) selector
    data = "0x70a08231" + wallet_address[2:].lower().zfill(64)
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{"to": USDC_CONTRACT, "data": data}, "latest"],
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(BASE_RPC_URL, json=payload, timeout=10)
            result = resp.json()
            if "result" in result:
                balance_wei = int(result["result"], 16)
                return balance_wei / 1_000_000  # USDC has 6 decimals
    except Exception:
        pass
    return 0.0


async def verify_usdc_transfer(
    tx_hash: str,
    expected_from: str,
    expected_to: str,
    expected_amount_usdc: float,
) -> dict:
    """
    Verify a USDC transfer on Base chain.
    Returns {"verified": True/False, "amount": actual_amount, "error": str}
    """
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getTransactionReceipt",
        "params": [tx_hash],
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(BASE_RPC_URL, json=payload, timeout=10)
            result = resp.json()

            if "result" not in result or result["result"] is None:
                return {"verified": False, "error": "Transaction not found", "amount": 0}

            receipt = result["result"]

            # Check tx was successful
            if receipt.get("status") != "0x1":
                return {"verified": False, "error": "Transaction failed", "amount": 0}

            # Check it was sent to USDC contract
            if receipt.get("to", "").lower() != USDC_CONTRACT.lower():
                return {"verified": False, "error": "Not a USDC transfer", "amount": 0}

            # Parse Transfer event logs
            # Transfer(address,address,uint256) = 0xddf252ad...
            transfer_topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

            for log in receipt.get("logs", []):
                topics = log.get("topics", [])
                if len(topics) == 3 and topics[0] == transfer_topic:
                    from_addr = "0x" + topics[1][26:]
                    to_addr = "0x" + topics[2][26:]
                    amount_wei = int(log.get("data", "0x0"), 16)
                    amount_usdc = amount_wei / 1_000_000

                    if from_addr.lower() == expected_from.lower() and to_addr.lower() == expected_to.lower():
                        if amount_usdc >= expected_amount_usdc * 0.99:  # 1% tolerance
                            return {"verified": True, "amount": amount_usdc, "error": ""}
                        else:
                            return {"verified": False, "error": f"Amount mismatch: expected {expected_amount_usdc}, got {amount_usdc}", "amount": amount_usdc}

            return {"verified": False, "error": "Transfer event not found", "amount": 0}

    except Exception as e:
        return {"verified": False, "error": str(e), "amount": 0}


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

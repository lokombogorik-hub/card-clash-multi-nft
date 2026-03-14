# backend/routers/cases.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database.session import get_db
from api.users import get_current_user
from database.models.user import User
from pydantic import BaseModel
from typing import List, Optional
import random
import httpx

router = APIRouter(prefix="/api/cases", tags=["cases"])

# ============================================================
# PRE-MINTED POOL CONFIGURATION
# 4 wallets, each holds NFTs of specific rarity
# ============================================================

NFT_CONTRACT_ID = "cardclash-nft.near"  # TODO: replace with real contract

RARITY_POOLS = {
    "common": {
        "wallet": "common-nft.near",
        "weight": 55,  # 55% chance in mixed cases
    },
    "rare": {
        "wallet": "rare-nfts.near",
        "weight": 30,  # 30% chance
    },
    "epic": {
        "wallet": "epic-nft.near",
        "weight": 12,  # 12% chance
    },
    "legendary": {
        "wallet": "legendary-nft.near",
        "weight": 3,  # 3% chance
    },
}

# Case definitions
CASES = {
    "starter": {
        "price": 0.1,
        "card_count": 1,
        "rarity_mode": "mixed",  # uses weights above
    },
    "premium": {
        "price": 2,
        "card_count": 5,
        "rarity_mode": "mixed",
    },
    "legendary": {
        "price": 5,
        "card_count": 5,
        "rarity_mode": "epic",  # guaranteed epic
    },
    "ultimate": {
        "price": 10,
        "card_count": 5,
        "rarity_mode": "legendary",  # guaranteed legendary
    },
}

# Track reserved tokens (in production use Redis/DB)
reserved_tokens: dict = {}  # user_id -> [token_ids]


class OpenCaseRequest(BaseModel):
    case_id: str
    tx_hash: str


class ClaimNFTRequest(BaseModel):
    token_ids: List[str]


async def get_pool_tokens(wallet: str) -> List[str]:
    """Fetch available NFT token_ids from pool wallet"""
    try:
        # NEAR RPC call to get NFTs owned by pool wallet
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://rpc.mainnet.near.org",
                json={
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "query",
                    "params": {
                        "request_type": "call_function",
                        "finality": "final",
                        "account_id": NFT_CONTRACT_ID,
                        "method_name": "nft_tokens_for_owner",
                        "args_base64": __import__('base64').b64encode(
                            __import__('json').dumps({
                                "account_id": wallet,
                                "limit": 100
                            }).encode()
                        ).decode()
                    }
                }
            )
            data = resp.json()
            if "result" in data and "result" in data["result"]:
                import base64
                import json
                result_bytes = bytes(data["result"]["result"])
                tokens = json.loads(result_bytes.decode())
                return [t.get("token_id") for t in tokens if t.get("token_id")]
    except Exception as e:
        print(f"[CASES] Error fetching pool tokens from {wallet}: {e}")

    return []


def pick_rarity(mode: str) -> str:
    """Pick rarity based on mode"""
    if mode in RARITY_POOLS:
        # Guaranteed rarity
        return mode

    # Mixed mode - use weights
    rarities = list(RARITY_POOLS.keys())
    weights = [RARITY_POOLS[r]["weight"] for r in rarities]
    return random.choices(rarities, weights=weights)[0]


@router.post("/open")
async def open_case(
        data: OpenCaseRequest,
        user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_db),
):
    """Open a case and reserve NFTs from pool"""

    # Validate case
    case = CASES.get(data.case_id)
    if not case:
        raise HTTPException(400, f"Unknown case_id: {data.case_id}")

    # Validate tx_hash (basic check)
    if not data.tx_hash or len(data.tx_hash) < 10:
        raise HTTPException(400, "Invalid tx_hash")

    # TODO: Verify tx_hash on-chain:
    # - Check it's a transfer to treasury
    # - Check amount matches case price
    # - Check it's not already used

    card_count = case["card_count"]
    rarity_mode = case["rarity_mode"]

    reserved = []

    for _ in range(card_count):
        rarity = pick_rarity(rarity_mode)
        pool_wallet = RARITY_POOLS[rarity]["wallet"]

        # Get available tokens from pool
        available = await get_pool_tokens(pool_wallet)

        # Filter out already reserved tokens
        all_reserved = set()
        for tokens in reserved_tokens.values():
            all_reserved.update(tokens)

        available = [t for t in available if t not in all_reserved]

        if not available:
            # Fallback: no tokens available in this pool
            # In production: either fail or try lower rarity
            reserved.append({
                "token_id": None,
                "rarity": rarity,
                "pool_wallet": pool_wallet,
                "error": "No tokens available in pool",
            })
            continue

        # Pick random token
        token_id = random.choice(available)

        reserved.append({
            "token_id": token_id,
            "rarity": rarity,
            "pool_wallet": pool_wallet,
            "contract_id": NFT_CONTRACT_ID,
        })

    # Store reservation
    user_id = str(user.id)
    if user_id not in reserved_tokens:
        reserved_tokens[user_id] = []

    for r in reserved:
        if r.get("token_id"):
            reserved_tokens[user_id].append(r["token_id"])

    print(f"[CASES] User {user_id} opened {data.case_id}, reserved: {[r.get('token_id') for r in reserved]}")

    return {
        "success": True,
        "case_id": data.case_id,
        "cards": reserved,
        "tx_hash": data.tx_hash,
        "claim_instructions": "Call /api/cases/claim with token_ids to receive NFTs",
    }


@router.post("/claim")
async def claim_nft(
        data: ClaimNFTRequest,
        user: User = Depends(get_current_user),
):
    """
    Claim reserved NFTs.

    NOTE: This returns transaction data for frontend to sign.
    The actual transfer must be signed by pool wallet.

    For production, you need one of:
    1. Backend has signing keys for pool wallets
    2. Pool wallets have approved backend to transfer
    3. Use a claim contract that handles distribution
    """

    user_id = str(user.id)
    user_reserved = reserved_tokens.get(user_id, [])

    # Validate all requested tokens are reserved by this user
    for token_id in data.token_ids:
        if token_id not in user_reserved:
            raise HTTPException(400, f"Token {token_id} not reserved for you")

    near_account = getattr(user, "near_account_id", None)
    if not near_account:
        raise HTTPException(400, "NEAR wallet not linked. Connect wallet first.")

    # Build transfer transactions
    # NOTE: These need to be signed by pool wallets, not user
    transactions = []

    for token_id in data.token_ids:
        # Find which pool has this token
        # In production, store this in reservation data
        transactions.append({
            "token_id": token_id,
            "receiver_id": near_account,
            "contract_id": NFT_CONTRACT_ID,
            "status": "pending_transfer",
        })

    # Remove from reserved
    for token_id in data.token_ids:
        if token_id in user_reserved:
            user_reserved.remove(token_id)

    reserved_tokens[user_id] = user_reserved

    # TODO: Actually execute transfers from pool wallets
    # This requires backend to have signing keys or use a distribution contract

    return {
        "success": True,
        "claimed": transactions,
        "message": "NFTs will be transferred to your wallet",
        "note": "Transfer pending - pool wallet signature required",
    }


@router.get("/pools")
async def get_pool_status():
    """Get current pool status (for admin/debug)"""

    status = {}

    for rarity, config in RARITY_POOLS.items():
        wallet = config["wallet"]
        tokens = await get_pool_tokens(wallet)
        status[rarity] = {
            "wallet": wallet,
            "available": len(tokens),
            "sample": tokens[:5] if tokens else [],
        }

    return {
        "contract_id": NFT_CONTRACT_ID,
        "pools": status,
        "total_reserved": sum(len(t) for t in reserved_tokens.values()),
    }
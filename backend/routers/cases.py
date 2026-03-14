# backend/routers/cases.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database.session import get_db
from api.users import get_current_user
from database.models.user import User
from pydantic import BaseModel
from typing import List, Dict, Optional
import random
import httpx
import os
import json
import base64

router = APIRouter(prefix="/api/cases", tags=["cases"])

# ============================================================
# CONFIGURATION - Set these in Railway env variables
# ============================================================

# NFT Contract where cards are minted
NFT_CONTRACT_ID = os.getenv("NFT_CONTRACT_ID", "")

# Treasury wallet that receives payments
TREASURY_WALLET = os.getenv("TREASURY_WALLET", "retardo-s.near")

# Pool wallets - each holds NFTs of specific rarity
POOL_WALLETS = {
    "common": os.getenv("POOL_WALLET_COMMON", "common-nft.near"),
    "rare": os.getenv("POOL_WALLET_RARE", "rare-nfts.near"),
    "epic": os.getenv("POOL_WALLET_EPIC", "epic-nft.near"),
    "legendary": os.getenv("POOL_WALLET_LEGENDARY", "legendary-nft.near"),
}

# Pool private keys (function call access keys)
# Format: ed25519:base58privatekey
POOL_KEYS = {
    "common": os.getenv("POOL_KEY_COMMON", ""),
    "rare": os.getenv("POOL_KEY_RARE", ""),
    "epic": os.getenv("POOL_KEY_EPIC", ""),
    "legendary": os.getenv("POOL_KEY_LEGENDARY", ""),
}

# Rarity weights for mixed cases
RARITY_WEIGHTS = {
    "common": 55,
    "rare": 30,
    "epic": 12,
    "legendary": 3,
}

# Case definitions
CASES = {
    "starter": {
        "price": 0.1,
        "card_count": 1,
        "rarity_mode": "mixed",
        "description": "1 random card",
    },
    "premium": {
        "price": 2,
        "card_count": 5,
        "rarity_mode": "mixed",
        "description": "5 random cards",
    },
    "legendary": {
        "price": 5,
        "card_count": 5,
        "rarity_mode": "epic",
        "description": "5 epic cards guaranteed",
    },
    "ultimate": {
        "price": 10,
        "card_count": 5,
        "rarity_mode": "legendary",
        "description": "5 legendary cards guaranteed",
    },
}

# In-memory reservation storage
# In production: use Redis or database
reserved_tokens: Dict[str, List[dict]] = {}
used_tx_hashes: set = set()


class OpenCaseRequest(BaseModel):
    case_id: str
    tx_hash: str


class ClaimNFTRequest(BaseModel):
    reservation_id: Optional[str] = None


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def is_configured() -> bool:
    """Check if pool system is configured"""
    return bool(NFT_CONTRACT_ID) and any(POOL_KEYS.values())


def get_config_status() -> dict:
    """Get configuration status for debugging"""
    return {
        "nft_contract": NFT_CONTRACT_ID or "NOT SET",
        "treasury": TREASURY_WALLET,
        "pools_configured": {
            rarity: bool(POOL_KEYS.get(rarity))
            for rarity in RARITY_WEIGHTS.keys()
        },
        "ready": is_configured(),
    }


async def fetch_pool_tokens(wallet: str) -> List[str]:
    """Fetch NFT token_ids owned by pool wallet"""

    if not NFT_CONTRACT_ID:
        return []

    try:
        args = json.dumps({"account_id": wallet, "limit": 100})
        args_base64 = base64.b64encode(args.encode()).decode()

        async with httpx.AsyncClient(timeout=15) as client:
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
                        "args_base64": args_base64,
                    }
                }
            )

            data = resp.json()

            if "result" in data and "result" in data["result"]:
                result_bytes = bytes(data["result"]["result"])
                tokens = json.loads(result_bytes.decode())
                return [t.get("token_id") for t in tokens if t.get("token_id")]

    except Exception as e:
        print(f"[CASES] Error fetching tokens from {wallet}: {e}")

    return []


async def transfer_nft(from_wallet: str, to_wallet: str, token_id: str, pool_key: str) -> dict:
    """
    Transfer NFT from pool wallet to user wallet.

    NOTE: This requires py-near or similar library for signing.
    For now returns mock success - implement actual signing when keys are ready.
    """

    if not pool_key:
        return {
            "success": False,
            "error": "Pool key not configured",
            "token_id": token_id,
        }

    # TODO: Implement actual NEAR transaction signing
    #
    # When you have py-near installed:
    #
    # from py_near.account import Account
    #
    # account = Account(from_wallet, pool_key)
    # result = await account.function_call(
    #     NFT_CONTRACT_ID,
    #     "nft_transfer",
    #     {
    #         "receiver_id": to_wallet,
    #         "token_id": token_id,
    #     },
    #     gas=30_000_000_000_000,
    #     deposit=1,
    # )
    # return {"success": True, "tx_hash": result.transaction.hash}

    print(f"[CASES] MOCK TRANSFER: {token_id} from {from_wallet} to {to_wallet}")

    return {
        "success": True,
        "mock": True,
        "token_id": token_id,
        "from": from_wallet,
        "to": to_wallet,
        "message": "Transfer will work when POOL_KEY is configured",
    }


def pick_rarity(mode: str) -> str:
    """Pick rarity based on mode"""
    if mode in RARITY_WEIGHTS:
        return mode

    rarities = list(RARITY_WEIGHTS.keys())
    weights = [RARITY_WEIGHTS[r] for r in rarities]
    return random.choices(rarities, weights=weights)[0]


def generate_mock_token_id(rarity: str) -> str:
    """Generate mock token_id for testing when pools not configured"""
    rarity_ranges = {
        "legendary": (1, 250),
        "epic": (251, 1000),
        "rare": (1001, 3500),
        "common": (3501, 10000),
    }

    min_id, max_id = rarity_ranges.get(rarity, (1, 10000))
    num = random.randint(min_id, max_id)
    return f"card_{num:05d}"


# ============================================================
# API ENDPOINTS
# ============================================================

@router.get("/config")
async def get_config():
    """Get cases configuration status"""
    return {
        "cases": CASES,
        "config": get_config_status(),
        "rarity_weights": RARITY_WEIGHTS,
    }


@router.get("/pools")
async def get_pools_status():
    """Get pool wallets status"""

    pools = {}

    for rarity, wallet in POOL_WALLETS.items():
        tokens = await fetch_pool_tokens(wallet)
        pools[rarity] = {
            "wallet": wallet,
            "available": len(tokens),
            "configured": bool(POOL_KEYS.get(rarity)),
            "sample_tokens": tokens[:5] if tokens else [],
        }

    return {
        "nft_contract": NFT_CONTRACT_ID or "NOT SET",
        "pools": pools,
        "ready": is_configured(),
    }


@router.post("/open")
async def open_case(
        data: OpenCaseRequest,
        user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_db),
):
    """Open a case and get cards"""

    # Validate case
    case = CASES.get(data.case_id)
    if not case:
        raise HTTPException(400, f"Unknown case_id: {data.case_id}")

    # Validate tx_hash
    if not data.tx_hash or len(data.tx_hash) < 10:
        raise HTTPException(400, "Invalid tx_hash")

    # Check tx not already used
    if data.tx_hash in used_tx_hashes:
        raise HTTPException(400, "Transaction already used")

    used_tx_hashes.add(data.tx_hash)

    # TODO: Verify tx on-chain:
    # - Check transfer to TREASURY_WALLET
    # - Check amount >= case price
    # For MVP we trust the tx_hash

    user_id = str(user.id)
    card_count = case["card_count"]
    rarity_mode = case["rarity_mode"]

    cards = []

    for _ in range(card_count):
        rarity = pick_rarity(rarity_mode)
        pool_wallet = POOL_WALLETS[rarity]
        pool_key = POOL_KEYS.get(rarity, "")

        token_id = None
        from_pool = False

        # Try to get real token from pool
        if is_configured():
            available = await fetch_pool_tokens(pool_wallet)

            # Filter reserved tokens
            all_reserved = set()
            for res_list in reserved_tokens.values():
                for res in res_list:
                    all_reserved.add(res.get("token_id"))

            available = [t for t in available if t not in all_reserved]

            if available:
                token_id = random.choice(available)
                from_pool = True

        # Fallback to mock token
        if not token_id:
            token_id = generate_mock_token_id(rarity)
            from_pool = False

        cards.append({
            "token_id": token_id,
            "rarity": rarity,
            "pool_wallet": pool_wallet,
            "from_pool": from_pool,
            "contract_id": NFT_CONTRACT_ID or "mock",
        })

    # Store reservation
    reservation_id = f"{user_id}_{data.tx_hash[:8]}"

    reserved_tokens[reservation_id] = cards

    # Get user's NEAR wallet
    near_account = getattr(user, "near_account_id", None)

    # If wallet connected and pools configured - auto transfer
    transfers = []
    if near_account and is_configured():
        for card in cards:
            if card["from_pool"]:
                rarity = card["rarity"]
                result = await transfer_nft(
                    from_wallet=card["pool_wallet"],
                    to_wallet=near_account,
                    token_id=card["token_id"],
                    pool_key=POOL_KEYS.get(rarity, ""),
                )
                transfers.append(result)

    print(f"[CASES] User {user_id} opened {data.case_id}: {[c['token_id'] for c in cards]}")

    return {
        "success": True,
        "case_id": data.case_id,
        "cards": cards,
        "reservation_id": reservation_id,
        "tx_hash": data.tx_hash,
        "transfers": transfers if transfers else None,
        "config_ready": is_configured(),
        "message": "Cards received!" if is_configured() else "Cards reserved (transfers will work when pools are configured)",
    }


@router.post("/claim")
async def claim_reserved(
        data: ClaimNFTRequest,
        user: User = Depends(get_current_user),
):
    """Claim reserved NFTs (if not auto-transferred)"""

    near_account = getattr(user, "near_account_id", None)
    if not near_account:
        raise HTTPException(400, "Connect NEAR wallet first")

    if not is_configured():
        raise HTTPException(400, "Pool system not configured yet. Cards will be delivered when ready.")

    user_id = str(user.id)

    # Find user's reservations
    user_reservations = {
        k: v for k, v in reserved_tokens.items()
        if k.startswith(user_id)
    }

    if not user_reservations:
        raise HTTPException(400, "No reserved cards found")

    transfers = []

    for res_id, cards in user_reservations.items():
        for card in cards:
            if card.get("from_pool"):
                rarity = card["rarity"]
                result = await transfer_nft(
                    from_wallet=card["pool_wallet"],
                    to_wallet=near_account,
                    token_id=card["token_id"],
                    pool_key=POOL_KEYS.get(rarity, ""),
                )
                transfers.append(result)

        # Clear reservation
        del reserved_tokens[res_id]

    return {
        "success": True,
        "transfers": transfers,
        "message": f"Claimed {len(transfers)} cards",
    }
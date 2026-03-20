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
# CONFIGURATION
# ============================================================

NFT_CONTRACT_ID = os.getenv("NFT_CONTRACT_ID", "")
TREASURY_WALLET = os.getenv("TREASURY_WALLET", "retardo-s.near")

POOL_WALLETS = {
    "common": os.getenv("POOL_WALLET_COMMON", "common-nft.near"),
    "rare": os.getenv("POOL_WALLET_RARE", "rare-nfts.near"),
    "epic": os.getenv("POOL_WALLET_EPIC", "epic-nft.near"),
    "legendary": os.getenv("POOL_WALLET_LEGENDARY", "legendary-nft.near"),
}

POOL_KEYS = {
    "common": os.getenv("POOL_KEY_COMMON", ""),
    "rare": os.getenv("POOL_KEY_RARE", ""),
    "epic": os.getenv("POOL_KEY_EPIC", ""),
    "legendary": os.getenv("POOL_KEY_LEGENDARY", ""),
}

RARITY_WEIGHTS = {
    "common": 55,
    "rare": 30,
    "epic": 12,
    "legendary": 3,
}

CASES = {
    "starter": {"price": 0.1, "card_count": 1, "rarity_mode": "mixed"},
    "premium": {"price": 2, "card_count": 5, "rarity_mode": "mixed"},
    "legendary": {"price": 5, "card_count": 5, "rarity_mode": "epic"},
    "ultimate": {"price": 10, "card_count": 5, "rarity_mode": "legendary"},
}

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
    return bool(NFT_CONTRACT_ID) and any(POOL_KEYS.values())


async def fetch_pool_tokens(wallet: str) -> List[str]:
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


async def transfer_nft(from_wallet: str, to_wallet: str, token_id: str, private_key: str) -> dict:
    """Transfer NFT using py-near"""

    if not private_key:
        return {
            "success": False,
            "error": "Pool key not configured",
            "mock": True,
        }

    try:
        from py_near.account import Account
        import asyncio

        # Initialize account with private key
        account = Account(from_wallet, private_key)

        # Call nft_transfer
        result = await account.function_call(
            NFT_CONTRACT_ID,
            "nft_transfer",
            {
                "receiver_id": to_wallet,
                "token_id": token_id,
            },
            gas=30_000_000_000_000,  # 30 TGas
            deposit=1,  # 1 yoctoNEAR required for transfer
        )

        tx_hash = ""
        if hasattr(result, "transaction") and hasattr(result.transaction, "hash"):
            tx_hash = result.transaction.hash
        elif hasattr(result, "transaction_outcome") and hasattr(result.transaction_outcome, "id"):
            tx_hash = result.transaction_outcome.id

        print(f"[CASES] Transferred {token_id} from {from_wallet} to {to_wallet}, tx: {tx_hash}")

        return {
            "success": True,
            "tx_hash": tx_hash,
            "token_id": token_id,
        }

    except Exception as e:
        print(f"[CASES] Transfer error: {e}")
        return {
            "success": False,
            "error": str(e),
        }


def pick_rarity(mode: str) -> str:
    if mode in RARITY_WEIGHTS:
        return mode

    rarities = list(RARITY_WEIGHTS.keys())
    weights = [RARITY_WEIGHTS[r] for r in rarities]
    return random.choices(rarities, weights=weights)[0]


def generate_mock_token_id(rarity: str) -> str:
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
    return {
        "cases": CASES,
        "configured": is_configured(),
        "nft_contract": NFT_CONTRACT_ID or "NOT SET",
        "pools": {r: {"wallet": w, "has_key": bool(POOL_KEYS.get(r))} for r, w in POOL_WALLETS.items()},
    }


@router.get("/pools")
async def get_pools_status():
    pools = {}

    for rarity, wallet in POOL_WALLETS.items():
        tokens = await fetch_pool_tokens(wallet)
        pools[rarity] = {
            "wallet": wallet,
            "available": len(tokens),
            "configured": bool(POOL_KEYS.get(rarity)),
            "sample_tokens": tokens[:3] if tokens else [],
        }

    return {
        "nft_contract": NFT_CONTRACT_ID or "NOT SET",
        "pools": pools,
        "ready": is_configured(),
    }


@router.post("/open")
async def fetch_token_metadata(token_id: str) -> dict:
    """Получить метадату NFT токена (включая картинку)"""
    if not NFT_CONTRACT_ID:
        return {}

    try:
        args = json.dumps({"token_id": token_id})
        args_base64 = base64.b64encode(args.encode()).decode()

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
                        "method_name": "nft_token",
                        "args_base64": args_base64,
                    }
                }
            )

            data = resp.json()
            if "result" in data and "result" in data["result"]:
                result_bytes = bytes(data["result"]["result"])
                token = json.loads(result_bytes.decode())
                if token and "metadata" in token:
                    return token["metadata"]
    except Exception as e:
        print(f"[CASES] Error fetching metadata for {token_id}: {e}")

    return {}


@router.post("/open")
async def open_case(
        data: OpenCaseRequest,
        user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_db),
):
    case = CASES.get(data.case_id)
    if not case:
        raise HTTPException(400, f"Unknown case_id: {data.case_id}")

    if not data.tx_hash or len(data.tx_hash) < 10:
        raise HTTPException(400, "Invalid tx_hash")

    if data.tx_hash in used_tx_hashes:
        raise HTTPException(400, "Transaction already used")

    used_tx_hashes.add(data.tx_hash)

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

        if is_configured() and pool_key:
            available = await fetch_pool_tokens(pool_wallet)

            all_reserved = set()
            for res_list in reserved_tokens.values():
                for res in res_list:
                    all_reserved.add(res.get("token_id"))

            available = [t for t in available if t not in all_reserved]

            if available:
                token_id = random.choice(available)
                from_pool = True

        if not token_id:
            token_id = generate_mock_token_id(rarity)
            from_pool = False

        # Получаем метадату для картинки
        image_url = None
        title = None
        if from_pool and NFT_CONTRACT_ID:
            try:
                meta = await fetch_token_metadata(token_id)
                raw_media = meta.get("media", "")
                title = meta.get("title") or None

                # Обрабатываем IPFS ссылки
                if raw_media:
                    if raw_media.startswith("ipfs://"):
                        cid = raw_media.replace("ipfs://", "")
                        image_url = f"https://ipfs.io/ipfs/{cid}"
                    elif raw_media.startswith("http"):
                        image_url = raw_media
                    else:
                        # Может быть просто CID
                        image_url = f"https://ipfs.io/ipfs/{raw_media}"
            except Exception as e:
                print(f"[CASES] Metadata fetch failed for {token_id}: {e}")

        cards.append({
            "token_id": token_id,
            "rarity": rarity,
            "pool_wallet": pool_wallet,
            "from_pool": from_pool,
            "contract_id": NFT_CONTRACT_ID or "mock",
            "image_url": image_url,
            "imageUrl": image_url,
            "title": title or f"Card #{token_id}",
            "name": title or f"Card #{token_id}",
        })

    reservation_id = f"{user_id}_{data.tx_hash[:8]}"
    reserved_tokens[reservation_id] = cards

    near_account = getattr(user, "near_account_id", None)

    transfers = []
    if near_account and is_configured():
        for card in cards:
            if card["from_pool"]:
                rarity = card["rarity"]
                result = await transfer_nft(
                    from_wallet=card["pool_wallet"],
                    to_wallet=near_account,
                    token_id=card["token_id"],
                    private_key=POOL_KEYS.get(rarity, ""),
                )
                transfers.append(result)
                card["transferred"] = result.get("success", False)

    print(f"[CASES] User {user_id} opened {data.case_id}: {[c['token_id'] for c in cards]}")

    return {
        "success": True,
        "case_id": data.case_id,
        "cards": cards,
        "reservation_id": reservation_id,
        "tx_hash": data.tx_hash,
        "transfers": transfers if transfers else None,
        "config_ready": is_configured(),
    }

@router.post("/claim")
async def claim_reserved(
        data: ClaimNFTRequest,
        user: User = Depends(get_current_user),
):
    near_account = getattr(user, "near_account_id", None)
    if not near_account:
        raise HTTPException(400, "Connect NEAR wallet first")

    if not is_configured():
        raise HTTPException(400, "Pool system not configured yet")

    user_id = str(user.id)

    user_reservations = {
        k: v for k, v in reserved_tokens.items()
        if k.startswith(user_id)
    }

    if not user_reservations:
        raise HTTPException(400, "No reserved cards found")

    transfers = []

    for res_id, cards in user_reservations.items():
        for card in cards:
            if card.get("from_pool") and not card.get("transferred"):
                rarity = card["rarity"]
                result = await transfer_nft(
                    from_wallet=card["pool_wallet"],
                    to_wallet=near_account,
                    token_id=card["token_id"],
                    private_key=POOL_KEYS.get(rarity, ""),
                )
                transfers.append(result)

        del reserved_tokens[res_id]

    return {
        "success": True,
        "transfers": transfers,
        "message": f"Claimed {len(transfers)} cards",
    }
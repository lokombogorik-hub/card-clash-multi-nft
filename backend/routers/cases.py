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


class OpenCaseRequest(BaseModel):
    case_id: str
    tx_hash: str


class ClaimNFTRequest(BaseModel):
    reservation_id: Optional[str] = None


NFT_CONTRACT_ID = os.getenv("NFT_CONTRACT_ID", "")
TREASURY_WALLET = os.getenv("TREASURY_WALLET", "retardo-s.near")

# IPFS gateway для картинок коллекции
IPFS_BASE = "https://bafybeibqzbodfn3xczppxh2k2ek3bgvojhivqy4ntbkprcxesulth3yy5e.ipfs.w3s.link"

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
    "starter": {"price": 0.1, "card_count": 1, "rarity_mode": "common"},
    "premium": {"price": 0.1, "card_count": 1, "rarity_mode": "rare"},
    "legendary": {"price": 0.1, "card_count": 1, "rarity_mode": "epic"},
    "ultimate": {"price": 0.1, "card_count": 1, "rarity_mode": "legendary"},
}

reserved_tokens: Dict[str, List[dict]] = {}
used_tx_hashes: set = set()
_account_cache: Dict[str, object] = {}

# Кэш для инвентаря пулов (обновляется раз в 30 секунд)
_pool_inventory_cache: Dict[str, int] = {}
_pool_inventory_cache_time: float = 0


async def get_pool_account(wallet: str, private_key: str):
    if wallet in _account_cache:
        return _account_cache[wallet]
    from py_near.account import Account
    account = Account(
        account_id=wallet,
        private_key=private_key,
        rpc_addr="https://rpc.mainnet.near.org"
    )
    await account.startup()
    _account_cache[wallet] = account
    return account


def is_configured() -> bool:
    return bool(NFT_CONTRACT_ID) and any(POOL_KEYS.values())


def get_image_url(token_id: str) -> tuple:
    """Быстро строим URL картинки без RPC запроса"""
    try:
        # Убираем префикс card_ если есть
        clean_id = token_id.replace("card_", "").lstrip("0")
        nft_number = int(clean_id)
        image_url = f"{IPFS_BASE}/{nft_number}.png"
        title = f"BUNNY #{nft_number}"
        return image_url, title
    except (ValueError, TypeError):
        return None, f"Card #{token_id}"


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
                    "jsonrpc": "2.0", "id": "1", "method": "query",
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
            print(f"[POOL] wallet={wallet} status={resp.status_code}")

            if "error" in data:
                print(f"[POOL] RPC error: {data['error']}")
                return []

            if "result" in data and "result" in data["result"]:
                result_bytes = bytes(data["result"]["result"])
                tokens = json.loads(result_bytes.decode())
                print(f"[POOL] wallet={wallet} found {len(tokens)} tokens: {[t.get('token_id') for t in tokens[:5]]}")
                return [t.get("token_id") for t in tokens if t.get("token_id")]
            else:
                print(f"[POOL] unexpected response: {data}")
                return []
    except Exception as e:
        print(f"[POOL] Exception for {wallet}: {type(e).__name__}: {e}")
        return []


async def get_active_reserved_tokens() -> set:
    """Получить множество всех активно зарезервированных токенов"""
    active_reserved = set()
    for res_id, res_list in reserved_tokens.items():
        for res in res_list:
            if not res.get("transferred", False):
                active_reserved.add(res.get("token_id"))
    return active_reserved


async def get_pool_inventory_cached() -> Dict[str, int]:
    """Получить количество доступных NFT в каждом пуле с кэшированием"""
    global _pool_inventory_cache, _pool_inventory_cache_time

    import time
    current_time = time.time()

    # Обновляем кэш каждые 30 секунд
    if current_time - _pool_inventory_cache_time > 30 or not _pool_inventory_cache:
        print("[INVENTORY] Updating cache...")
        inventory = {}

        # Получаем активные резервации
        active_reserved = await get_active_reserved_tokens()

        for rarity, wallet in POOL_WALLETS.items():
            tokens = await fetch_pool_tokens(wallet)
            # Отфильтровываем зарезервированные токены
            available = [t for t in tokens if t not in active_reserved]
            inventory[rarity] = len(available)
            print(f"[INVENTORY] {rarity}: {len(tokens)} total, {len(available)} available")

        _pool_inventory_cache = inventory
        _pool_inventory_cache_time = current_time
        print(f"[INVENTORY] Cache updated: {inventory}")

    return _pool_inventory_cache.copy()


async def transfer_nft(from_wallet: str, to_wallet: str, token_id: str, private_key: str) -> dict:
    if not private_key:
        return {"success": False, "error": "Pool key not configured", "mock": True}
    try:
        account = await get_pool_account(from_wallet, private_key)
        result = await account.function_call(
            contract_id=NFT_CONTRACT_ID,
            method_name="nft_transfer",
            args={"receiver_id": to_wallet, "token_id": token_id},
            gas=30_000_000_000_000,
            amount=1,
        )
        tx_hash = ""
        if result and hasattr(result, "transaction"):
            tx_hash = getattr(result.transaction, "hash", "")
        elif result and hasattr(result, "transaction_outcome"):
            tx_hash = getattr(result.transaction_outcome, "id", "")
        print(f"[CASES] Transferred {token_id} from {from_wallet} to {to_wallet}, tx: {tx_hash}")

        # Инвалидируем кэш после трансфера
        global _pool_inventory_cache_time
        _pool_inventory_cache_time = 0

        return {"success": True, "tx_hash": tx_hash, "token_id": token_id}
    except Exception as e:
        print(f"[CASES] Transfer error: {type(e).__name__}: {e}")
        return {"success": False, "error": str(e)}


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
    return str(num)


def clear_expired_reservations():
    """Очищаем старые резервации (на всякий случай)"""
    global reserved_tokens
    if len(reserved_tokens) > 100:
        print(f"[CASES] Clearing {len(reserved_tokens)} old reservations")
        reserved_tokens.clear()


@router.get("/inventory")
async def get_cases_inventory():
    """
    Возвращает количество доступных NFT для каждого кейса
    Формат: {"starter": 150, "premium": 80, "legendary": 30, "ultimate": 10}
    """
    try:
        # Получаем инвентарь по редкостям
        rarity_inventory = await get_pool_inventory_cached()

        # Маппим редкости на кейсы
        case_inventory = {}
        for case_id, case_data in CASES.items():
            rarity = case_data["rarity_mode"]
            case_inventory[case_id] = rarity_inventory.get(rarity, 0)

        print(f"[INVENTORY] Cases inventory: {case_inventory}")
        return case_inventory

    except Exception as e:
        print(f"[INVENTORY] Error: {type(e).__name__}: {e}")
        # В случае ошибки возвращаем нули
        return {case_id: 0 for case_id in CASES.keys()}


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
    active_reserved = await get_active_reserved_tokens()

    for rarity, wallet in POOL_WALLETS.items():
        tokens = await fetch_pool_tokens(wallet)
        available = [t for t in tokens if t not in active_reserved]
        pools[rarity] = {
            "wallet": wallet,
            "total": len(tokens),
            "available": len(available),
            "reserved": len(tokens) - len(available),
            "configured": bool(POOL_KEYS.get(rarity)),
            "sample_tokens": available[:3] if available else [],
        }
    return {
        "nft_contract": NFT_CONTRACT_ID or "NOT SET",
        "pools": pools,
        "ready": is_configured(),
        "active_reservations": len(reserved_tokens),
    }


@router.get("/check-balances")
async def check_balances():
    balances = {}
    for rarity, wallet in POOL_WALLETS.items():
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://rpc.mainnet.near.org",
                    json={
                        "jsonrpc": "2.0", "id": "1",
                        "method": "query",
                        "params": {
                            "request_type": "view_account",
                            "finality": "final",
                            "account_id": wallet,
                        }
                    }
                )
                data = resp.json()
                if "result" in data:
                    amount = int(data["result"]["amount"])
                    near = amount / 10 ** 24
                    balances[rarity] = {
                        "wallet": wallet,
                        "balance_near": round(near, 4),
                        "enough": near >= 0.01
                    }
                else:
                    balances[rarity] = {"wallet": wallet, "error": str(data.get("error", "unknown"))}
        except Exception as e:
            balances[rarity] = {"wallet": wallet, "error": str(e)}
    return balances


@router.get("/debug/reservations")
async def debug_reservations():
    """Показать текущие резервации для отладки"""
    return {
        "count": len(reserved_tokens),
        "reservations": {k: [c.get("token_id") for c in v] for k, v in reserved_tokens.items()},
        "used_tx_count": len(used_tx_hashes),
    }


@router.post("/debug/clear-reservations")
async def clear_reservations():
    """Очистить все резервации (для отладки)"""
    global reserved_tokens, _pool_inventory_cache_time
    count = len(reserved_tokens)
    reserved_tokens.clear()
    _pool_inventory_cache_time = 0
    return {"cleared": count, "message": "All reservations cleared"}


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

    # Проверяем доступность NFT перед открытием
    inventory = await get_pool_inventory_cached()
    rarity = case["rarity_mode"]
    available_count = inventory.get(rarity, 0)

    if available_count <= 0:
        raise HTTPException(400, f"No NFTs available for {data.case_id} case (rarity: {rarity})")

    used_tx_hashes.add(data.tx_hash)
    clear_expired_reservations()

    user_id = str(user.id)
    card_count = case["card_count"]
    rarity_mode = case["rarity_mode"]
    cards = []

    near_account = getattr(user, "near_account_id", None)
    print(f"[CASES] Opening {data.case_id} for user={user_id}, near_account={near_account}")

    for _ in range(card_count):
        rarity = pick_rarity(rarity_mode)
        pool_wallet = POOL_WALLETS[rarity]
        pool_key = POOL_KEYS.get(rarity, "")

        token_id = None
        from_pool = False

        print(f"[CASES] Looking for {rarity} token, configured={is_configured()}, has_key={bool(pool_key)}")

        if is_configured() and pool_key:
            available = await fetch_pool_tokens(pool_wallet)
            print(f"[CASES] Pool {pool_wallet} has {len(available)} tokens: {available[:5]}")

            active_reserved = await get_active_reserved_tokens()
            print(f"[CASES] Active reserved tokens: {active_reserved}")

            available = [t for t in available if t not in active_reserved]
            print(f"[CASES] Available after filter: {available}")

            if available:
                token_id = random.choice(available)
                from_pool = True
                print(f"[CASES] Selected token {token_id} from pool")

        if not token_id:
            token_id = generate_mock_token_id(rarity)
            from_pool = False
            print(f"[CASES] Generated mock token {token_id}")

        image_url, title = get_image_url(token_id)

        cards.append({
            "token_id": token_id,
            "rarity": rarity,
            "pool_wallet": pool_wallet,
            "from_pool": from_pool,
            "transferred": False,
            "contract_id": NFT_CONTRACT_ID or "mock",
            "image_url": image_url,
            "imageUrl": image_url,
            "title": title,
            "name": title,
        })

    reservation_id = f"{user_id}_{data.tx_hash[:8]}"

    if any(c.get("from_pool") for c in cards):
        reserved_tokens[reservation_id] = cards
        print(f"[CASES] Reserved {reservation_id}: {[c['token_id'] for c in cards]}")
        # Инвалидируем кэш после резервации
        global _pool_inventory_cache_time
        _pool_inventory_cache_time = 0

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
                print(f"[CASES] Transfer result: {result}")

    pool_cards = [c for c in cards if c.get("from_pool")]
    all_transferred = all(c.get("transferred", False) for c in pool_cards) if pool_cards else True

    if all_transferred and reservation_id in reserved_tokens:
        del reserved_tokens[reservation_id]
        print(f"[CASES] Reservation {reservation_id} cleared after successful transfer")

    print(f"[CASES] Done: {data.case_id} → {[c['token_id'] for c in cards]}")

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
    user_reservations = {k: v for k, v in reserved_tokens.items() if k.startswith(user_id)}

    if not user_reservations:
        raise HTTPException(400, "No reserved cards found")

    transfers = []
    for res_id, cards in list(user_reservations.items()):
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
                card["transferred"] = result.get("success", False)

        if res_id in reserved_tokens:
            del reserved_tokens[res_id]

    return {"success": True, "transfers": transfers, "message": f"Claimed {len(transfers)} cards"}
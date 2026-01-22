from __future__ import annotations

import hashlib
import random
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, status
from pydantic import BaseModel

from api.users import get_current_user
from blockchain.contracts.near_indexer import fetch_nfts_for_owner
from database.models.user import User

router = APIRouter(prefix="/api", tags=["mock-nfts"])

Element = Literal["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"]
Rank = Literal["common", "rare", "epic", "legendary"]

ELEMENTS: List[str] = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"]
ELEM_ICONS = {
    "Earth": "🟫",
    "Fire": "🔥",
    "Water": "💧",
    "Poison": "☠️",
    "Holy": "✨",
    "Thunder": "⚡",
    "Wind": "🌪️",
    "Ice": "❄️",
}
RANKS: List[str] = ["common", "rare", "epic", "legendary"]

# Временное хранилище активных колод (user.id -> list of 5 keys) — override через PUT
_ACTIVE_DECKS: Dict[int, List[str]] = {}


class MockNFT(BaseModel):
    key: str
    chain: str = "near"
    contractId: str = "demo.collection.near"
    tokenId: str
    name: str
    element: str
    elementIcon: str
    rank: str
    rankLabel: str
    stats: dict  # {top, right, bottom, left}
    imageUrl: str | None = None


def _seed_for_user(user_id: int, salt: str) -> int:
    h = hashlib.sha256(f"mock-nfts:v3:{salt}:{user_id}".encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big", signed=False)


def _roll_rank(rng: random.Random) -> str:
    return rng.choices(population=RANKS, weights=[60, 25, 10, 5], k=1)[0]


def _rank_budget(rank: str) -> tuple[int, int]:
    if rank == "common":
        return (1, 6)
    if rank == "rare":
        return (3, 8)
    if rank == "epic":
        return (5, 9)
    return (7, 10)  # legendary


def _gen_inventory_for_user(user_id: int, count: int = 16) -> List[MockNFT]:
    rng = random.Random(_seed_for_user(user_id, "inventory"))
    inv: List[MockNFT] = []

    for i in range(count):
        element: str = rng.choice(ELEMENTS)
        rank: str = _roll_rank(rng)
        lo, hi = _rank_budget(rank)

        stats = {
            "top": rng.randint(lo, hi),
            "right": rng.randint(lo, hi),
            "bottom": rng.randint(lo, hi),
            "left": rng.randint(lo, hi),
        }

        key = f"mock:{user_id}:{i+1:02d}"
        rank_label = {"common": "C", "rare": "R", "epic": "E", "legendary": "L"}[rank]

        inv.append(
            MockNFT(
                key=key,
                chain="near",
                contractId="demo.collection.near",
                tokenId=key,
                name=f"{element} NFT #{i+1:02d}",
                element=element,
                elementIcon=ELEM_ICONS[element],
                rank=rank,
                rankLabel=rank_label,
                stats=stats,
                imageUrl=None,
            )
        )

    return inv


def _get_inventory_map(user_id: int) -> Dict[str, MockNFT]:
    inv = _gen_inventory_for_user(user_id)
    return {n.key: n for n in inv}


def _default_active_deck_keys(user_id: int) -> List[str]:
    inv = _gen_inventory_for_user(user_id, count=16)
    keys = [n.key for n in inv]
    rng = random.Random(_seed_for_user(user_id, "active-deck"))
    return rng.sample(keys, k=5)


def _get_active_deck_keys(user_id: int) -> List[str]:
    overridden = _ACTIVE_DECKS.get(user_id)
    if overridden and isinstance(overridden, list) and len(overridden) == 5:
        return overridden
    return _default_active_deck_keys(user_id)


def _near_key(contract_id: str, token_id: str) -> str:
    return f"near:{contract_id}:{token_id}"


def _rank_from_seed(seed: int) -> str:
    # детерминированный "ранг" из seed
    if seed % 20 == 0:
        return "legendary"
    if seed % 7 == 0:
        return "epic"
    if seed % 3 == 0:
        return "rare"
    return "common"


def _stats_from_seed(seed: int, rank: str) -> dict:
    rng = random.Random(seed)
    lo, hi = _rank_budget(rank)
    return {
        "top": rng.randint(lo, hi),
        "right": rng.randint(lo, hi),
        "bottom": rng.randint(lo, hi),
        "left": rng.randint(lo, hi),
    }


def _element_from_seed(seed: int) -> str:
    rng = random.Random(seed ^ 0xA5A5)
    return rng.choice(ELEMENTS)


async def _near_inventory(account_id: str, limit: int = 30) -> List[MockNFT]:
    """
    Превращаем реальные NEAR NFT в наш формат MockNFT (Stage1).
    Статы/элемент/ранг пока псевдо-детерминированные по contract/token.
    """
    raw = await fetch_nfts_for_owner(account_id, limit=limit)
    items: List[MockNFT] = []

    for it in raw:
        # разные возможные формы из indexer
        contract_id = (
            it.get("contract_id")
            or it.get("contractId")
            or it.get("nft_contract_id")
            or it.get("token_contract")
            or ""
        )
        token_id = it.get("token_id") or it.get("tokenId") or it.get("token") or it.get("id") or ""

        if not contract_id or not token_id:
            continue

        key = _near_key(contract_id, str(token_id))

        # seed
        h = hashlib.sha256(key.encode("utf-8")).digest()
        seed = int.from_bytes(h[:8], "big", signed=False)

        rank = _rank_from_seed(seed)
        rank_label = {"common": "C", "rare": "R", "epic": "E", "legendary": "L"}[rank]
        element = _element_from_seed(seed)
        stats = _stats_from_seed(seed, rank)

        name = it.get("name") or it.get("title") or f"NEAR NFT {token_id}"

        image = None
        # иногда в it есть metadata
        md = it.get("metadata") or {}
        if isinstance(md, dict):
            image = md.get("media") or md.get("image") or md.get("media_url")
        image = it.get("image") or it.get("image_url") or image

        items.append(
            MockNFT(
                key=key,
                chain="near",
                contractId=contract_id,
                tokenId=str(token_id),
                name=name,
                element=element,
                elementIcon=ELEM_ICONS[element],
                rank=rank,
                rankLabel=rank_label,
                stats=stats,
                imageUrl=image,
            )
        )

    return items


@router.get("/nfts/my")
async def my_nfts(
    current_user: User = Depends(get_current_user),
    x_near_account_id: Optional[str] = Header(default=None, alias="X-NEAR-ACCOUNT-ID"),
):
    """
    Stage1:
    - Если передан X-NEAR-ACCOUNT-ID -> пытаемся вернуть реальные NEAR NFT через indexer (fastnear)
    - Иначе -> моковый инвентарь (детерминированный)
    """
    user_id = int(current_user.id)

    if x_near_account_id:
        try:
            items = await _near_inventory(x_near_account_id.strip(), limit=30)
            if items:
                return {"items": [n.model_dump() for n in items]}
        except Exception:
            # fallback to mock
            pass

    items = _gen_inventory_for_user(user_id, count=16)
    return {"items": [n.model_dump() for n in items]}


@router.get("/decks/active")
async def get_active_deck(current_user: User = Depends(get_current_user)):
    user_id = int(current_user.id)
    keys = _get_active_deck_keys(user_id)
    return {"cards": keys}


@router.put("/decks/active")
async def put_active_deck(payload: Any = Body(...), current_user: User = Depends(get_current_user)):
    """
    Обновляет активную колоду.
    Принимает: ["key1","key2",...] или {"cards":[...]}
    """
    user_id = int(current_user.id)

    if isinstance(payload, dict) and "cards" in payload:
        keys = payload["cards"]
    elif isinstance(payload, list):
        keys = payload
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Payload must be a list of 5 keys or {'cards': [...]}",
        )

    if not isinstance(keys, list) or len(keys) != 5:
        raise HTTPException(status_code=400, detail="Deck must contain exactly 5 card keys")

    # валидируем по mock инвентарю (Stage1). near-ключи тоже допускаем, но не валидируем строго.
    inv_map = _get_inventory_map(user_id)
    missing = [k for k in keys if (k.startswith("mock:") and k not in inv_map)]
    if missing:
        raise HTTPException(status_code=400, detail={"error": "Unknown NFT keys", "missing": missing})

    _ACTIVE_DECKS[user_id] = keys
    return {"cards": keys}


@router.get("/decks/active/full")
async def get_active_deck_full(
    current_user: User = Depends(get_current_user),
    x_near_account_id: Optional[str] = Header(default=None, alias="X-NEAR-ACCOUNT-ID"),
):
    """
    Возвращает МАССИВ из 5 NFT объектов (без обёртки)
    """
    user_id = int(current_user.id)
    keys = _get_active_deck_keys(user_id)

    # если ключи near:... и есть account_id -> строим карту из near inventory
    near_items_map: Dict[str, MockNFT] = {}
    if x_near_account_id:
        try:
            near_items = await _near_inventory(x_near_account_id.strip(), limit=60)
            near_items_map = {n.key: n for n in near_items}
        except Exception:
            near_items_map = {}

    inv_map = _get_inventory_map(user_id)

    full: List[MockNFT] = []
    for k in keys:
        nft = None
        if k.startswith("near:"):
            nft = near_items_map.get(k)
        else:
            nft = inv_map.get(k)

        if nft is None:
            # fallback: если потеряли near токен — отдаём mock, чтобы игра не ломалась
            if k.startswith("near:"):
                # синтетический fallback
                seed = int.from_bytes(hashlib.sha256(k.encode("utf-8")).digest()[:8], "big", signed=False)
                rank = _rank_from_seed(seed)
                element = _element_from_seed(seed)
                rank_label = {"common": "C", "rare": "R", "epic": "E", "legendary": "L"}[rank]
                nft = MockNFT(
                    key=k,
                    chain="near",
                    contractId="unknown.near",
                    tokenId=k,
                    name="NEAR NFT",
                    element=element,
                    elementIcon=ELEM_ICONS[element],
                    rank=rank,
                    rankLabel=rank_label,
                    stats=_stats_from_seed(seed, rank),
                    imageUrl=None,
                )
            else:
                raise HTTPException(status_code=500, detail=f"Active deck contains unknown key: {k}")

        full.append(nft)

    return [n.model_dump() for n in full]
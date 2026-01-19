from __future__ import annotations

import hashlib
import random
from typing import Dict, List, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..api.users import get_current_user
from ..models import User

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

# Временное хранилище активных колод (user.id -> list of 5 keys)
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


def _seed_for_user(user_id: int) -> int:
    h = hashlib.sha256(f"mock-nfts:v2:{user_id}".encode("utf-8")).digest()
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
    rng = random.Random(_seed_for_user(user_id))
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


def _get_or_init_active_deck_keys(user_id: int) -> List[str]:
    if user_id in _ACTIVE_DECKS and len(_ACTIVE_DECKS[user_id]) == 5:
        return _ACTIVE_DECKS[user_id]

    inv = _gen_inventory_for_user(user_id)
    keys = [n.key for n in inv[:5]]
    _ACTIVE_DECKS[user_id] = keys
    return keys


@router.get("/nfts/my")
async def my_nfts(current_user: User = Depends(get_current_user)):
    """Возвращает инвентарь NFT пользователя"""
    user_id = int(current_user.id)
    items = _gen_inventory_for_user(user_id, count=16)
    return {"items": [n.dict() for n in items]}


@router.get("/decks/active")
async def get_active_deck(current_user: User = Depends(get_current_user)):
    """Возвращает ключи активной колоды (5 карт)"""
    user_id = int(current_user.id)
    keys = _get_or_init_active_deck_keys(user_id)
    return {"cards": keys}


@router.put("/decks/active")
async def put_active_deck(payload=Body(...), current_user: User = Depends(get_current_user)):
    """
    Обновляет активную колоду.
    Принимает: ["key1","key2",...] или {"cards":[...]}
    """
    user_id = int(current_user.id)

    # Поддержка обоих форматов
    if isinstance(payload, dict) and "cards" in payload:
        keys = payload["cards"]
    elif isinstance(payload, list):
        keys = payload
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Payload must be a list of 5 keys or {'cards': [...]}"
        )

    if not isinstance(keys, list) or len(keys) != 5:
        raise HTTPException(status_code=400, detail="Deck must contain exactly 5 card keys")

    inv_map = _get_inventory_map(user_id)
    missing = [k for k in keys if k not in inv_map]
    if missing:
        raise HTTPException(status_code=400, detail={"error": "Unknown NFT keys", "missing": missing})

    _ACTIVE_DECKS[user_id] = keys
    return {"cards": keys}


@router.get("/decks/active/full")
async def get_active_deck_full(current_user: User = Depends(get_current_user)):
    """Возвращает полные данные активной колоды (5 NFT объектов) для Game"""
    user_id = int(current_user.id)
    keys = _get_or_init_active_deck_keys(user_id)

    inv_map = _get_inventory_map(user_id)
    full: List[MockNFT] = []

    for k in keys:
        nft = inv_map.get(k)
        if nft is None:
            raise HTTPException(status_code=500, detail=f"Active deck contains unknown key: {k}")
        full.append(nft)

    return {"cards": [n.dict() for n in full]}
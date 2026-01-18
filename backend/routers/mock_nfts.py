from __future__ import annotations

import hashlib
import random
from typing import Dict, List, Literal, Tuple

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, Field

# ВАЖНО: у тебя get_current_user лежит тут
from api.users import get_current_user


router = APIRouter(tags=["mock-nfts"])

Element = Literal["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"]
Rank = Literal["common", "rare", "epic", "legendary"]

ELEMENTS: List[str] = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"]
RANKS: List[str] = ["common", "rare", "epic", "legendary"]


class SideStats(BaseModel):
    top: int = Field(..., ge=1, le=10)
    right: int = Field(..., ge=1, le=10)
    bottom: int = Field(..., ge=1, le=10)
    left: int = Field(..., ge=1, le=10)


class MockNFT(BaseModel):
    key: str
    name: str
    element: Element
    rank: Rank
    sides: SideStats


# Временно: in-memory активные колоды по user.id
_ACTIVE_DECKS: Dict[int, List[str]] = {}


def _seed_for_user(user_id: int) -> int:
    h = hashlib.sha256(f"mock-nfts:v1:{user_id}".encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big", signed=False)


def _rng_for_user(user_id: int) -> random.Random:
    return random.Random(_seed_for_user(user_id))


def _roll_rank(rng: random.Random) -> str:
    return rng.choices(population=RANKS, weights=[60, 25, 10, 5], k=1)[0]


def _rank_budget(rank: str) -> Tuple[int, int]:
    if rank == "common":
        return (1, 6)
    if rank == "rare":
        return (3, 8)
    if rank == "epic":
        return (4, 9)
    return (6, 10)  # legendary


def _gen_inventory_for_user(user_id: int, count: int = 24) -> List[MockNFT]:
    rng = _rng_for_user(user_id)
    inv: List[MockNFT] = []

    for i in range(count):
        element: str = rng.choice(ELEMENTS)
        rank: str = _roll_rank(rng)
        lo, hi = _rank_budget(rank)

        sides = SideStats(
            top=rng.randint(lo, hi),
            right=rng.randint(lo, hi),
            bottom=rng.randint(lo, hi),
            left=rng.randint(lo, hi),
        )

        key = f"mock:{user_id}:{i+1:02d}"
        name = f"{element} Card #{i+1:02d}"

        inv.append(
            MockNFT(
                key=key,
                name=name,
                element=element,  # type: ignore[arg-type]
                rank=rank,        # type: ignore[arg-type]
                sides=sides,
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


@router.get("/api/nfts/my", response_model=List[MockNFT])
async def my_nfts(current_user=Depends(get_current_user)):
    user_id = int(current_user.id)
    return _gen_inventory_for_user(user_id)


@router.get("/api/decks/active", response_model=List[str])
async def get_active_deck(current_user=Depends(get_current_user)):
    user_id = int(current_user.id)
    return _get_or_init_active_deck_keys(user_id)


@router.put("/api/decks/active", response_model=List[str])
async def put_active_deck(payload=Body(...), current_user=Depends(get_current_user)):
    """
    Принимаем ИЛИ:
      - ["key1","key2","key3","key4","key5"]
      - {"keys":[...]}
    Возвращаем: список из 5 ключей
    """
    user_id = int(current_user.id)

    if isinstance(payload, dict) and "keys" in payload:
        keys = payload.get("keys")
    else:
        keys = payload

    if not isinstance(keys, list) or not all(isinstance(x, str) for x in keys):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Payload must be a list of 5 string keys or {'keys': [...]}",
        )

    if len(keys) != 5:
        raise HTTPException(status_code=400, detail="Active deck must contain exactly 5 keys")

    inv_map = _get_inventory_map(user_id)
    missing = [k for k in keys if k not in inv_map]
    if missing:
        raise HTTPException(status_code=400, detail={"error": "Unknown NFT keys", "missing": missing})

    _ACTIVE_DECKS[user_id] = keys
    return keys


@router.get("/api/decks/active/full", response_model=List[MockNFT])
async def get_active_deck_full(current_user=Depends(get_current_user)):
    user_id = int(current_user.id)
    keys = _get_or_init_active_deck_keys(user_id)

    inv_map = _get_inventory_map(user_id)
    full: List[MockNFT] = []
    for k in keys:
        nft = inv_map.get(k)
        if nft is None:
            raise HTTPException(status_code=400, detail=f"Deck contains unknown key: {k}")
        full.append(nft)

    return full
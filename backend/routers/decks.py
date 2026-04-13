from fastapi import APIRouter, HTTPException, status, Header, Depends
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import random

from database.session import get_session
from database.models.user_deck import UserDeck

router = APIRouter(prefix="/api/decks", tags=["decks"])

# Fallback in-memory (используется только если БД недоступна)
_decks_storage: Dict[str, Dict] = {}


class DeckSaveRequest(BaseModel):
    cards: List[str]
    full_cards: Optional[List[Dict[str, Any]]] = None


class DeckResponse(BaseModel):
    cards: List[str]
    full_cards: Optional[List[Dict[str, Any]]] = None
    updated_at: Optional[str] = None


def get_user_id_from_token(authorization: str = None) -> str:
    if not authorization:
        return "default_user"
    try:
        from utils.security import decode_access_token
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        payload = decode_access_token(token)
        if payload:
            user_id = payload.get("sub") or payload.get("user_id") or payload.get("telegram_id")
            if user_id:
                return str(user_id)
    except Exception as e:
        print(f"[Decks] Token decode error: {e}")
    return "default_user"


async def _get_deck_from_db(user_id: str, session: AsyncSession) -> Optional[Dict]:
    try:
        result = await session.execute(
            select(UserDeck).where(UserDeck.user_id == user_id)
        )
        deck = result.scalar_one_or_none()
        if deck:
            return {
                "user_id": user_id,
                "cards": deck.cards or [],
                "full_cards": deck.full_cards or [],
                "updated_at": deck.updated_at.isoformat() if deck.updated_at else None,
            }
    except Exception as e:
        print(f"[Decks] DB read error: {e}")
    return None


async def _save_deck_to_db(user_id: str, cards: List, full_cards: List, session: AsyncSession) -> bool:
    try:
        result = await session.execute(
            select(UserDeck).where(UserDeck.user_id == user_id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.cards = cards
            existing.full_cards = full_cards
            existing.updated_at = datetime.utcnow()
        else:
            session.add(UserDeck(
                user_id=user_id,
                cards=cards,
                full_cards=full_cards,
            ))
        await session.commit()
        return True
    except Exception as e:
        print(f"[Decks] DB save error: {e}")
        await session.rollback()
        return False


@router.post("/save", response_model=dict)
async def save_deck(
        request: DeckSaveRequest,
        authorization: str = Header(None)
):
    if len(request.cards) != 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deck must contain exactly 5 cards"
        )

    user_id = get_user_id_from_token(authorization)
    full_cards = [dict(c) if hasattr(c, '__dict__') else c for c in (request.full_cards or [])]

    # Сохраняем в память (для matchmaking который читает синхронно)
    deck_data = {
        "user_id": user_id,
        "cards": request.cards,
        "full_cards": full_cards,
        "updated_at": datetime.utcnow().isoformat()
    }
    _decks_storage[user_id] = deck_data
    _decks_storage["default_user"] = deck_data

    # Сохраняем в БД
    try:
        async for session in get_session():
            await _save_deck_to_db(user_id, request.cards, full_cards, session)
    except Exception as e:
        print(f"[Decks] DB save failed, using memory only: {e}")

    print(f"[Decks] Saved deck for user {user_id}: {request.cards}")
    print(f"[Decks] Storage keys: {list(_decks_storage.keys())}")

    return {
        "success": True,
        "message": "Deck saved successfully",
        "cards": request.cards,
        "user_id": user_id
    }


@router.get("/my", response_model=DeckResponse)
async def get_my_deck(authorization: str = Header(None)):
    user_id = get_user_id_from_token(authorization)

    # Сначала пробуем БД
    try:
        async for session in get_session():
            deck = await _get_deck_from_db(user_id, session)
            if deck:
                # Синхронизируем с памятью
                _decks_storage[user_id] = deck
                return DeckResponse(
                    cards=deck.get("cards", []),
                    full_cards=deck.get("full_cards"),
                    updated_at=deck.get("updated_at")
                )
    except Exception as e:
        print(f"[Decks] DB read failed, using memory: {e}")

    # Fallback в память
    deck = _decks_storage.get(user_id) or _decks_storage.get("default_user")
    if not deck:
        return DeckResponse(cards=[], full_cards=None, updated_at=None)

    return DeckResponse(
        cards=deck.get("cards", []),
        full_cards=deck.get("full_cards"),
        updated_at=deck.get("updated_at")
    )


@router.get("/active/full")
async def get_active_deck_full(authorization: str = Header(None)):
    user_id = get_user_id_from_token(authorization)

    # Сначала пробуем БД
    try:
        async for session in get_session():
            deck = await _get_deck_from_db(user_id, session)
            if deck and deck.get("full_cards"):
                return {
                    "cards": deck.get("full_cards", []),
                    "card_ids": deck.get("cards", [])
                }
    except Exception as e:
        print(f"[Decks] DB read failed: {e}")

    # Fallback в память
    deck = _decks_storage.get(user_id) or _decks_storage.get("default_user")
    if not deck or not deck.get("full_cards"):
        raise HTTPException(status_code=404, detail="No active deck found")

    return {
        "cards": deck.get("full_cards", []),
        "card_ids": deck.get("cards", [])
    }


@router.get("/ai_opponent")
async def get_ai_opponent_deck():
    CARD_IMAGES = [
        "/cards/card.jpg", "/cards/card1.jpg", "/cards/card2.jpg",
        "/cards/card3.jpg", "/cards/card4.jpg", "/cards/card5.jpg",
        "/cards/card6.jpg", "/cards/card7.jpg", "/cards/card8.jpg",
        "/cards/card9.jpg",
    ]
    ELEMENTS = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"]
    RANKS = [
        {"key": "common",    "min": 1, "max": 5, "ace_chance": 0.0,  "weight": 30},
        {"key": "rare",      "min": 2, "max": 7, "ace_chance": 0.0,  "weight": 35},
        {"key": "epic",      "min": 3, "max": 8, "ace_chance": 0.20, "weight": 25},
        {"key": "legendary", "min": 4, "max": 9, "ace_chance": 0.50, "weight": 10},
    ]
    ACE_VALUE = 10
    ai_cards = []

    for i in range(5):
        rank_def = random.choices(RANKS, weights=[r["weight"] for r in RANKS], k=1)[0]
        min_val, max_val = rank_def["min"], rank_def["max"]
        values = {
            "top":    random.randint(min_val, max_val),
            "right":  random.randint(min_val, max_val),
            "bottom": random.randint(min_val, max_val),
            "left":   random.randint(min_val, max_val),
        }
        if rank_def["ace_chance"] > 0 and random.random() < rank_def["ace_chance"]:
            ace_side = random.choice(["top", "right", "bottom", "left"])
            values[ace_side] = ACE_VALUE

        image = random.choice(CARD_IMAGES)
        element = random.choice(ELEMENTS)
        card = {
            "id":        f"ai_card_{i}_{random.randint(1000, 9999)}",
            "token_id":  f"ai_card_{i}",
            "name":      f"AI Card #{i + 1}",
            "imageUrl":  image,
            "image":     image,
            "rarity":    rank_def["key"],
            "rank":      rank_def["key"],
            "rankLabel": rank_def["key"][0].upper(),
            "element":   element,
            "values":    values,
            "stats":     values,
        }
        ai_cards.append(card)

    return ai_cards


@router.delete("/clear")
async def clear_deck(authorization: str = Header(None)):
    user_id = get_user_id_from_token(authorization)
    deleted = False

    if user_id in _decks_storage:
        del _decks_storage[user_id]
        deleted = True

    try:
        async for session in get_session():
            result = await session.execute(
                select(UserDeck).where(UserDeck.user_id == user_id)
            )
            deck = result.scalar_one_or_none()
            if deck:
                await session.delete(deck)
                await session.commit()
                deleted = True
    except Exception as e:
        print(f"[Decks] DB clear error: {e}")

    return {"success": True, "deleted": deleted}


@router.get("/debug/all")
async def debug_all_decks():
    return {
        "storage_keys": list(_decks_storage.keys()),
        "decks_count": len(_decks_storage),
        "decks": {k: {"cards": v.get("cards", []), "user_id": v.get("user_id")} for k, v in _decks_storage.items()}
    }
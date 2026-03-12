# backend/routers/decks.py
from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from datetime import datetime

router = APIRouter(prefix="/api/decks", tags=["decks"])

# In-memory storage fallback
_decks_storage: Dict[str, Dict] = {}


class DeckSaveRequest(BaseModel):
    cards: List[str]
    full_cards: Optional[List[Dict[str, Any]]] = None


class DeckResponse(BaseModel):
    cards: List[str]
    full_cards: Optional[List[Dict[str, Any]]] = None
    updated_at: Optional[str] = None


def get_user_id_from_token(authorization: str = None) -> str:
    """Extract user ID from JWT token"""
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


@router.post("/save", response_model=dict)
async def save_deck(
        request: DeckSaveRequest,
        authorization: str = Header(None)
):
    """Сохраняет колоду пользователя"""

    if len(request.cards) != 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deck must contain exactly 5 cards"
        )

    user_id = get_user_id_from_token(authorization)

    deck_data = {
        "user_id": user_id,
        "cards": request.cards,
        "full_cards": [dict(c) if hasattr(c, '__dict__') else c for c in (request.full_cards or [])],
        "updated_at": datetime.utcnow().isoformat()
    }

    # Store under user_id
    _decks_storage[user_id] = deck_data

    # Also store under "default_user" as fallback
    _decks_storage["default_user"] = deck_data

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
    """Получает колоду текущего пользователя"""

    user_id = get_user_id_from_token(authorization)

    # Try user-specific first, then default
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
    """Получает полную активную колоду с данными карт"""

    user_id = get_user_id_from_token(authorization)

    # Try user-specific first, then default
    deck = _decks_storage.get(user_id) or _decks_storage.get("default_user")

    if not deck or not deck.get("full_cards"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active deck found"
        )

    return {
        "cards": deck.get("full_cards", []),
        "card_ids": deck.get("cards", [])
    }


@router.get("/ai_opponent")
async def get_ai_opponent_deck():
    """Возвращает колоду AI оппонента"""
    import random

    ai_cards = []
    elements = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice", None]

    for i in range(5):
        seed = 42 + i
        random.seed(seed)

        rarity = random.choice(["common", "common", "rare", "rare", "epic"])

        if rarity == "epic":
            base = 5
            variance = 4
        elif rarity == "rare":
            base = 3
            variance = 4
        else:
            base = 1
            variance = 5

        card = {
            "id": f"ai_card_{i}",
            "token_id": f"ai_card_{i}",
            "name": f"AI Card #{i + 1}",
            "imageUrl": f"/cards/card{i + 1}.jpg",
            "image": f"/cards/card{i + 1}.jpg",
            "rarity": rarity,
            "rank": rarity,
            "rankLabel": rarity[0].upper(),
            "element": random.choice(elements),
            "values": {
                "top": min(10, max(1, base + random.randint(0, variance))),
                "right": min(10, max(1, base + random.randint(0, variance))),
                "bottom": min(10, max(1, base + random.randint(0, variance))),
                "left": min(10, max(1, base + random.randint(0, variance))),
            }
        }
        ai_cards.append(card)

    random.seed()
    return ai_cards


@router.delete("/clear")
async def clear_deck(authorization: str = Header(None)):
    """Очищает колоду пользователя"""

    user_id = get_user_id_from_token(authorization)

    deleted = False
    if user_id in _decks_storage:
        del _decks_storage[user_id]
        deleted = True

    return {"success": True, "deleted": deleted}


# Debug endpoint
@router.get("/debug/all")
async def debug_all_decks():
    """Debug: показать все сохранённые колоды"""
    return {
        "storage_keys": list(_decks_storage.keys()),
        "decks_count": len(_decks_storage),
        "decks": {k: {"cards": v.get("cards", []), "user_id": v.get("user_id")} for k, v in _decks_storage.items()}
    }
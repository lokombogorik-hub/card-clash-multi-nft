# backend/routers/decks.py
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from datetime import datetime
from database.db import get_database
from utils.security import decode_access_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/api/decks", tags=["decks"])
security = HTTPBearer()


class CardData(BaseModel):
    id: str
    token_id: Optional[str] = None
    name: Optional[str] = None
    image: Optional[str] = None
    rarity: Optional[str] = None
    element: Optional[str] = None
    stats: Optional[Dict[str, int]] = None
    attack: Optional[int] = None
    defense: Optional[int] = None
    speed: Optional[int] = None
    contract_id: Optional[str] = None


class DeckSaveRequest(BaseModel):
    cards: List[str]  # список token_id
    full_cards: Optional[List[Dict[str, Any]]] = None  # полные данные карт


class DeckResponse(BaseModel):
    cards: List[str]
    full_cards: Optional[List[Dict[str, Any]]] = None
    updated_at: Optional[str] = None


async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db=Depends(get_database)
):
    """Извлекает текущего пользователя из JWT токена"""
    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    user_id = payload.get("sub") or payload.get("user_id") or payload.get("telegram_id")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    # Ищем пользователя
    users_collection = db["users"]
    user = await users_collection.find_one({
        "$or": [
            {"telegram_id": str(user_id)},
            {"telegram_id": int(user_id) if str(user_id).isdigit() else user_id},
            {"_id": user_id}
        ]
    })

    if not user:
        # Создаём пользователя если нет
        user = {
            "telegram_id": str(user_id),
            "created_at": datetime.utcnow(),
            "elo_rating": 1000,
            "wins": 0,
            "losses": 0,
            "total_matches": 0
        }
        await users_collection.insert_one(user)
        user = await users_collection.find_one({"telegram_id": str(user_id)})

    return user


@router.post("/save", response_model=dict)
async def save_deck(
        request: DeckSaveRequest,
        current_user: dict = Depends(get_current_user),
        db=Depends(get_database)
):
    """Сохраняет колоду пользователя"""

    if len(request.cards) != 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deck must contain exactly 5 cards"
        )

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))

    decks_collection = db["decks"]

    deck_data = {
        "user_id": user_id,
        "cards": request.cards,
        "full_cards": [dict(c) for c in request.full_cards] if request.full_cards else [],
        "updated_at": datetime.utcnow()
    }

    # Upsert - обновляем или создаём
    result = await decks_collection.update_one(
        {"user_id": user_id},
        {"$set": deck_data},
        upsert=True
    )

    print(f"[Decks] Saved deck for user {user_id}: {request.cards}")

    return {
        "success": True,
        "message": "Deck saved successfully",
        "cards": request.cards
    }


@router.get("/my", response_model=DeckResponse)
async def get_my_deck(
        current_user: dict = Depends(get_current_user),
        db=Depends(get_database)
):
    """Получает колоду текущего пользователя"""

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))

    decks_collection = db["decks"]
    deck = await decks_collection.find_one({"user_id": user_id})

    if not deck:
        return DeckResponse(cards=[], full_cards=None, updated_at=None)

    return DeckResponse(
        cards=deck.get("cards", []),
        full_cards=deck.get("full_cards"),
        updated_at=deck.get("updated_at", "").isoformat() if deck.get("updated_at") else None
    )


@router.get("/user/{user_id}", response_model=DeckResponse)
async def get_user_deck(
        user_id: str,
        db=Depends(get_database)
):
    """Получает колоду конкретного пользователя (для PvP)"""

    decks_collection = db["decks"]
    deck = await decks_collection.find_one({"user_id": user_id})

    if not deck:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deck not found for this user"
        )

    return DeckResponse(
        cards=deck.get("cards", []),
        full_cards=deck.get("full_cards"),
        updated_at=deck.get("updated_at", "").isoformat() if deck.get("updated_at") else None
    )


@router.delete("/clear")
async def clear_deck(
        current_user: dict = Depends(get_current_user),
        db=Depends(get_database)
):
    """Очищает колоду пользователя"""

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))

    decks_collection = db["decks"]
    result = await decks_collection.delete_one({"user_id": user_id})

    return {
        "success": True,
        "deleted": result.deleted_count > 0
    }
from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Any
import logging
import json

from database.session import get_session
from database.models.deck import UserDeck
from database.models.user import User
from sqlalchemy import select
from utils.security import decode_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/decks", tags=["decks"])


class CardData(BaseModel):
    key: str
    tokenId: str
    contractId: Optional[str] = None
    name: Optional[str] = None
    imageUrl: Optional[str] = None
    originalImageUrl: Optional[str] = None
    stats: Optional[dict] = None
    element: Optional[str] = None
    rarity: Optional[dict] = None
    rank: Optional[str] = None
    rankLabel: Optional[str] = None


class DeckSaveRequest(BaseModel):
    cards: List[str]  # Card keys
    full_cards: Optional[List[dict]] = None  # Full NFT data


class DeckResponse(BaseModel):
    cards: List[str]
    full_cards: Optional[List[dict]] = None


def get_user_id_from_token(authorization: Optional[str]) -> int:
    """Extract user ID from JWT token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing token")

    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty token")

    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return user_id
    except Exception as e:
        logger.warning(f"Token decode error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("/active")
async def get_active_deck(authorization: Optional[str] = Header(None)):
    """Get user's active deck (card keys only)."""
    user_id = get_user_id_from_token(authorization)

    async for session in get_session():
        result = await session.execute(
            select(UserDeck).where(UserDeck.user_id == user_id)
        )
        deck = result.scalar_one_or_none()

        if not deck:
            return {"cards": [], "full_cards": []}

        try:
            cards = json.loads(deck.card_keys) if deck.card_keys else []
            full_cards = json.loads(deck.cards_json) if deck.cards_json else []
        except:
            cards = []
            full_cards = []

        return {"cards": cards, "full_cards": full_cards}

    return {"cards": [], "full_cards": []}


@router.get("/active/full")
async def get_active_deck_full(authorization: Optional[str] = Header(None)):
    """Get user's active deck with full card data."""
    user_id = get_user_id_from_token(authorization)

    async for session in get_session():
        result = await session.execute(
            select(UserDeck).where(UserDeck.user_id == user_id)
        )
        deck = result.scalar_one_or_none()

        if not deck:
            return {"cards": []}

        try:
            full_cards = json.loads(deck.cards_json) if deck.cards_json else []
            return {"cards": full_cards}
        except:
            return {"cards": []}

    return {"cards": []}


@router.put("/active")
async def save_active_deck(
        deck: DeckSaveRequest,
        authorization: Optional[str] = Header(None)
):
    """Save user's active deck with full NFT data."""
    user_id = get_user_id_from_token(authorization)

    if len(deck.cards) != 5:
        raise HTTPException(status_code=400, detail=f"Deck must have exactly 5 cards, got {len(deck.cards)}")

    async for session in get_session():
        # Find existing deck
        result = await session.execute(
            select(UserDeck).where(UserDeck.user_id == user_id)
        )
        existing = result.scalar_one_or_none()

        card_keys_json = json.dumps(deck.cards)
        full_cards_json = json.dumps(deck.full_cards) if deck.full_cards else "[]"

        if existing:
            existing.card_keys = card_keys_json
            existing.cards_json = full_cards_json
        else:
            new_deck = UserDeck(
                user_id=user_id,
                card_keys=card_keys_json,
                cards_json=full_cards_json
            )
            session.add(new_deck)

        await session.commit()

        return {"cards": deck.cards, "status": "saved"}

    raise HTTPException(status_code=500, detail="Database error")


@router.get("/user/{user_id}/full")
async def get_user_deck_full(
        user_id: int,
        authorization: Optional[str] = Header(None)
):
    """Get another user's deck (for PvP). Public endpoint."""
    async for session in get_session():
        result = await session.execute(
            select(UserDeck).where(UserDeck.user_id == user_id)
        )
        deck = result.scalar_one_or_none()

        if not deck:
            return {"cards": []}

        try:
            full_cards = json.loads(deck.cards_json) if deck.cards_json else []
            return {"cards": full_cards}
        except:
            return {"cards": []}

    return {"cards": []}
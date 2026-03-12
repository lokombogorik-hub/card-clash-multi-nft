from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
import logging
import json

from database.session import get_session
from database.models.deck import UserDeck
from sqlalchemy import select
from utils.security import decode_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/decks", tags=["decks"])


class DeckSaveRequest(BaseModel):
    cards: List[str]
    full_cards: Optional[List[Any]] = None


def get_user_id_from_token(authorization: Optional[str]) -> int:
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
        except:
            cards = []

        try:
            full_cards = json.loads(deck.cards_json) if deck.cards_json else []
        except:
            full_cards = []

        return {"cards": cards, "full_cards": full_cards}

    return {"cards": [], "full_cards": []}


@router.get("/active/full")
async def get_active_deck_full(authorization: Optional[str] = Header(None)):
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
    user_id = get_user_id_from_token(authorization)
    logger.info(
        f"Saving deck for user {user_id}: {len(deck.cards)} cards, full_cards: {len(deck.full_cards) if deck.full_cards else 0}")

    if len(deck.cards) != 5:
        raise HTTPException(status_code=400, detail=f"Deck must have exactly 5 cards, got {len(deck.cards)}")

    card_keys_json = json.dumps(deck.cards)

    # Handle full_cards
    if deck.full_cards and len(deck.full_cards) == 5:
        full_cards_json = json.dumps(deck.full_cards)
    else:
        full_cards_json = "[]"

    logger.info(f"card_keys_json length: {len(card_keys_json)}, full_cards_json length: {len(full_cards_json)}")

    async for session in get_session():
        result = await session.execute(
            select(UserDeck).where(UserDeck.user_id == user_id)
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.card_keys = card_keys_json
            existing.cards_json = full_cards_json
            logger.info(f"Updated existing deck for user {user_id}")
        else:
            new_deck = UserDeck(
                user_id=user_id,
                card_keys=card_keys_json,
                cards_json=full_cards_json
            )
            session.add(new_deck)
            logger.info(f"Created new deck for user {user_id}")

        await session.commit()

        return {"cards": deck.cards, "status": "saved",
                "full_cards_count": len(deck.full_cards) if deck.full_cards else 0}

    raise HTTPException(status_code=500, detail="Database error")


@router.get("/user/{target_user_id}/full")
async def get_user_deck_full(
        target_user_id: int,
        authorization: Optional[str] = Header(None)
):
    # Verify caller is authenticated
    get_user_id_from_token(authorization)

    async for session in get_session():
        result = await session.execute(
            select(UserDeck).where(UserDeck.user_id == target_user_id)
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
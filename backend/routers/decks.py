from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/decks", tags=["decks"])

# In-memory storage (temporary - works without database)
user_decks = {}


class DeckRequest(BaseModel):
    cards: List[str]


def extract_user_id(authorization: Optional[str]) -> str:
    """Extract user identifier from authorization header."""
    if not authorization:
        return "anonymous"

    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return "anonymous"

    # Use hash of token as user key (first 16 chars)
    return f"user_{token[:16]}"


@router.get("/active")
async def get_active_deck(authorization: Optional[str] = Header(None)):
    """Get user's active deck."""
    user_id = extract_user_id(authorization)
    logger.info(f"Getting deck for user: {user_id}")

    deck = user_decks.get(user_id, {"cards": []})
    return {"cards": deck.get("cards", [])}


@router.put("/active")
async def save_active_deck(
        deck: DeckRequest,
        authorization: Optional[str] = Header(None)
):
    """Save user's active deck (5 cards)."""
    user_id = extract_user_id(authorization)
    logger.info(f"Saving deck for user: {user_id}, cards: {deck.cards}")

    if len(deck.cards) != 5:
        raise HTTPException(status_code=400, detail=f"Deck must have exactly 5 cards, got {len(deck.cards)}")

    user_decks[user_id] = {"cards": deck.cards}
    logger.info(f"Deck saved successfully for {user_id}")

    return {"cards": deck.cards, "status": "saved"}
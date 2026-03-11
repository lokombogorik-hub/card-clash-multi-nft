from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import json

router = APIRouter(prefix="/api/decks", tags=["decks"])

# In-memory storage (temporary - should use database)
user_decks = {}


class DeckRequest(BaseModel):
    cards: List[str]


class DeckResponse(BaseModel):
    cards: List[str]


def get_user_id_from_token(authorization: str) -> str:
    """Extract user ID from JWT token (simplified)"""
    if not authorization:
        raise HTTPException(status_code=401, detail="No token")
    # For now just use token as user id key
    # In production, decode JWT properly
    return authorization.replace("Bearer ", "")[:32]


@router.get("/active", response_model=DeckResponse)
async def get_active_deck(authorization: Optional[str] = Header(None)):
    """Get user's active deck"""
    try:
        user_id = get_user_id_from_token(authorization or "")
        deck = user_decks.get(user_id, {"cards": []})
        return DeckResponse(cards=deck.get("cards", []))
    except:
        return DeckResponse(cards=[])


@router.put("/active", response_model=DeckResponse)
async def save_active_deck(
        deck: DeckRequest,
        authorization: Optional[str] = Header(None)
):
    """Save user's active deck (5 cards)"""
    user_id = get_user_id_from_token(authorization or "anonymous")

    if len(deck.cards) != 5:
        raise HTTPException(status_code=400, detail="Deck must have exactly 5 cards")

    user_decks[user_id] = {"cards": deck.cards}
    return DeckResponse(cards=deck.cards)
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/decks", tags=["decks"])

# In-memory storage (temporary - should use database)
user_decks = {}


class DeckRequest(BaseModel):
    cards: List[str]


class DeckResponse(BaseModel):
    cards: List[str]


def get_user_id_from_token(authorization: Optional[str]) -> str:
    """Extract user ID from token (simplified)"""
    if not authorization:
        return "anonymous"
    # Remove "Bearer " prefix if present
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return "anonymous"
    # Use first 32 chars as user key
    return token[:32]


@router.get("/active")
async def get_active_deck(authorization: Optional[str] = Header(None)):
    """Get user's active deck"""
    try:
        user_id = get_user_id_from_token(authorization)
        deck = user_decks.get(user_id, {"cards": []})
        return {"cards": deck.get("cards", [])}
    except Exception as e:
        return {"cards": [], "error": str(e)}


@router.put("/active")
async def save_active_deck(
        deck: DeckRequest,
        authorization: Optional[str] = Header(None)
):
    """Save user's active deck (5 cards)"""
    try:
        user_id = get_user_id_from_token(authorization)

        if len(deck.cards) != 5:
            raise HTTPException(status_code=400, detail="Deck must have exactly 5 cards")

        user_decks[user_id] = {"cards": deck.cards}
        return {"cards": deck.cards, "status": "saved"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.options("/active")
async def options_active_deck():
    """Handle CORS preflight"""
    return {"status": "ok"}
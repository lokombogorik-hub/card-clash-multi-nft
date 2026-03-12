# backend/routers/matches.py
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/matches", tags=["matches"])

# Import shared storage
from routers.matchmaking import active_matches

RECONNECT_TIMEOUT_MINUTES = 3


class PlayCardRequest(BaseModel):
    match_id: str
    card_index: int
    attribute: str


class MatchState(BaseModel):
    match_id: str
    status: str
    current_round: int
    player1_score: int
    player2_score: int
    player1_id: str
    player2_id: str
    player1_deck: List[Dict[str, Any]]
    player2_deck: List[Dict[str, Any]]
    winner: Optional[str] = None


@router.get("/{match_id}")
async def get_match(match_id: str):
    """Get match data"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    return match_data


@router.get("/{match_id}/state")
async def get_match_state(match_id: str):
    """Get match state"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    return MatchState(
        match_id=match_data["match_id"],
        status=match_data.get("status", "active"),
        current_round=match_data.get("current_round", 0),
        player1_score=match_data.get("player1_score", 0),
        player2_score=match_data.get("player2_score", 0),
        player1_id=match_data["player1_id"],
        player2_id=match_data["player2_id"],
        player1_deck=match_data.get("player1_deck", []),
        player2_deck=match_data.get("player2_deck", []),
        winner=match_data.get("winner")
    )


@router.post("/{match_id}/play")
async def play_card(match_id: str, request: PlayCardRequest):
    """Play a card in match"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    if match_data.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Match is not active"
        )

    # Record move (simplified)
    return {"success": True, "message": "Move recorded"}


@router.post("/{match_id}/finish")
async def finish_match(match_id: str, body: dict):
    """Finish match and declare winner"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    winner_user_id = body.get("winner_user_id")

    match_data["status"] = "finished"
    match_data["winner"] = winner_user_id
    match_data["finished_at"] = datetime.utcnow().isoformat()

    active_matches[match_id] = match_data

    return {"success": True, "winner": winner_user_id}


@router.post("/{match_id}/claim_tx")
async def record_claim_tx(match_id: str, body: dict):
    """Record claim transaction"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    tx_hash = body.get("tx_hash")
    match_data["claim_tx_hash"] = tx_hash

    active_matches[match_id] = match_data

    return {"success": True, "tx_hash": tx_hash}


@router.post("/{match_id}/reconnect")
async def reconnect_to_match(match_id: str):
    """Reconnect to match"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    return {"success": True, "message": "Reconnected successfully"}
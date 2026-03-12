from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging
import json
from datetime import datetime

from database.session import get_session
from database.models.user import User
from database.models.pvp_match import PvPMatch
from sqlalchemy import select, or_
from utils.security import decode_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/matches", tags=["matches"])


class FinishMatchRequest(BaseModel):
    winner_id: int
    player1_rounds: int
    player2_rounds: int


class ClaimNftRequest(BaseModel):
    nft_contract_id: str
    token_id: str


def get_user_id_from_token(authorization: Optional[str]) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = decode_access_token(token)
        return int(payload.get("sub", 0))
    except:
        raise HTTPException(status_code=401, detail="Invalid token")


def calculate_elo_change(winner_elo: int, loser_elo: int, k: int = 32) -> int:
    expected_winner = 1 / (1 + 10 ** ((loser_elo - winner_elo) / 400))
    change = int(k * (1 - expected_winner))
    return max(1, min(change, 50))


@router.get("/{match_id}")
async def get_match(match_id: str, authorization: Optional[str] = Header(None)):
    """Get match details including both players' decks."""
    user_id = get_user_id_from_token(authorization)

    async for session in get_session():
        match = await session.get(PvPMatch, match_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")

        # Check if user is participant
        if user_id not in [match.player1_id, match.player2_id]:
            raise HTTPException(status_code=403, detail="Not a participant")

        # Get player info
        player1 = await session.get(User, match.player1_id)
        player2 = await session.get(User, match.player2_id) if match.player2_id else None

        # Parse decks
        try:
            p1_deck = json.loads(match.player1_deck_json) if match.player1_deck_json else []
            p2_deck = json.loads(match.player2_deck_json) if match.player2_deck_json else []
        except:
            p1_deck = []
            p2_deck = []

        # Determine which player is "me" and which is "opponent"
        if user_id == match.player1_id:
            my_deck = p1_deck
            opponent_deck = p2_deck
            opponent = player2
            my_elo = match.player1_elo
            opponent_elo = match.player2_elo
        else:
            my_deck = p2_deck
            opponent_deck = p1_deck
            opponent = player1
            my_elo = match.player2_elo
            opponent_elo = match.player1_elo

        return {
            "match_id": match.id,
            "status": match.status,
            "my_deck": my_deck,
            "opponent_deck": opponent_deck,
            "opponent": {
                "id": opponent.id if opponent else None,
                "name": (opponent.username or opponent.first_name or "Unknown") if opponent else "Unknown",
                "elo": opponent_elo
            },
            "my_elo": my_elo,
            "player1_rounds": match.player1_rounds,
            "player2_rounds": match.player2_rounds,
            "winner_id": match.winner_id,
            "elo_change": match.elo_change
        }


@router.post("/{match_id}/finish")
async def finish_match(
        match_id: str,
        req: FinishMatchRequest,
        authorization: Optional[str] = Header(None)
):
    """Finish a PvP match and update ratings."""
    user_id = get_user_id_from_token(authorization)

    async for session in get_session():
        match = await session.get(PvPMatch, match_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")

        if match.status == "finished":
            return {"status": "already_finished", "elo_change": match.elo_change}

        if user_id not in [match.player1_id, match.player2_id]:
            raise HTTPException(status_code=403, detail="Not a participant")

        # Validate winner
        if req.winner_id not in [match.player1_id, match.player2_id]:
            raise HTTPException(status_code=400, detail="Invalid winner_id")

        loser_id = match.player2_id if req.winner_id == match.player1_id else match.player1_id

        # Get players
        winner = await session.get(User, req.winner_id)
        loser = await session.get(User, loser_id)

        if not winner or not loser:
            raise HTTPException(status_code=404, detail="Player not found")

        # Calculate ELO change
        winner_elo = winner.elo_rating or 1000
        loser_elo = loser.elo_rating or 1000
        elo_change = calculate_elo_change(winner_elo, loser_elo)

        # Update ratings
        winner.elo_rating = winner_elo + elo_change
        winner.wins = (winner.wins or 0) + 1
        winner.total_matches = (winner.total_matches or 0) + 1

        loser.elo_rating = max(100, loser_elo - elo_change)  # Min 100 ELO
        loser.losses = (loser.losses or 0) + 1
        loser.total_matches = (loser.total_matches or 0) + 1

        # Update match
        match.status = "finished"
        match.winner_id = req.winner_id
        match.loser_id = loser_id
        match.player1_rounds = req.player1_rounds
        match.player2_rounds = req.player2_rounds
        match.elo_change = elo_change
        match.finished_at = datetime.utcnow()

        await session.commit()

        return {
            "status": "finished",
            "winner_id": req.winner_id,
            "elo_change": elo_change,
            "winner_new_elo": winner.elo_rating,
            "loser_new_elo": loser.elo_rating
        }


@router.post("/{match_id}/claim_nft")
async def claim_nft(
        match_id: str,
        req: ClaimNftRequest,
        authorization: Optional[str] = Header(None)
):
    """Record NFT claim after winning."""
    user_id = get_user_id_from_token(authorization)

    async for session in get_session():
        match = await session.get(PvPMatch, match_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")

        if match.winner_id != user_id:
            raise HTTPException(status_code=403, detail="Only winner can claim")

        match.claimed_nft_contract = req.nft_contract_id
        match.claimed_nft_token_id = req.token_id

        await session.commit()

        return {"status": "claimed", "nft_contract": req.nft_contract_id, "token_id": req.token_id}


@router.get("/history/my")
async def my_match_history(
        authorization: Optional[str] = Header(None),
        limit: int = 20
):
    """Get user's match history."""
    user_id = get_user_id_from_token(authorization)

    async for session in get_session():
        result = await session.execute(
            select(PvPMatch)
            .where(
                or_(
                    PvPMatch.player1_id == user_id,
                    PvPMatch.player2_id == user_id
                )
            )
            .order_by(PvPMatch.created_at.desc())
            .limit(limit)
        )
        matches = result.scalars().all()

        history = []
        for m in matches:
            opponent_id = m.player2_id if m.player1_id == user_id else m.player1_id
            opponent = await session.get(User, opponent_id) if opponent_id else None

            history.append({
                "match_id": m.id,
                "opponent_name": (opponent.username or opponent.first_name) if opponent else "Unknown",
                "opponent_elo": m.player2_elo if m.player1_id == user_id else m.player1_elo,
                "result": "win" if m.winner_id == user_id else "loss" if m.winner_id else "ongoing",
                "elo_change": m.elo_change if m.winner_id == user_id else -m.elo_change if m.winner_id else 0,
                "created_at": m.created_at.isoformat() if m.created_at else None
            })

        return {"matches": history}
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from database.session import get_db
from database.models.user import User
from api.users import get_current_user

router = APIRouter(prefix="/api/matches", tags=["matches"])


class FinishMatchRequest(BaseModel):
    winner_user_id: int
    loser_user_id: int
    nft_contract_id: Optional[str] = None
    token_id: Optional[str] = None


class ClaimTxRequest(BaseModel):
    tx_hash: str


@router.get("/{match_id}")
async def get_match(match_id: str, current_user: User = Depends(get_current_user)):
    return {
        "match_id": match_id,
        "status": "active",
        "players": [],
        "deposits": [],
    }


@router.post("/{match_id}/finish")
async def finish_match(
    match_id: str,
    data: FinishMatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Update winner stats
    winner = await db.get(User, data.winner_user_id)
    if winner:
        winner.total_matches = (winner.total_matches or 0) + 1
        winner.wins = (winner.wins or 0) + 1
        old_elo = winner.elo_rating or 1000
        winner.elo_rating = old_elo + 25

    # Update loser stats
    loser = await db.get(User, data.loser_user_id)
    if loser:
        loser.total_matches = (loser.total_matches or 0) + 1
        loser.losses = (loser.losses or 0) + 1
        old_elo = loser.elo_rating or 1000
        loser.elo_rating = max(100, old_elo - 25)

    await db.commit()

    return {
        "match_id": match_id,
        "status": "finished",
        "winner_user_id": data.winner_user_id,
        "loser_user_id": data.loser_user_id,
    }


@router.post("/{match_id}/claim_tx")
async def claim_tx(
    match_id: str,
    data: ClaimTxRequest,
    current_user: User = Depends(get_current_user),
):
    return {
        "match_id": match_id,
        "tx_hash": data.tx_hash,
        "status": "claimed",
    }
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from api.users import get_current_user
from database.session import get_session
from database.models.user import User
from database.models.match import Match, MatchPlayer, MatchDeposit, MatchClaim

router = APIRouter(prefix="/api/matches", tags=["matches"])


def _now():
    return datetime.utcnow()


@router.post("/create")
async def create_match(
    data: Dict[str, Any] = Body(default={}),
    user: User = Depends(get_current_user),
):
    """
    Создаёт матч и добавляет создателя как Player A.
    """
    opponent_user_id = data.get("opponent_user_id")

    async for session in get_session():
        m = Match(status="waiting")
        session.add(m)
        await session.flush()

        p1 = MatchPlayer(
            match_id=m.id,
            user_id=int(user.id),
            side="A",
            near_account_id_snapshot=user.near_account_id,
        )
        session.add(p1)

        if opponent_user_id:
            p2 = MatchPlayer(
                match_id=m.id,
                user_id=int(opponent_user_id),
                side="B",
            )
            session.add(p2)
            m.status = "active"

        await session.commit()
        return {"matchId": m.id, "status": m.status}


@router.post("/{match_id}/join")
async def join_match(
    match_id: str,
    user: User = Depends(get_current_user),
):
    async for session in get_session():
        m = await session.get(
            Match,
            match_id,
            options=[selectinload(Match.players)],
        )
        if not m:
            raise HTTPException(status_code=404, detail="Match not found")

        # already in match
        if any(p.user_id == int(user.id) for p in m.players):
            for p in m.players:
                if p.user_id == int(user.id):
                    p.near_account_id_snapshot = user.near_account_id
            await session.commit()
            return {"ok": True, "matchId": m.id, "status": m.status}

        if len(m.players) >= 2:
            raise HTTPException(status_code=409, detail="Match is full")

        side = "B" if all(p.side != "B" for p in m.players) else "A"
        mp = MatchPlayer(
            match_id=m.id,
            user_id=int(user.id),
            side=side,
            near_account_id_snapshot=user.near_account_id,
        )
        session.add(mp)

        m.status = "active"
        await session.commit()
        return {"ok": True, "matchId": m.id, "status": m.status}


@router.post("/{match_id}/deck")
async def set_match_deck(
    match_id: str,
    data: Dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
):
    async for session in get_session():
        mp = (
            await session.execute(
                select(MatchPlayer).where(
                    and_(MatchPlayer.match_id == match_id, MatchPlayer.user_id == int(user.id))
                )
            )
        ).scalar_one_or_none()

        if not mp:
            raise HTTPException(status_code=404, detail="You are not in this match")

        mp.deck = data
        mp.near_account_id_snapshot = user.near_account_id
        await session.commit()
        return {"ok": True}


@router.post("/{match_id}/deposit")
async def record_deposit(
    match_id: str,
    data: Dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
):
    nft_contract_id = (data.get("nft_contract_id") or "").strip()
    token_id = (data.get("token_id") or "").strip()
    tx_hash = (data.get("tx_hash") or "").strip() or None

    if not nft_contract_id or not token_id:
        raise HTTPException(status_code=400, detail="nft_contract_id and token_id are required")

    async for session in get_session():
        m = await session.get(Match, match_id, options=[selectinload(Match.players)])
        if not m:
            raise HTTPException(status_code=404, detail="Match not found")

        if not any(p.user_id == int(user.id) for p in m.players):
            raise HTTPException(status_code=403, detail="Not a match participant")

        dep = MatchDeposit(
            match_id=match_id,
            user_id=int(user.id),
            nft_contract_id=nft_contract_id,
            token_id=token_id,
            tx_hash=tx_hash,
            verified_onchain=False,
        )
        session.add(dep)
        await session.commit()
        return {"ok": True, "depositId": dep.id}


@router.get("/{match_id}")
async def get_match(match_id: str, user: User = Depends(get_current_user)):
    async for session in get_session():
        m = await session.get(
            Match,
            match_id,
            options=[
                selectinload(Match.players),
                selectinload(Match.deposits),
                selectinload(Match.claim),
            ],
        )
        if not m:
            raise HTTPException(status_code=404, detail="Match not found")

        if not any(p.user_id == int(user.id) for p in m.players):
            raise HTTPException(status_code=403, detail="Not a match participant")

        return {
            "id": m.id,
            "status": m.status,
            "created_at": m.created_at.isoformat(),
            "finished_at": m.finished_at.isoformat() if m.finished_at else None,
            "winner_user_id": m.winner_user_id,
            "players": [
                {
                    "user_id": p.user_id,
                    "side": p.side,
                    "near_account_id": p.near_account_id_snapshot,
                    "deck": p.deck,
                }
                for p in m.players
            ],
            "deposits": [
                {
                    "id": d.id,
                    "user_id": d.user_id,
                    "nft_contract_id": d.nft_contract_id,
                    "token_id": d.token_id,
                    "tx_hash": d.tx_hash,
                    "verified_onchain": d.verified_onchain,
                    "deposited_at": d.deposited_at.isoformat(),
                }
                for d in m.deposits
            ],
            "claim": (
                {
                    "winner_user_id": m.claim.winner_user_id,
                    "loser_user_id": m.claim.loser_user_id,
                    "nft_contract_id": m.claim.nft_contract_id,
                    "token_id": m.claim.token_id,
                    "tx_hash": m.claim.tx_hash,
                    "claimed_at": m.claim.claimed_at.isoformat(),
                }
                if m.claim
                else None
            ),
        }


@router.post("/{match_id}/finish")
async def finish_match(
    match_id: str,
    data: Dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
):
    winner_user_id = int(data.get("winner_user_id") or 0)
    loser_user_id = int(data.get("loser_user_id") or 0)
    nft_contract_id = (data.get("nft_contract_id") or "").strip()
    token_id = (data.get("token_id") or "").strip()

    if not winner_user_id or not loser_user_id or not nft_contract_id or not token_id:
        raise HTTPException(
            status_code=400,
            detail="winner_user_id, loser_user_id, nft_contract_id, token_id are required",
        )

    async for session in get_session():
        m = await session.get(Match, match_id, options=[selectinload(Match.players), selectinload(Match.claim)])
        if not m:
            raise HTTPException(status_code=404, detail="Match not found")

        if not any(p.user_id == int(user.id) for p in m.players):
            raise HTTPException(status_code=403, detail="Not a match participant")

        m.status = "finished"
        m.finished_at = _now()
        m.winner_user_id = winner_user_id

        if m.claim is None:
            cl = MatchClaim(
                match_id=match_id,
                winner_user_id=winner_user_id,
                loser_user_id=loser_user_id,
                nft_contract_id=nft_contract_id,
                token_id=token_id,
                tx_hash=None,
            )
            session.add(cl)

        await session.commit()
        return {"ok": True}


@router.post("/{match_id}/claim_tx")
async def set_claim_tx(
    match_id: str,
    data: Dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
):
    tx_hash = (data.get("tx_hash") or "").strip()
    if not tx_hash:
        raise HTTPException(status_code=400, detail="tx_hash is required")

    async for session in get_session():
        m = await session.get(
            Match,
            match_id,
            options=[selectinload(Match.players), selectinload(Match.claim)],
        )
        if not m:
            raise HTTPException(status_code=404, detail="Match not found")

        if not any(p.user_id == int(user.id) for p in m.players):
            raise HTTPException(status_code=403, detail="Not a match participant")

        if not m.claim:
            raise HTTPException(status_code=409, detail="No claim recorded for this match")

        if int(user.id) != int(m.claim.winner_user_id):
            raise HTTPException(status_code=403, detail="Only winner can set claim tx")

        m.claim.tx_hash = tx_hash
        await session.commit()
        return {"ok": True}
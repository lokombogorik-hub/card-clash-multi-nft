from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy import select
import uuid
import os
import httpx
import json
import base64
import traceback

from database.session import get_session
from database.models.pvp_match import PvPMatch
from database.models.match_deposit import MatchDeposit
from utils.rating import calculate_rating_change, get_rank_by_rating
from database.models.user import User

router = APIRouter(prefix="/api/matches", tags=["matches"])

ESCROW_WALLET = os.getenv("ESCROW_WALLET", "escrow.near")
ESCROW_PRIVATE_KEY = os.getenv("ESCROW_PRIVATE_KEY", "")
NFT_CONTRACT_ID = os.getenv("NFT_CONTRACT_ID", "")


class CreateMatchRequest(BaseModel):
    player1_id: Optional[str] = None
    player2_id: Optional[str] = None
    mode: str = "pvp"
    player1_deck: Optional[List[Dict[str, Any]]] = None
    player2_deck: Optional[List[Dict[str, Any]]] = None


class RegisterDepositsRequest(BaseModel):
    token_ids: List[str]
    nft_contract_id: Optional[str] = None
    images: Optional[List[str]] = None
    near_wallet: Optional[str] = None


class ClaimRequest(BaseModel):
    pick_index: int
    token_id: Optional[str] = None
    nft_contract_id: Optional[str] = None


def get_player_id_from_token(token: str) -> Optional[str]:
    try:
        from utils.security import decode_access_token
        payload = decode_access_token(token)
        return str(payload.get("sub") or payload.get("user_id") or payload.get("telegram_id"))
    except Exception:
        return None


def is_escrow_configured() -> bool:
    return bool(ESCROW_PRIVATE_KEY) and bool(NFT_CONTRACT_ID)


async def fetch_nft_image(token_id: str, nft_contract: str) -> str:
    if not nft_contract or not token_id:
        return ""
    try:
        args = json.dumps({"token_id": token_id})
        args_b64 = base64.b64encode(args.encode()).decode()
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                "https://rpc.mainnet.near.org",
                json={
                    "jsonrpc": "2.0", "id": "1", "method": "query",
                    "params": {
                        "request_type": "call_function",
                        "finality": "final",
                        "account_id": nft_contract,
                        "method_name": "nft_token",
                        "args_base64": args_b64,
                    }
                }
            )
            data = resp.json()
            if "result" in data and "result" in data["result"]:
                token = json.loads(bytes(data["result"]["result"]).decode())
                media = (token.get("metadata") or {}).get("media", "")
                if media:
                    if media.startswith("ipfs://"):
                        return "https://ipfs.near.social/ipfs/" + media[7:]
                    if media.startswith("http"):
                        return media
                    return "https://ipfs.near.social/ipfs/" + media
    except Exception as e:
        print(f"[MATCHES] fetch_nft_image error for {token_id}: {e}")
    return ""


async def transfer_nft_from_escrow(to_wallet: str, token_id: str, nft_contract_id: str) -> Dict:
    if not ESCROW_PRIVATE_KEY:
        return {"success": False, "error": "Escrow private key not configured", "mock": True}
    try:
        from py_near.account import Account
        private_key = ESCROW_PRIVATE_KEY
        if not private_key.startswith("ed25519:"):
            private_key = "ed25519:" + private_key
        account = Account(ESCROW_WALLET, private_key)
        await account.startup()
        result = await account.function_call(
            nft_contract_id or NFT_CONTRACT_ID,
            "nft_transfer",
            {"receiver_id": to_wallet, "token_id": str(token_id)},
            gas=30_000_000_000_000,
            amount=1,
        )
        tx_hash = ""
        if result:
            if hasattr(result, "transaction") and hasattr(result.transaction, "hash"):
                tx_hash = result.transaction.hash
            elif hasattr(result, "transaction_outcome"):
                tx_hash = result.transaction_outcome.id
            else:
                tx_hash = str(result)[:32]
        print(f"[ESCROW] Transferred {token_id} to {to_wallet}, tx: {tx_hash}")
        return {"success": True, "tx_hash": tx_hash, "token_id": token_id, "to": to_wallet}
    except Exception as e:
        print(f"[ESCROW] Transfer error: {e}")
        traceback.print_exc()
        return {"success": False, "error": str(e)}


async def _get_match(match_id: str) -> Optional[Dict]:
    """Получаем матч из памяти или БД"""
    from routers.matchmaking import get_match
    return await get_match(match_id)


async def _save_match(match_data: Dict):
    """Сохраняем матч в память и БД"""
    from routers.matchmaking import save_match
    await save_match(match_data)


# ── STATIC ROUTES ─────────────────────────────────────────────

@router.get("/active")
async def get_active_match(authorization: Optional[str] = Header(None)):
    """
    Возвращает активный матч текущего игрока.

    PATCH: Ищем сначала в active_matches (in-memory),
    потом в БД — на случай перезапуска сервера.
    Статусы которые считаются "активными":
      - waiting_escrow: матч создан, ждём лока
      - waiting: матч создан, ждём второго игрока
      - active: оба залочили, игра идёт
    НЕ возвращаем: cancelled, finished
    """
    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)
    if not player_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    ACTIVE_STATUSES = {"waiting_escrow", "active", "waiting"}

    # PATCH: Шаг 1 — ищем в in-memory active_matches
    from routers.matchmaking import active_matches

    for mid, match in list(active_matches.items()):
        p1 = str(match.get("player1_id") or "")
        p2 = str(match.get("player2_id") or "")
        if player_id not in (p1, p2):
            continue
        match_status = match.get("status", "")
        if match_status not in ACTIVE_STATUSES:
            continue

        # Нашли в памяти
        my_escrow_confirmed = (
            match.get("player1_escrow_confirmed", False) if player_id == p1
            else match.get("player2_escrow_confirmed", False)
        )
        print(f"[MATCHES] /active found in memory: match={mid} player={player_id} status={match_status}")
        return {
            "match_id": mid,
            "status": match_status,
            "escrow_locked": match.get("escrow_locked", False),
            "player1_id": p1,
            "player2_id": p2,
            "player1_escrow_confirmed": match.get("player1_escrow_confirmed", False),
            "player2_escrow_confirmed": match.get("player2_escrow_confirmed", False),
            "my_escrow_confirmed": my_escrow_confirmed,
            "escrow_timeout_at": match.get("escrow_timeout_at"),
            "created_at": match.get("created_at"),
        }

    # PATCH: Шаг 2 — ищем в БД (на случай перезапуска сервера)
    # active_matches in-memory сброшен, но матч может быть в PostgreSQL
    try:
        async for session in get_session():
            from sqlalchemy import or_
            stmt = (
                select(PvPMatch)
                .where(
                    or_(
                        PvPMatch.player1_id == player_id,
                        PvPMatch.player2_id == player_id,
                    ),
                    PvPMatch.status.in_(list(ACTIVE_STATUSES)),
                )
                .order_by(PvPMatch.created_at.desc())
                .limit(1)
            )
            result = await session.execute(stmt)
            db_match = result.scalar_one_or_none()

            if db_match:
                p1 = str(db_match.player1_id or "")
                p2 = str(db_match.player2_id or "")
                mid = str(db_match.id or db_match.match_id or "")

                # PATCH: Подгружаем матч в in-memory чтобы не лезть в БД при следующем запросе
                match_dict = {
                    "match_id": mid,
                    "player1_id": p1,
                    "player2_id": p2,
                    "status": db_match.status,
                    "escrow_locked": getattr(db_match, "escrow_locked", False) or False,
                    "player1_escrow_confirmed": getattr(db_match, "player1_escrow_confirmed", False) or False,
                    "player2_escrow_confirmed": getattr(db_match, "player2_escrow_confirmed", False) or False,
                    "created_at": str(db_match.created_at) if db_match.created_at else None,
                    "escrow_timeout_at": getattr(db_match, "escrow_timeout_at", None),
                }
                # Кладём в in-memory
                active_matches[mid] = match_dict

                my_escrow_confirmed = (
                    match_dict.get("player1_escrow_confirmed", False) if player_id == p1
                    else match_dict.get("player2_escrow_confirmed", False)
                )
                print(f"[MATCHES] /active found in DB: match={mid} player={player_id} status={db_match.status}")
                return {
                    "match_id": mid,
                    "status": db_match.status,
                    "escrow_locked": match_dict["escrow_locked"],
                    "player1_id": p1,
                    "player2_id": p2,
                    "player1_escrow_confirmed": match_dict["player1_escrow_confirmed"],
                    "player2_escrow_confirmed": match_dict["player2_escrow_confirmed"],
                    "my_escrow_confirmed": my_escrow_confirmed,
                    "escrow_timeout_at": match_dict.get("escrow_timeout_at"),
                    "created_at": match_dict.get("created_at"),
                }
    except Exception as e:
        print(f"[MATCHES] /active DB search error: {e}")
        traceback.print_exc()

    # PATCH: Ничего не нашли — 404, фронт поймает и скроет баннер
    raise HTTPException(status_code=404, detail="No active match found")


@router.get("/leaderboard")
async def get_leaderboard(limit: int = 50):
    try:
        async for session in get_session():
            from sqlalchemy import desc
            stmt = select(User).order_by(desc(User.elo_rating)).limit(limit)
            result = await session.execute(stmt)
            users = result.scalars().all()
            leaders = []
            for i, u in enumerate(users):
                leaders.append({
                    "rank": i + 1,
                    "user_id": u.id,
                    "username": u.username or u.first_name or f"Player #{u.id}",
                    "first_name": u.first_name or "",
                    "photo_url": getattr(u, "photo_url", None) or "",
                    "rating": u.elo_rating or 0,
                    "wins": u.wins or 0,
                    "losses": u.losses or 0,
                    "rank_name": u.rank or "Новичок",
                })
            return {"leaders": leaders, "total": len(leaders)}
    except Exception as e:
        print(f"[LEADERBOARD] Error: {e}")
        traceback.print_exc()
        return {"leaders": [], "total": 0}


@router.get("/config/status")
async def get_escrow_status():
    return {
        "escrow_wallet": ESCROW_WALLET,
        "escrow_configured": is_escrow_configured(),
        "nft_contract": NFT_CONTRACT_ID or "NOT SET",
    }


# ── POST ROUTES ───────────────────────────────────────────────

@router.post("/create")
async def create_match(request: CreateMatchRequest):
    match_id = str(uuid.uuid4())
    match_data = {
        "match_id": match_id,
        "player1_id": str(request.player1_id) if request.player1_id else None,
        "player2_id": str(request.player2_id) if request.player2_id else None,
        "mode": request.mode,
        "status": "waiting",
        "player1_deck": request.player1_deck or [],
        "player2_deck": request.player2_deck or [],
        "board": [None] * 9,
        "board_elements": [],
        "player1_hand": [],
        "player2_hand": [],
        "moves_count": 0,
        "player1_score": 0,
        "player2_score": 0,
        "current_round": 0,
        "created_at": datetime.utcnow().isoformat(),
        "escrow_locked": False,
        "winner": None,
        "claimed": False,
        "claimed_token_id": None,
        "refunded": False,
    }
    await _save_match(match_data)
    print(f"[MATCHES] Created match {match_id}")
    return {"match_id": match_id, "status": "waiting", "message": "Match created"}


# ── DYNAMIC ROUTES ────────────────────────────────────────────

@router.post("/{match_id}/register_deposits")
async def register_deposits(
        match_id: str,
        request: RegisterDepositsRequest,
        authorization: Optional[str] = Header(None),
):
    match_data = await _get_match(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)
    if not player_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    if player_id not in [match_data.get("player1_id"), match_data.get("player2_id")]:
        if not match_data.get("player2_id"):
            match_data["player2_id"] = player_id
        else:
            raise HTTPException(status_code=403, detail="Not a participant")

    if request.near_wallet:
        key = "player1_near_wallet" if player_id == match_data.get("player1_id") else "player2_near_wallet"
        match_data[key] = request.near_wallet

    nft_contract = request.nft_contract_id or NFT_CONTRACT_ID

    # Сохраняем депозиты в БД
    try:
        async for session in get_session():
            # PATCH: Идемпотентность — проверяем существующие депозиты игрока.
            # На мобилке клиент может прислать запрос дважды (retry после сетевой ошибки).
            # Не удаляем и не дублируем — если token_id уже есть, обновляем image/wallet.
            existing_result = await session.execute(
                select(MatchDeposit).where(
                    MatchDeposit.match_id == match_id,
                    MatchDeposit.player_id == player_id
                )
            )
            existing_deposits = existing_result.scalars().all()
            existing_token_ids = {d.token_id for d in existing_deposits}

            print(f"[MATCHES] register_deposits: match={match_id} player={player_id} "
                  f"existing={len(existing_deposits)} new={len(request.token_ids)}")

            for i, token_id in enumerate(request.token_ids):
                image = request.images[i] if request.images and i < len(request.images) else None
                if not image and nft_contract:
                    image = await fetch_nft_image(token_id, nft_contract)

                if token_id in existing_token_ids:
                    # PATCH: Обновляем существующий депозит (image мог не загрузиться с первого раза)
                    for dep in existing_deposits:
                        if dep.token_id == token_id:
                            if image and not dep.image:
                                dep.image = image
                            if request.near_wallet and not dep.near_wallet:
                                dep.near_wallet = request.near_wallet
                            break
                else:
                    # Новый депозит
                    session.add(MatchDeposit(
                        match_id=match_id,
                        player_id=player_id,
                        token_id=token_id,
                        nft_contract_id=nft_contract,
                        image=image,
                        near_wallet=request.near_wallet,
                    ))

            await session.commit()

            # Проверяем оба депозита
            all_deposits_result = await session.execute(
                select(MatchDeposit).where(MatchDeposit.match_id == match_id)
            )
            all_deps = all_deposits_result.scalars().all()
            p1_id = match_data.get("player1_id")
            p2_id = match_data.get("player2_id")
            p1_token_ids = [d.token_id for d in all_deps if d.player_id == p1_id]
            p2_token_ids = [d.token_id for d in all_deps if d.player_id == p2_id]
            p1_has = len(p1_token_ids) >= 5
            p2_has = len(p2_token_ids) >= 5

            print(f"[MATCHES] register_deposits check: p1={p1_id}({len(p1_token_ids)}) "
                  f"p2={p2_id}({len(p2_token_ids)}) → both={p1_has and p2_has}")

            if p1_id and p2_id and p1_has and p2_has:
                match_data["escrow_locked"] = True
                match_data["status"] = "active"
                print(f"[MATCHES] BOTH DEPOSITED → escrow_locked=True match={match_id}")

    except Exception as e:
        print(f"[MATCHES] register_deposits DB error: {e}")
        traceback.print_exc()

    await _save_match(match_data)
    return {
        "success": True,
        "deposits_count": len(request.token_ids),
        "escrow_locked": match_data.get("escrow_locked", False),
        "status": match_data.get("status"),
    }


@router.post("/{match_id}/confirm_escrow")
async def confirm_escrow(match_id: str, body: dict):
    match_data = await _get_match(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")
    if match_data.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Match was cancelled")

    player_id = body.get("player_id")
    tx_hash = body.get("tx_hash")
    token_ids = body.get("token_ids", [])
    near_wallet = body.get("near_wallet")

    if not player_id:
        raise HTTPException(status_code=400, detail="player_id required")

    if player_id == match_data.get("player1_id"):
        match_data["player1_escrow_tx"] = tx_hash
        match_data["player1_escrow_confirmed"] = True
        if near_wallet:
            match_data["player1_near_wallet"] = near_wallet
    elif player_id == match_data.get("player2_id"):
        match_data["player2_escrow_tx"] = tx_hash
        match_data["player2_escrow_confirmed"] = True
        if near_wallet:
            match_data["player2_near_wallet"] = near_wallet
    else:
        if not match_data.get("player2_id"):
            match_data["player2_id"] = player_id
            match_data["player2_escrow_tx"] = tx_hash
            match_data["player2_escrow_confirmed"] = True
            if near_wallet:
                match_data["player2_near_wallet"] = near_wallet

    # Сохраняем депозиты если есть
    if token_ids:
        try:
            async for session in get_session():
                contract = NFT_CONTRACT_ID or ""
                for tid in token_ids:
                    image = await fetch_nft_image(tid, contract)
                    session.add(MatchDeposit(
                        match_id=match_id,
                        player_id=player_id,
                        token_id=tid,
                        nft_contract_id=contract,
                        near_wallet=near_wallet,
                        image=image,
                    ))
                await session.commit()
        except Exception as e:
            print(f"[MATCHES] confirm_escrow deposit error: {e}")

    p1_confirmed = match_data.get("player1_escrow_confirmed", False)
    p2_confirmed = match_data.get("player2_escrow_confirmed", False)
    if p1_confirmed and p2_confirmed:
        match_data["escrow_locked"] = True
        match_data["status"] = "active"
        match_data["game_started_at"] = datetime.utcnow().isoformat()

    await _save_match(match_data)

    # PATCH: Если оба залочили — уведомляем WS что можно стартовать
    if p1_confirmed and p2_confirmed:
        try:
            from routers.ws_match import ws_manager
            await ws_manager.broadcast_all(match_id, {
                "type": "escrow_locked",
                "message": "Both players locked NFTs. Game starting!",
            })
            print(f"[MATCHES] confirm_escrow: broadcasted escrow_locked for match {match_id}")
        except Exception as e:
            print(f"[MATCHES] confirm_escrow WS broadcast error: {e}")

    return {
        "success": True,
        "escrow_locked": match_data.get("escrow_locked", False),
        "status": match_data.get("status"),
        "both_locked": p1_confirmed and p2_confirmed,
    }


@router.get("/{match_id}/opponent_deposits")
async def get_opponent_deposits(
        match_id: str,
        authorization: Optional[str] = Header(None),
):
    match_data = await _get_match(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)
    if not player_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    p1_id = match_data.get("player1_id")
    p2_id = match_data.get("player2_id")

    if player_id == p1_id:
        opponent_id = p2_id
    elif player_id == p2_id:
        opponent_id = p1_id
    else:
        raise HTTPException(status_code=403, detail="Not a participant")

    deposits_list = []
    try:
        async for session in get_session():
            result = await session.execute(
                select(MatchDeposit).where(
                    MatchDeposit.match_id == match_id,
                    MatchDeposit.player_id == opponent_id,
                )
            )
            deposits = result.scalars().all()
            deposits_list = [
                {
                    "index": i,
                    "token_id": d.token_id,
                    "nft_contract_id": d.nft_contract_id,
                    "image": d.image,
                }
                for i, d in enumerate(deposits)
            ]
    except Exception as e:
        print(f"[MATCHES] get_opponent_deposits DB error: {e}")

    return {
        "match_id": match_id,
        "opponent_id": opponent_id,
        "deposits": deposits_list,
        "count": len(deposits_list),
    }


@router.post("/{match_id}/claim")
async def claim_card(
        match_id: str,
        request: ClaimRequest,
        authorization: Optional[str] = Header(None),
):
    match_data = await _get_match(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")
    if match_data.get("status") != "finished":
        raise HTTPException(status_code=400, detail="Match is not finished")
    if match_data.get("claimed"):
        raise HTTPException(status_code=400, detail="Already claimed")

    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)
    if not player_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    winner_id = match_data.get("winner")
    if player_id != winner_id:
        raise HTTPException(status_code=403, detail="Only winner can claim")

    p1_id = match_data.get("player1_id")
    p2_id = match_data.get("player2_id")
    loser_id = p2_id if winner_id == p1_id else p1_id

    picked_card = None
    token_id = None
    nft_contract_id = None
    image = None

    try:
        async for session in get_session():
            result = await session.execute(
                select(MatchDeposit).where(
                    MatchDeposit.match_id == match_id,
                    MatchDeposit.player_id == loser_id,
                )
            )
            loser_deposits = result.scalars().all()

            if not loser_deposits:
                raise HTTPException(status_code=400, detail="No deposits found for loser")

            pick_index = request.pick_index
            if not (0 <= pick_index < len(loser_deposits)):
                raise HTTPException(status_code=400, detail=f"Invalid pick_index: {pick_index}")

            picked_deposit = loser_deposits[pick_index]
            token_id = picked_deposit.token_id
            nft_contract_id = picked_deposit.nft_contract_id or NFT_CONTRACT_ID
            image = picked_deposit.image

            if not image and nft_contract_id and token_id:
                image = await fetch_nft_image(token_id, nft_contract_id)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[MATCHES] claim DB error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Database error")

    winner_near_wallet = match_data.get(
        "player1_near_wallet" if winner_id == p1_id else "player2_near_wallet"
    )

    transfer_result = None
    if is_escrow_configured() and winner_near_wallet:
        transfer_result = await transfer_nft_from_escrow(
            to_wallet=winner_near_wallet,
            token_id=token_id,
            nft_contract_id=nft_contract_id,
        )

    match_data["claimed"] = True
    match_data["claimed_token_id"] = token_id
    match_data["claimed_at"] = datetime.utcnow().isoformat()
    await _save_match(match_data)

    await refund_remaining_nfts(match_id)

    return {
        "success": True,
        "claimed_card": {
            "token_id": token_id,
            "nft_contract_id": nft_contract_id,
            "image": image,
            "imageUrl": image,
            "index": request.pick_index,
        },
        "transfer": transfer_result,
        "message": "Card claimed successfully!",
    }


async def refund_remaining_nfts(match_id: str):
    match_data = await _get_match(match_id)
    if not match_data or match_data.get("refunded"):
        return

    claimed_token_id = match_data.get("claimed_token_id")

    try:
        async for session in get_session():
            result = await session.execute(
                select(MatchDeposit).where(
                    MatchDeposit.match_id == match_id,
                    MatchDeposit.refunded == False,
                )
            )
            deposits = result.scalars().all()
            refunds = []

            for dep in deposits:
                if dep.token_id == claimed_token_id:
                    continue

                near_wallet = dep.near_wallet
                if not near_wallet:
                    if dep.player_id == match_data.get("player1_id"):
                        near_wallet = match_data.get("player1_near_wallet")
                    else:
                        near_wallet = match_data.get("player2_near_wallet")

                if near_wallet and is_escrow_configured():
                    result_transfer = await transfer_nft_from_escrow(
                        to_wallet=near_wallet,
                        token_id=dep.token_id,
                        nft_contract_id=dep.nft_contract_id or NFT_CONTRACT_ID,
                    )
                    if result_transfer.get("success"):
                        dep.refunded = True
                        refunds.append(dep.token_id)

            await session.commit()
            print(f"[MATCHES] Refunded {len(refunds)} NFTs for match {match_id}")
    except Exception as e:
        print(f"[MATCHES] refund_remaining_nfts error: {e}")
        traceback.print_exc()

    match_data["refunded"] = True
    match_data["refunded_at"] = datetime.utcnow().isoformat()
    await _save_match(match_data)


@router.get("/{match_id}/deposits")
async def get_all_deposits(match_id: str):
    match_data = await _get_match(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    deposits_by_player = {}
    try:
        async for session in get_session():
            result = await session.execute(
                select(MatchDeposit).where(MatchDeposit.match_id == match_id)
            )
            for dep in result.scalars().all():
                if dep.player_id not in deposits_by_player:
                    deposits_by_player[dep.player_id] = []
                deposits_by_player[dep.player_id].append({
                    "token_id": dep.token_id,
                    "nft_contract_id": dep.nft_contract_id,
                    "image": dep.image,
                })
    except Exception as e:
        print(f"[MATCHES] get_all_deposits error: {e}")

    return {
        "match_id": match_id,
        "deposits": deposits_by_player,
        "player1_id": match_data.get("player1_id"),
        "player2_id": match_data.get("player2_id"),
        "escrow_locked": match_data.get("escrow_locked", False),
    }


@router.post("/{match_id}/cancel")
async def cancel_match(match_id: str, authorization: Optional[str] = Header(None)):
    match_data = await _get_match(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)

    match_data["status"] = "cancelled"
    match_data["cancelled_at"] = datetime.utcnow().isoformat()
    match_data["cancelled_by"] = player_id
    await _save_match(match_data)

    refunds = []
    try:
        async for session in get_session():
            result = await session.execute(
                select(MatchDeposit).where(MatchDeposit.match_id == match_id)
            )
            deposits = result.scalars().all()
            for dep in deposits:
                near_wallet = dep.near_wallet
                if not near_wallet:
                    if dep.player_id == match_data.get("player1_id"):
                        near_wallet = match_data.get("player1_near_wallet")
                    else:
                        near_wallet = match_data.get("player2_near_wallet")
                if near_wallet and is_escrow_configured():
                    r = await transfer_nft_from_escrow(
                        to_wallet=near_wallet,
                        token_id=dep.token_id,
                        nft_contract_id=dep.nft_contract_id or NFT_CONTRACT_ID,
                    )
                    refunds.append({"player_id": dep.player_id, "token_id": dep.token_id, "result": r})
    except Exception as e:
        print(f"[MATCHES] cancel refund error: {e}")

    return {"success": True, "message": "Match cancelled", "refunds": refunds}


@router.get("/{match_id}")
async def get_match_endpoint(match_id: str):
    match_data = await _get_match(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")
    return match_data


@router.post("/{match_id}/finish")
async def finish_match(
        match_id: str,
        body: dict,
        authorization: Optional[str] = Header(None),
):
    match_data = await _get_match(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)

    if not player_id:
        raise HTTPException(status_code=401, detail="Auth required")

    if player_id not in [match_data.get("player1_id"), match_data.get("player2_id")]:
        raise HTTPException(status_code=403, detail="Not a participant")

    if match_data.get("status") == "finished":
        return {"success": True, "winner": match_data.get("winner"), "already_finished": True}

    winner_user_id = body.get("winner_user_id")
    winner_near_wallet = body.get("winner_near_wallet")

    if winner_user_id and str(winner_user_id) not in [
        match_data.get("player1_id"),
        match_data.get("player2_id")
    ]:
        raise HTTPException(status_code=400, detail="Invalid winner")

    match_data["status"] = "finished"
    match_data["winner"] = str(winner_user_id) if winner_user_id else None
    if winner_near_wallet:
        match_data["winner_near_wallet"] = winner_near_wallet
    match_data["finished_at"] = datetime.utcnow().isoformat()

    rating_update = None
    p1_id = match_data.get("player1_id")
    p2_id = match_data.get("player2_id")
    if p1_id and p2_id and winner_user_id:
        loser_id = p2_id if str(winner_user_id) == str(p1_id) else p1_id
        rating_update = await update_player_ratings(
            winner_id=str(winner_user_id),
            loser_id=str(loser_id),
        )
        if rating_update:
            match_data["rating_update"] = rating_update

    await _save_match(match_data)
    return {"success": True, "winner": winner_user_id, "rating_update": rating_update}


async def update_player_ratings(winner_id: str, loser_id: str) -> Optional[Dict]:
    try:
        async for session in get_session():
            winner = await session.get(User, int(winner_id))
            loser = await session.get(User, int(loser_id))

            if not winner or not loser:
                print(f"[RATING] Users not found: winner={winner_id}, loser={loser_id}")
                return None

            winner_rating = winner.elo_rating if winner.elo_rating is not None else 0
            loser_rating = loser.elo_rating if loser.elo_rating is not None else 0

            winner_change, loser_change = calculate_rating_change(winner_rating, loser_rating)

            new_winner_rating = max(0, winner_rating + winner_change)
            new_loser_rating = max(0, loser_rating + loser_change)

            new_winner_rank = get_rank_by_rating(new_winner_rating)
            new_loser_rank = get_rank_by_rating(new_loser_rating)

            winner.elo_rating = new_winner_rating
            winner.rank = new_winner_rank["name"]
            winner.pvp_wins = (winner.pvp_wins or 0) + 1
            winner.wins = (winner.wins or 0) + 1
            winner.total_matches = (winner.total_matches or 0) + 1

            loser.elo_rating = new_loser_rating
            loser.rank = new_loser_rank["name"]
            loser.pvp_losses = (loser.pvp_losses or 0) + 1
            loser.losses = (loser.losses or 0) + 1
            loser.total_matches = (loser.total_matches or 0) + 1

            await session.commit()

            print(f"[RATING] winner {winner_id}: {winner_rating}→{new_winner_rating}")
            print(f"[RATING] loser  {loser_id}: {loser_rating}→{new_loser_rating}")

            return {
                "winner": {
                    "id": winner_id,
                    "old_rating": winner_rating,
                    "new_rating": new_winner_rating,
                    "change": winner_change,
                    "rank": new_winner_rank["name"],
                },
                "loser": {
                    "id": loser_id,
                    "old_rating": loser_rating,
                    "new_rating": new_loser_rating,
                    "change": loser_change,
                    "rank": new_loser_rank["name"],
                },
            }
    except Exception as e:
        print(f"[RATING] Error: {e}")
        traceback.print_exc()
        return None


@router.post("/{match_id}/claim_tx")
async def record_claim_tx(match_id: str, body: dict):
    match_data = await _get_match(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")
    match_data["claim_tx_hash"] = body.get("tx_hash")
    await _save_match(match_data)
    return {"success": True}


@router.post("/{match_id}/reconnect")
async def reconnect_to_match(match_id: str):
    match_data = await _get_match(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")
    return {"success": True, "message": "Reconnected"}
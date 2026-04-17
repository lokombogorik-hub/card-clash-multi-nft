from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import uuid
import asyncio

from database.session import get_session
from database.models.pvp_match import PvPMatch
from database.models.match_deposit import MatchDeposit

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])

# In-memory для быстрого доступа (кэш поверх БД)
matchmaking_queue: Dict[str, Dict[str, Any]] = {}
active_matches: Dict[str, Dict[str, Any]] = {}

ESCROW_LOCK_TIMEOUT_SECONDS = 150
GAME_RECONNECT_TIMEOUT_SECONDS = 180


class JoinQueueRequest(BaseModel):
    max_elo_diff: Optional[int] = 300


def get_user_id_from_token(authorization: str = None) -> Optional[str]:
    if not authorization:
        return None
    try:
        from utils.security import decode_access_token
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        payload = decode_access_token(token)
        if payload:
            user_id = payload.get("sub") or payload.get("user_id") or payload.get("telegram_id")
            if user_id:
                return str(user_id)
    except Exception as e:
        print(f"[Matchmaking] Token decode error: {e}")
    return None


def get_user_deck(user_id: str) -> List[Dict]:
    from routers.decks import _decks_storage
    print(f"[Matchmaking] Looking for deck, user_id={user_id}")
    print(f"[Matchmaking] Available decks: {list(_decks_storage.keys())}")

    deck = _decks_storage.get(user_id, {}).get("full_cards", [])
    if deck and len(deck) == 5:
        print(f"[Matchmaking] Found deck for {user_id}: {len(deck)} cards")
        return deck

    deck = _decks_storage.get("default_user", {}).get("full_cards", [])
    if deck and len(deck) == 5:
        print(f"[Matchmaking] Using default_user deck: {len(deck)} cards")
        return deck

    print(f"[Matchmaking] No deck found for {user_id}")
    return []


def calculate_elo_range(wait_time_seconds: float, max_diff: int = 300) -> int:
    if wait_time_seconds < 10:
        return max_diff
    elif wait_time_seconds < 30:
        return max_diff + 100
    elif wait_time_seconds < 60:
        return max_diff + 200
    return 500


def find_opponent(user_id: str, user_elo: int, max_elo_diff: int) -> Optional[str]:
    now = datetime.utcnow()
    for queue_user_id, queue_data in list(matchmaking_queue.items()):
        if queue_user_id == user_id:
            continue
        if queue_data.get("match_id"):
            continue
        wait_time = (now - queue_data.get("joined_at", now)).total_seconds()
        opponent_elo = queue_data.get("elo", 1000)
        elo_range = calculate_elo_range(wait_time, max_elo_diff)
        if abs(user_elo - opponent_elo) <= elo_range:
            return queue_user_id
    return None


async def _save_match_to_db(match_data: Dict) -> bool:
    """Сохраняем матч в PostgreSQL"""
    try:
        async for session in get_session():
            existing = await session.get(PvPMatch, match_data["match_id"])
            if existing:
                for key, value in match_data.items():
                    if key == "match_id":
                        continue
                    if hasattr(existing, key):
                        setattr(existing, key, value)
            else:
                match = PvPMatch(
                    id=match_data["match_id"],
                    player1_id=match_data.get("player1_id", ""),
                    player2_id=match_data.get("player2_id"),
                    status=match_data.get("status", "waiting"),
                    player1_deck=match_data.get("player1_deck", []),
                    player2_deck=match_data.get("player2_deck", []),
                    board=match_data.get("board", [None] * 9),
                    board_elements=match_data.get("board_elements", []),
                    current_turn=match_data.get("current_turn"),
                    player1_hand=match_data.get("player1_hand", []),
                    player2_hand=match_data.get("player2_hand", []),
                    player1_escrow_confirmed=match_data.get("player1_escrow_confirmed", False),
                    player2_escrow_confirmed=match_data.get("player2_escrow_confirmed", False),
                    player1_near_wallet=match_data.get("player1_near_wallet"),
                    player2_near_wallet=match_data.get("player2_near_wallet"),
                    escrow_locked=match_data.get("escrow_locked", False),
                    mode=match_data.get("mode", "pvp"),
                )
                session.add(match)
            await session.commit()
            return True
    except Exception as e:
        print(f"[Matchmaking] DB save error: {e}")
        return False


async def _load_match_from_db(match_id: str) -> Optional[Dict]:
    """Загружаем матч из PostgreSQL"""
    try:
        async for session in get_session():
            match = await session.get(PvPMatch, match_id)
            if not match:
                return None
            return {
                "match_id": match.id,
                "player1_id": match.player1_id,
                "player2_id": match.player2_id,
                "status": match.status,
                "player1_deck": match.player1_deck or [],
                "player2_deck": match.player2_deck or [],
                "board": match.board or [None] * 9,
                "board_elements": match.board_elements or [],
                "current_turn": match.current_turn,
                "player1_hand": match.player1_hand or [],
                "player2_hand": match.player2_hand or [],
                "player1_escrow_confirmed": match.player1_escrow_confirmed or False,
                "player2_escrow_confirmed": match.player2_escrow_confirmed or False,
                "player1_near_wallet": match.player1_near_wallet,
                "player2_near_wallet": match.player2_near_wallet,
                "player1_escrow_tx": match.player1_escrow_tx,
                "player2_escrow_tx": match.player2_escrow_tx,
                "escrow_locked": match.escrow_locked or False,
                "claimed": match.claimed or False,
                "claimed_token_id": match.claimed_token_id,
                "refunded": match.refunded or False,
                "winner": match.winner,
                "mode": match.mode or "pvp",
                "player1_ready": match.player1_ready or False,
                "player2_ready": match.player2_ready or False,
                "moves_count": match.moves_count or 0,
                "created_at": match.created_at.isoformat() if match.created_at else datetime.utcnow().isoformat(),
                "escrow_timeout_at": match.escrow_timeout_at.isoformat() if match.escrow_timeout_at else None,
            }
    except Exception as e:
        print(f"[Matchmaking] DB load error: {e}")
        return None

async def get_all_matches() -> dict:
    """Возвращает все матчи из памяти"""
    return matches_storage  # или как у тебя называется dict с матчами

async def get_match(match_id: str) -> Optional[Dict]:
    """Получаем матч: сначала из памяти, потом из БД"""
    if match_id in active_matches:
        return active_matches[match_id]
    match = await _load_match_from_db(match_id)
    if match:
        active_matches[match_id] = match
    return match


async def save_match(match_data: Dict):
    """Сохраняем матч в память и БД"""
    match_id = match_data["match_id"]
    active_matches[match_id] = match_data
    await _save_match_to_db(match_data)


async def check_and_refund_stale_match(match_id: str) -> bool:
    from routers.matches import transfer_nft_from_escrow, is_escrow_configured

    match_data = await get_match(match_id)
    if not match_data:
        return False

    if match_data.get("status") not in ["waiting", "waiting_escrow", "pending_lock"]:
        return False

    created_at_str = match_data.get("created_at")
    if not created_at_str:
        return False

    try:
        if isinstance(created_at_str, str):
            created_at = datetime.fromisoformat(created_at_str.replace("Z", ""))
        else:
            created_at = created_at_str
    except Exception:
        return False

    elapsed = (datetime.utcnow() - created_at).total_seconds()
    if elapsed < ESCROW_LOCK_TIMEOUT_SECONDS:
        return False

    print(f"[Matchmaking] Match {match_id} timed out after {elapsed:.0f}s, refunding...")

    p1_confirmed = match_data.get("player1_escrow_confirmed", False)
    p2_confirmed = match_data.get("player2_escrow_confirmed", False)

    if not p1_confirmed and not p2_confirmed:
        match_data["status"] = "cancelled"
        match_data["cancelled_reason"] = "timeout_no_locks"
        match_data["cancelled_at"] = datetime.utcnow().isoformat()
        await save_match(match_data)
        return True

    # Рефандим из БД
    refunded_count = 0
    try:
        async for session in get_session():
            from sqlalchemy import select
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
                    result_transfer = await transfer_nft_from_escrow(
                        to_wallet=near_wallet,
                        token_id=dep.token_id,
                        nft_contract_id=dep.nft_contract_id or "",
                    )
                    if result_transfer.get("success"):
                        dep.refunded = True
                        refunded_count += 1

            await session.commit()
    except Exception as e:
        print(f"[Matchmaking] Refund error: {e}")

    match_data["status"] = "cancelled"
    match_data["cancelled_reason"] = "timeout_incomplete_locks"
    match_data["cancelled_at"] = datetime.utcnow().isoformat()
    match_data["refunded"] = True
    match_data["refund_count"] = refunded_count
    await save_match(match_data)

    print(f"[Matchmaking] Match {match_id} cancelled, refunded {refunded_count} NFTs")
    return True


async def cleanup_stale_matches():
    """Background task: cleanup stale matches"""
    while True:
        try:
            now = datetime.utcnow()
            stale_matches = []

            for match_id, match_data in list(active_matches.items()):
                if match_data.get("status") in ["waiting", "waiting_escrow", "pending_lock"]:
                    created_at_str = match_data.get("created_at")
                    if created_at_str:
                        try:
                            if isinstance(created_at_str, str):
                                created_at = datetime.fromisoformat(created_at_str.replace("Z", ""))
                            else:
                                created_at = created_at_str
                            elapsed = (now - created_at).total_seconds()
                            if elapsed > ESCROW_LOCK_TIMEOUT_SECONDS:
                                stale_matches.append(match_id)
                        except Exception:
                            pass

            for match_id in stale_matches:
                try:
                    await check_and_refund_stale_match(match_id)
                except Exception as e:
                    print(f"[Matchmaking] Error refunding stale match {match_id}: {e}")

            # Чистим очередь
            stale_queue = []
            for user_id, queue_data in list(matchmaking_queue.items()):
                joined_at = queue_data.get("joined_at")
                if joined_at:
                    elapsed = (now - joined_at).total_seconds()
                    if elapsed > 600 and not queue_data.get("match_id"):
                        stale_queue.append(user_id)

            for user_id in stale_queue:
                if user_id in matchmaking_queue:
                    del matchmaking_queue[user_id]
                    print(f"[Matchmaking] Removed stale user {user_id} from queue")

        except Exception as e:
            print(f"[Matchmaking] Cleanup error: {e}")

        await asyncio.sleep(30)


@router.post("/join_queue")
async def join_queue(
        request: JoinQueueRequest,
        authorization: str = Header(None)
):
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization required")

    user_deck = get_user_deck(user_id)
    if not user_deck or len(user_deck) < 5:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No deck saved. Select 5 cards first.")

    user_elo = 1000
    max_elo_diff = request.max_elo_diff or 300

    # Проверяем существующую запись в очереди
    if user_id in matchmaking_queue:
        queue_entry = matchmaking_queue[user_id]
        if queue_entry.get("match_id"):
            match_id = queue_entry["match_id"]
            match_data = await get_match(match_id)
            if match_data:
                if match_data.get("status") == "cancelled":
                    del matchmaking_queue[user_id]
                    return {"status": "cancelled", "message": "Previous match was cancelled. Search again."}

                del matchmaking_queue[user_id]
                opponent_id = match_data["player2_id"] if match_data["player1_id"] == user_id else match_data["player1_id"]
                return {
                    "status": "matched",
                    "match_id": match_id,
                    "opponent_id": opponent_id,
                    "message": "Match found!"
                }
        matchmaking_queue[user_id]["last_poll"] = datetime.utcnow()

    opponent_id = find_opponent(user_id, user_elo, max_elo_diff)

    if opponent_id and opponent_id in matchmaking_queue:
        match_id = str(uuid.uuid4())
        now = datetime.utcnow()
        opponent_deck = get_user_deck(opponent_id)

        match_data = {
            "match_id": match_id,
            "player1_id": user_id,
            "player2_id": opponent_id,
            "player1_deck": user_deck,
            "player2_deck": opponent_deck,
            "status": "waiting_escrow",
            "created_at": now.isoformat(),
            "current_round": 0,
            "player1_score": 0,
            "player2_score": 0,
            "player1_escrow_confirmed": False,
            "player2_escrow_confirmed": False,
            "escrow_timeout_at": (now + timedelta(seconds=ESCROW_LOCK_TIMEOUT_SECONDS)).isoformat(),
            "board": [None] * 9,
            "board_elements": [],
            "player1_hand": [],
            "player2_hand": [],
            "moves_count": 0,
            "mode": "pvp",
        }

        # Сохраняем в память И в БД
        await save_match(match_data)
        matchmaking_queue[opponent_id]["match_id"] = match_id

        if user_id in matchmaking_queue:
            del matchmaking_queue[user_id]

        print(f"[Matchmaking] Match created: {match_id} | {user_id} vs {opponent_id}")

        return {
            "status": "matched",
            "match_id": match_id,
            "opponent_id": opponent_id,
            "escrow_timeout_seconds": ESCROW_LOCK_TIMEOUT_SECONDS,
            "message": "Match found!"
        }

    # Добавляем в очередь
    if user_id not in matchmaking_queue:
        matchmaking_queue[user_id] = {
            "user_id": user_id,
            "elo": user_elo,
            "deck": user_deck,
            "joined_at": datetime.utcnow(),
            "last_poll": datetime.utcnow(),
            "match_id": None
        }
        print(f"[Matchmaking] User {user_id} joined queue. Size: {len(matchmaking_queue)}")

    position = list(matchmaking_queue.keys()).index(user_id) + 1
    return {
        "status": "searching",
        "position": position,
        "queue_size": len(matchmaking_queue),
        "message": f"Searching... ({len(matchmaking_queue)} in queue)"
    }


@router.post("/leave_queue")
async def leave_queue(authorization: str = Header(None)):
    user_id = get_user_id_from_token(authorization)
    if user_id and user_id in matchmaking_queue:
        del matchmaking_queue[user_id]
        print(f"[Matchmaking] User {user_id} left queue")
    return {"success": True, "message": "Left queue"}


@router.get("/queue_status")
async def get_queue_status(authorization: str = Header(None)):
    user_id = get_user_id_from_token(authorization)
    if not user_id or user_id not in matchmaking_queue:
        return {"status": "not_in_queue"}

    queue_entry = matchmaking_queue[user_id]
    if queue_entry.get("match_id"):
        match_id = queue_entry["match_id"]
        match_data = await get_match(match_id)
        if match_data:
            if match_data.get("status") == "cancelled":
                del matchmaking_queue[user_id]
                return {"status": "cancelled", "reason": match_data.get("cancelled_reason", "timeout")}

            opponent_id = match_data["player2_id"] if match_data["player1_id"] == user_id else match_data["player1_id"]
            remaining_seconds = None
            timeout_at_str = match_data.get("escrow_timeout_at")
            if timeout_at_str:
                try:
                    timeout_at = datetime.fromisoformat(timeout_at_str.replace("Z", ""))
                    remaining_seconds = max(0, (timeout_at - datetime.utcnow()).total_seconds())
                except Exception:
                    pass

            return {
                "status": "matched",
                "match_id": match_id,
                "opponent_id": opponent_id,
                "escrow_remaining_seconds": remaining_seconds,
                "player1_locked": match_data.get("player1_escrow_confirmed", False),
                "player2_locked": match_data.get("player2_escrow_confirmed", False),
            }

    return {"status": "searching", "queue_size": len(matchmaking_queue)}


@router.get("/queue-info")
async def get_queue_info():
    return {
        "queue_size": len(matchmaking_queue),
        "active_matches": len(active_matches),
        "users_in_queue": list(matchmaking_queue.keys()),
        "escrow_timeout_seconds": ESCROW_LOCK_TIMEOUT_SECONDS,
        "reconnect_timeout_seconds": GAME_RECONNECT_TIMEOUT_SECONDS,
    }


@router.post("/check_timeout/{match_id}")
async def check_match_timeout(match_id: str):
    refunded = await check_and_refund_stale_match(match_id)
    match_data = await get_match(match_id)
    if not match_data:
        return {"status": "not_found"}
    return {
        "status": match_data.get("status"),
        "refunded": refunded,
        "cancelled_reason": match_data.get("cancelled_reason"),
    }
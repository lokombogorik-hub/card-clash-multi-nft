# backend/routers/matchmaking.py
from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import uuid
import asyncio

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])

# In-memory storage
matchmaking_queue: Dict[str, Dict[str, Any]] = {}
active_matches: Dict[str, Dict[str, Any]] = {}

# Таймауты
ESCROW_LOCK_TIMEOUT_SECONDS = 150  # 2.5 минуты на lock phase
GAME_RECONNECT_TIMEOUT_SECONDS = 180  # 3 минуты на реконнект во время игры


class JoinQueueRequest(BaseModel):
    max_elo_diff: Optional[int] = 300


def get_user_id_from_token(authorization: str = None) -> str:
    """Extract user ID from JWT token"""
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
    """Get user's deck from storage"""
    from routers.decks import _decks_storage

    print(f"[Matchmaking] Looking for deck, user_id={user_id}")
    print(f"[Matchmaking] Available decks: {list(_decks_storage.keys())}")

    # Try user-specific deck first
    deck = _decks_storage.get(user_id, {}).get("full_cards", [])
    if deck and len(deck) == 5:
        print(f"[Matchmaking] Found deck for {user_id}: {len(deck)} cards")
        return deck

    # Fallback to default_user
    deck = _decks_storage.get("default_user", {}).get("full_cards", [])
    if deck and len(deck) == 5:
        print(f"[Matchmaking] Using default_user deck: {len(deck)} cards")
        return deck

    print(f"[Matchmaking] No deck found for {user_id}")
    return []


def calculate_elo_range(wait_time_seconds: float, max_diff: int = 300) -> int:
    """ELO range based on wait time"""
    if wait_time_seconds < 10:
        return max_diff
    elif wait_time_seconds < 30:
        return max_diff + 100
    elif wait_time_seconds < 60:
        return max_diff + 200
    return 500


def find_opponent(user_id: str, user_elo: int, max_elo_diff: int) -> Optional[str]:
    """Find matching opponent in queue"""
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


async def check_and_refund_stale_match(match_id: str) -> bool:
    """Check if match is stale and refund if needed. Returns True if refunded."""
    from routers.matches import match_deposits, transfer_nft_from_escrow, is_escrow_configured

    match_data = active_matches.get(match_id)
    if not match_data:
        return False

    # Проверяем только матчи в статусе waiting_escrow или waiting
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
    except:
        return False

    elapsed = (datetime.utcnow() - created_at).total_seconds()

    if elapsed < ESCROW_LOCK_TIMEOUT_SECONDS:
        return False

    # Таймаут истёк — рефандим
    print(f"[Matchmaking] Match {match_id} timed out after {elapsed:.0f}s, refunding...")

    p1_confirmed = match_data.get("player1_escrow_confirmed", False)
    p2_confirmed = match_data.get("player2_escrow_confirmed", False)

    # Если никто не залочил — просто отменяем
    if not p1_confirmed and not p2_confirmed:
        match_data["status"] = "cancelled"
        match_data["cancelled_reason"] = "timeout_no_locks"
        match_data["cancelled_at"] = datetime.utcnow().isoformat()
        active_matches[match_id] = match_data
        print(f"[Matchmaking] Match {match_id} cancelled - no one locked")
        return True

    # Рефандим тем, кто залочил
    deposits = match_deposits.get(match_id, {})
    refunded_count = 0

    for player_id, player_deposits in deposits.items():
        # Получаем кошелёк игрока
        near_wallet = None
        if player_id == match_data.get("player1_id"):
            near_wallet = match_data.get("player1_near_wallet")
        elif player_id == match_data.get("player2_id"):
            near_wallet = match_data.get("player2_near_wallet")

        if not near_wallet:
            for dep in player_deposits:
                if dep.get("near_wallet"):
                    near_wallet = dep["near_wallet"]
                    break

        if near_wallet and is_escrow_configured():
            for dep in player_deposits:
                token_id = dep.get("token_id")
                nft_contract = dep.get("nft_contract_id")

                if token_id:
                    result = await transfer_nft_from_escrow(
                        to_wallet=near_wallet,
                        token_id=token_id,
                        nft_contract_id=nft_contract or "",
                    )
                    if result.get("success"):
                        refunded_count += 1
                    print(f"[Matchmaking] Refund {token_id} to {near_wallet}: {result}")

    # Обновляем статус матча
    match_data["status"] = "cancelled"
    match_data["cancelled_reason"] = "timeout_incomplete_locks"
    match_data["cancelled_at"] = datetime.utcnow().isoformat()
    match_data["refunded_on_timeout"] = True
    match_data["refunded_count"] = refunded_count
    active_matches[match_id] = match_data

    # Очищаем deposits
    if match_id in match_deposits:
        del match_deposits[match_id]

    print(f"[Matchmaking] Match {match_id} cancelled, refunded {refunded_count} NFTs")
    return True


async def cleanup_stale_matches():
    """Background task: cleanup stale matches and refund NFTs"""
    while True:
        try:
            now = datetime.utcnow()
            stale_matches = []

            for match_id, match_data in list(active_matches.items()):
                # Проверяем матчи в состоянии ожидания lock
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
                        except:
                            pass

            # Обрабатываем stale матчи
            for match_id in stale_matches:
                try:
                    await check_and_refund_stale_match(match_id)
                except Exception as e:
                    print(f"[Matchmaking] Error refunding stale match {match_id}: {e}")

            # Также чистим очередь от старых записей
            stale_queue = []
            for user_id, queue_data in list(matchmaking_queue.items()):
                joined_at = queue_data.get("joined_at")
                if joined_at:
                    elapsed = (now - joined_at).total_seconds()
                    # Если в очереди больше 10 минут без матча — удаляем
                    if elapsed > 600 and not queue_data.get("match_id"):
                        stale_queue.append(user_id)

            for user_id in stale_queue:
                if user_id in matchmaking_queue:
                    del matchmaking_queue[user_id]
                    print(f"[Matchmaking] Removed stale user {user_id} from queue")

        except Exception as e:
            print(f"[Matchmaking] Cleanup error: {e}")

        # Проверяем каждые 30 секунд
        await asyncio.sleep(30)


@router.post("/join_queue")
async def join_queue(
        request: JoinQueueRequest,
        authorization: str = Header(None)
):
    """Join matchmaking queue"""

    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization required"
        )

    # Check if user has a deck
    user_deck = get_user_deck(user_id)
    if not user_deck or len(user_deck) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No deck saved. Select 5 cards first."
        )

    user_elo = 1000
    max_elo_diff = request.max_elo_diff or 300

    # Check if user already in queue with a match
    if user_id in matchmaking_queue:
        queue_entry = matchmaking_queue[user_id]
        if queue_entry.get("match_id"):
            match_id = queue_entry["match_id"]
            match_data = active_matches.get(match_id)
            if match_data:
                # Проверяем, не истёк ли таймаут
                if match_data.get("status") == "cancelled":
                    # Матч был отменён, удаляем из очереди
                    del matchmaking_queue[user_id]
                    return {
                        "status": "cancelled",
                        "message": "Previous match was cancelled due to timeout. Search again."
                    }

                del matchmaking_queue[user_id]
                opponent_id = match_data["player2_id"] if match_data["player1_id"] == user_id else match_data[
                    "player1_id"]
                return {
                    "status": "matched",
                    "match_id": match_id,
                    "opponent_id": opponent_id,
                    "message": "Match found!"
                }
        matchmaking_queue[user_id]["last_poll"] = datetime.utcnow()

    # Try to find opponent
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
            "status": "waiting_escrow",  # Ждём lock от обоих
            "created_at": now.isoformat(),
            "current_round": 0,
            "player1_score": 0,
            "player2_score": 0,
            "player1_escrow_confirmed": False,
            "player2_escrow_confirmed": False,
            "escrow_timeout_at": (now + timedelta(seconds=ESCROW_LOCK_TIMEOUT_SECONDS)).isoformat(),
        }

        active_matches[match_id] = match_data
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

    # Add to queue
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
    """Leave matchmaking queue"""

    user_id = get_user_id_from_token(authorization)
    if user_id and user_id in matchmaking_queue:
        del matchmaking_queue[user_id]
        print(f"[Matchmaking] User {user_id} left queue")

    return {"success": True, "message": "Left queue"}


@router.get("/queue_status")
async def get_queue_status(authorization: str = Header(None)):
    """Check queue status"""

    user_id = get_user_id_from_token(authorization)
    if not user_id or user_id not in matchmaking_queue:
        return {"status": "not_in_queue"}

    queue_entry = matchmaking_queue[user_id]

    if queue_entry.get("match_id"):
        match_id = queue_entry["match_id"]
        match_data = active_matches.get(match_id)
        if match_data:
            # Проверяем статус матча
            if match_data.get("status") == "cancelled":
                del matchmaking_queue[user_id]
                return {
                    "status": "cancelled",
                    "reason": match_data.get("cancelled_reason", "timeout"),
                    "message": "Match was cancelled"
                }

            opponent_id = match_data["player2_id"] if match_data["player1_id"] == user_id else match_data["player1_id"]

            # Вычисляем оставшееся время на lock
            remaining_seconds = None
            timeout_at_str = match_data.get("escrow_timeout_at")
            if timeout_at_str:
                try:
                    timeout_at = datetime.fromisoformat(timeout_at_str.replace("Z", ""))
                    remaining_seconds = max(0, (timeout_at - datetime.utcnow()).total_seconds())
                except:
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
    """Debug endpoint"""
    return {
        "queue_size": len(matchmaking_queue),
        "active_matches": len(active_matches),
        "users_in_queue": list(matchmaking_queue.keys()),
        "escrow_timeout_seconds": ESCROW_LOCK_TIMEOUT_SECONDS,
        "reconnect_timeout_seconds": GAME_RECONNECT_TIMEOUT_SECONDS,
    }


@router.post("/check_timeout/{match_id}")
async def check_match_timeout(match_id: str):
    """Manually check and handle match timeout"""
    refunded = await check_and_refund_stale_match(match_id)

    match_data = active_matches.get(match_id)
    if not match_data:
        return {"status": "not_found"}

    return {
        "status": match_data.get("status"),
        "refunded": refunded,
        "cancelled_reason": match_data.get("cancelled_reason"),
    }
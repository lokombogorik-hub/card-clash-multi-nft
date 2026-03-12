# backend/routers/matchmaking.py
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from database.db import get_database
from utils.security import decode_access_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import asyncio
import uuid

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])
security = HTTPBearer()

# В памяти храним очередь (для MVP, потом можно Redis)
matchmaking_queue: Dict[str, Dict[str, Any]] = {}
active_matches: Dict[str, Dict[str, Any]] = {}


class JoinQueueRequest(BaseModel):
    mode: str = "pvp"  # pvp, ranked, casual


class QueueResponse(BaseModel):
    status: str
    position: Optional[int] = None
    match_id: Optional[str] = None
    opponent: Optional[Dict[str, Any]] = None
    message: Optional[str] = None


class MatchData(BaseModel):
    match_id: str
    player1_id: str
    player2_id: str
    player1_deck: List[Dict[str, Any]]
    player2_deck: List[Dict[str, Any]]
    status: str
    created_at: str


async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db=Depends(get_database)
):
    """Извлекает текущего пользователя из JWT токена"""
    token = credentials.credentials
    payload = decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    user_id = payload.get("sub") or payload.get("user_id") or payload.get("telegram_id")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    users_collection = db["users"]
    user = await users_collection.find_one({
        "$or": [
            {"telegram_id": str(user_id)},
            {"telegram_id": int(user_id) if str(user_id).isdigit() else user_id}
        ]
    })

    if not user:
        user = {
            "telegram_id": str(user_id),
            "created_at": datetime.utcnow(),
            "elo_rating": 1000,
            "wins": 0,
            "losses": 0,
            "total_matches": 0
        }
        await users_collection.insert_one(user)
        user = await users_collection.find_one({"telegram_id": str(user_id)})

    return user


async def get_user_deck(user_id: str, db) -> Optional[Dict[str, Any]]:
    """Получает колоду пользователя"""
    decks_collection = db["decks"]
    deck = await decks_collection.find_one({"user_id": user_id})
    return deck


def calculate_elo_range(wait_time_seconds: float) -> int:
    """
    Расчёт допустимого диапазона ELO в зависимости от времени ожидания
    Первые 10 сек: ±100
    10-30 сек: ±200
    30-60 сек: ±300
    60+ сек: ±500
    """
    if wait_time_seconds < 10:
        return 100
    elif wait_time_seconds < 30:
        return 200
    elif wait_time_seconds < 60:
        return 300
    else:
        return 500


def find_match(user_id: str, user_elo: int) -> Optional[str]:
    """Ищет подходящего оппонента в очереди"""
    now = datetime.utcnow()

    for queue_user_id, queue_data in matchmaking_queue.items():
        if queue_user_id == user_id:
            continue

        # Время ожидания обоих игроков
        user_wait = (now - queue_data.get("joined_at", now)).total_seconds()
        opponent_elo = queue_data.get("elo", 1000)

        # Расчитываем допустимый диапазон
        elo_range = calculate_elo_range(user_wait)

        if abs(user_elo - opponent_elo) <= elo_range:
            return queue_user_id

    return None


@router.post("/join", response_model=QueueResponse)
async def join_queue(
        request: JoinQueueRequest,
        current_user: dict = Depends(get_current_user),
        db=Depends(get_database)
):
    """Присоединяется к очереди матчмейкинга"""

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))
    user_elo = current_user.get("elo_rating", 1000)

    # Проверяем колоду
    deck = await get_user_deck(user_id, db)

    if not deck or not deck.get("cards") or len(deck.get("cards", [])) != 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No deck saved. Select 5 cards first."
        )

    full_cards = deck.get("full_cards", [])
    if not full_cards or len(full_cards) != 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deck data incomplete. Please save your deck again."
        )

    # Проверяем, не в очереди ли уже
    if user_id in matchmaking_queue:
        # Обновляем время
        matchmaking_queue[user_id]["last_poll"] = datetime.utcnow()

        # Проверяем, не нашёлся ли матч
        if matchmaking_queue[user_id].get("match_id"):
            match_id = matchmaking_queue[user_id]["match_id"]
            del matchmaking_queue[user_id]

            match_data = active_matches.get(match_id)
            if match_data:
                opponent_id = match_data["player2_id"] if match_data["player1_id"] == user_id else match_data[
                    "player1_id"]
                return QueueResponse(
                    status="matched",
                    match_id=match_id,
                    opponent={"id": opponent_id},
                    message="Match found!"
                )

        position = list(matchmaking_queue.keys()).index(user_id) + 1
        return QueueResponse(
            status="waiting",
            position=position,
            message=f"Waiting for opponent... ({len(matchmaking_queue)} in queue)"
        )

    # Ищем матч
    opponent_id = find_match(user_id, user_elo)

    if opponent_id and opponent_id in matchmaking_queue:
        # Нашли матч!
        opponent_deck = await get_user_deck(opponent_id, db)

        match_id = str(uuid.uuid4())
        now = datetime.utcnow()

        match_data = {
            "match_id": match_id,
            "player1_id": user_id,
            "player2_id": opponent_id,
            "player1_deck": full_cards,
            "player2_deck": opponent_deck.get("full_cards", []),
            "status": "active",
            "created_at": now,
            "current_round": 0,
            "player1_score": 0,
            "player2_score": 0,
            "rounds": [],
            "reconnect_deadline": None
        }

        # Сохраняем в память и БД
        active_matches[match_id] = match_data

        matches_collection = db["matches"]
        await matches_collection.insert_one({
            **match_data,
            "created_at": now
        })

        # Уведомляем оппонента
        matchmaking_queue[opponent_id]["match_id"] = match_id

        # Удаляем обоих из очереди
        if opponent_id in matchmaking_queue:
            del matchmaking_queue[opponent_id]

        print(f"[Matchmaking] Match created: {match_id} between {user_id} and {opponent_id}")

        return QueueResponse(
            status="matched",
            match_id=match_id,
            opponent={"id": opponent_id},
            message="Match found!"
        )

    # Добавляем в очередь
    matchmaking_queue[user_id] = {
        "user_id": user_id,
        "elo": user_elo,
        "deck": full_cards,
        "joined_at": datetime.utcnow(),
        "last_poll": datetime.utcnow(),
        "mode": request.mode,
        "match_id": None
    }

    print(f"[Matchmaking] User {user_id} joined queue. Total in queue: {len(matchmaking_queue)}")

    return QueueResponse(
        status="waiting",
        position=len(matchmaking_queue),
        message=f"Searching for opponent... ({len(matchmaking_queue)} in queue)"
    )


@router.get("/status", response_model=QueueResponse)
async def get_queue_status(
        current_user: dict = Depends(get_current_user),
        db=Depends(get_database)
):
    """Проверяет статус в очереди"""

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))

    if user_id not in matchmaking_queue:
        return QueueResponse(
            status="not_in_queue",
            message="Not in matchmaking queue"
        )

    queue_data = matchmaking_queue[user_id]
    queue_data["last_poll"] = datetime.utcnow()

    if queue_data.get("match_id"):
        match_id = queue_data["match_id"]
        del matchmaking_queue[user_id]

        match_data = active_matches.get(match_id)
        if match_data:
            opponent_id = match_data["player2_id"] if match_data["player1_id"] == user_id else match_data["player1_id"]
            return QueueResponse(
                status="matched",
                match_id=match_id,
                opponent={"id": opponent_id},
                message="Match found!"
            )

    position = list(matchmaking_queue.keys()).index(user_id) + 1
    return QueueResponse(
        status="waiting",
        position=position,
        message=f"Position {position} in queue ({len(matchmaking_queue)} total)"
    )


@router.post("/leave")
async def leave_queue(
        current_user: dict = Depends(get_current_user)
):
    """Покидает очередь"""

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))

    if user_id in matchmaking_queue:
        del matchmaking_queue[user_id]
        return {"success": True, "message": "Left queue"}

    return {"success": True, "message": "Not in queue"}


@router.get("/match/{match_id}", response_model=MatchData)
async def get_match(
        match_id: str,
        current_user: dict = Depends(get_current_user),
        db=Depends(get_database)
):
    """Получает данные матча"""

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))

    # Сначала в памяти
    if match_id in active_matches:
        match_data = active_matches[match_id]
    else:
        # Потом в БД
        matches_collection = db["matches"]
        match_data = await matches_collection.find_one({"match_id": match_id})

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    # Проверяем, что пользователь участник
    if user_id not in [match_data["player1_id"], match_data["player2_id"]]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a participant of this match"
        )

    return MatchData(
        match_id=match_data["match_id"],
        player1_id=match_data["player1_id"],
        player2_id=match_data["player2_id"],
        player1_deck=match_data["player1_deck"],
        player2_deck=match_data["player2_deck"],
        status=match_data["status"],
        created_at=match_data["created_at"].isoformat() if hasattr(match_data["created_at"], 'isoformat') else str(
            match_data["created_at"])
    )


@router.get("/queue-info")
async def get_queue_info():
    """Отладочный эндпоинт — информация об очереди"""
    return {
        "queue_size": len(matchmaking_queue),
        "active_matches": len(active_matches),
        "users_in_queue": list(matchmaking_queue.keys())
    }


# Cleanup task — удаляем старые записи из очереди
async def cleanup_stale_queue_entries():
    """Удаляет пользователей, которые не опрашивали статус больше 30 секунд"""
    now = datetime.utcnow()
    stale_threshold = timedelta(seconds=30)

    to_remove = []
    for user_id, data in matchmaking_queue.items():
        if now - data.get("last_poll", now) > stale_threshold:
            to_remove.append(user_id)

    for user_id in to_remove:
        del matchmaking_queue[user_id]
        print(f"[Matchmaking] Removed stale user from queue: {user_id}")
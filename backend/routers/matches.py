# backend/routers/matches.py
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from database.db import get_database
from utils.security import decode_access_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/api/matches", tags=["matches"])
security = HTTPBearer()

# Reconnect timeout
RECONNECT_TIMEOUT_MINUTES = 3


class PlayCardRequest(BaseModel):
    match_id: str
    card_index: int
    attribute: str  # attack, defense, speed


class RoundResult(BaseModel):
    round_number: int
    player1_card: Dict[str, Any]
    player2_card: Dict[str, Any]
    attribute: str
    winner: str  # player1, player2, draw
    player1_value: int
    player2_value: int


class MatchState(BaseModel):
    match_id: str
    status: str
    current_round: int
    player1_score: int
    player2_score: int
    player1_id: str
    player2_id: str
    your_deck: List[Dict[str, Any]]
    opponent_deck: List[Dict[str, Any]]
    rounds: List[RoundResult]
    is_your_turn: bool
    winner: Optional[str] = None
    reconnect_deadline: Optional[str] = None


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

    return user


# Импортируем active_matches из matchmaking
from routers.matchmaking import active_matches


@router.get("/{match_id}/state", response_model=MatchState)
async def get_match_state(
        match_id: str,
        current_user: dict = Depends(get_current_user),
        db=Depends(get_database)
):
    """Получает текущее состояние матча"""

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))

    # Ищем матч
    match_data = active_matches.get(match_id)

    if not match_data:
        matches_collection = db["matches"]
        match_data = await matches_collection.find_one({"match_id": match_id})

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    # Проверяем участие
    is_player1 = user_id == match_data["player1_id"]
    is_player2 = user_id == match_data["player2_id"]

    if not is_player1 and not is_player2:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a participant"
        )

    # Обновляем last_activity для reconnect логики
    now = datetime.utcnow()
    if is_player1:
        match_data["player1_last_activity"] = now
    else:
        match_data["player2_last_activity"] = now

    # Определяем колоды для текущего игрока
    your_deck = match_data["player1_deck"] if is_player1 else match_data["player2_deck"]
    opponent_deck = match_data["player2_deck"] if is_player1 else match_data["player1_deck"]

    # Определяем чей ход (простая логика — по очереди)
    current_round = match_data.get("current_round", 0)
    is_your_turn = (current_round % 2 == 0 and is_player1) or (current_round % 2 == 1 and is_player2)

    return MatchState(
        match_id=match_id,
        status=match_data.get("status", "active"),
        current_round=current_round,
        player1_score=match_data.get("player1_score", 0),
        player2_score=match_data.get("player2_score", 0),
        player1_id=match_data["player1_id"],
        player2_id=match_data["player2_id"],
        your_deck=your_deck,
        opponent_deck=opponent_deck,
        rounds=match_data.get("rounds", []),
        is_your_turn=is_your_turn,
        winner=match_data.get("winner"),
        reconnect_deadline=match_data.get("reconnect_deadline").isoformat() if match_data.get(
            "reconnect_deadline") else None
    )


@router.post("/{match_id}/play")
async def play_card(
        match_id: str,
        request: PlayCardRequest,
        current_user: dict = Depends(get_current_user),
        db=Depends(get_database)
):
    """Разыгрывает карту в матче"""

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))

    match_data = active_matches.get(match_id)

    if not match_data:
        matches_collection = db["matches"]
        match_data = await matches_collection.find_one({"match_id": match_id})
        if match_data:
            active_matches[match_id] = match_data

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

    is_player1 = user_id == match_data["player1_id"]
    is_player2 = user_id == match_data["player2_id"]

    if not is_player1 and not is_player2:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a participant"
        )

    # Записываем ход
    current_round = match_data.get("current_round", 0)

    round_key = f"round_{current_round}"
    if round_key not in match_data:
        match_data[round_key] = {}

    player_key = "player1_move" if is_player1 else "player2_move"
    match_data[round_key][player_key] = {
        "card_index": request.card_index,
        "attribute": request.attribute
    }

    # Проверяем, оба ли игрока сделали ход
    if "player1_move" in match_data[round_key] and "player2_move" in match_data[round_key]:
        # Разыгрываем раунд
        p1_move = match_data[round_key]["player1_move"]
        p2_move = match_data[round_key]["player2_move"]

        p1_card = match_data["player1_deck"][p1_move["card_index"]]
        p2_card = match_data["player2_deck"][p2_move["card_index"]]

        # Используем атрибут первого игрока для сравнения
        attr = p1_move["attribute"]

        p1_value = p1_card.get("stats", {}).get(attr, 0) or p1_card.get(attr, 0)
        p2_value = p2_card.get("stats", {}).get(attr, 0) or p2_card.get(attr, 0)

        if p1_value > p2_value:
            winner = "player1"
            match_data["player1_score"] = match_data.get("player1_score", 0) + 1
        elif p2_value > p1_value:
            winner = "player2"
            match_data["player2_score"] = match_data.get("player2_score", 0) + 1
        else:
            winner = "draw"

        round_result = {
            "round_number": current_round,
            "player1_card": p1_card,
            "player2_card": p2_card,
            "attribute": attr,
            "winner": winner,
            "player1_value": p1_value,
            "player2_value": p2_value
        }

        if "rounds" not in match_data:
            match_data["rounds"] = []
        match_data["rounds"].append(round_result)

        match_data["current_round"] = current_round + 1

        # Проверяем окончание игры (5 раундов или досрочная победа)
        if current_round >= 4 or match_data["player1_score"] >= 3 or match_data["player2_score"] >= 3:
            match_data["status"] = "finished"

            if match_data["player1_score"] > match_data["player2_score"]:
                match_data["winner"] = match_data["player1_id"]
            elif match_data["player2_score"] > match_data["player1_score"]:
                match_data["winner"] = match_data["player2_id"]
            else:
                match_data["winner"] = "draw"

            # Обновляем ELO
            await update_elo_ratings(match_data, db)

    # Сохраняем в память и БД
    active_matches[match_id] = match_data

    matches_collection = db["matches"]
    await matches_collection.update_one(
        {"match_id": match_id},
        {"$set": match_data},
        upsert=True
    )

    return {"success": True, "message": "Move recorded"}


async def update_elo_ratings(match_data: dict, db):
    """Обновляет ELO рейтинги после матча"""

    users_collection = db["users"]

    player1_id = match_data["player1_id"]
    player2_id = match_data["player2_id"]
    winner = match_data.get("winner")

    player1 = await users_collection.find_one({"telegram_id": player1_id})
    player2 = await users_collection.find_one({"telegram_id": player2_id})

    if not player1 or not player2:
        return

    elo1 = player1.get("elo_rating", 1000)
    elo2 = player2.get("elo_rating", 1000)

    # ELO calculation
    k = 32
    expected1 = 1 / (1 + 10 ** ((elo2 - elo1) / 400))
    expected2 = 1 / (1 + 10 ** ((elo1 - elo2) / 400))

    if winner == player1_id:
        score1, score2 = 1, 0
    elif winner == player2_id:
        score1, score2 = 0, 1
    else:
        score1, score2 = 0.5, 0.5

    new_elo1 = round(elo1 + k * (score1 - expected1))
    new_elo2 = round(elo2 + k * (score2 - expected2))

    # Update player 1
    await users_collection.update_one(
        {"telegram_id": player1_id},
        {
            "$set": {"elo_rating": new_elo1},
            "$inc": {
                "total_matches": 1,
                "wins": 1 if winner == player1_id else 0,
                "losses": 1 if winner == player2_id else 0
            }
        }
    )

    # Update player 2
    await users_collection.update_one(
        {"telegram_id": player2_id},
        {
            "$set": {"elo_rating": new_elo2},
            "$inc": {
                "total_matches": 1,
                "wins": 1 if winner == player2_id else 0,
                "losses": 1 if winner == player1_id else 0
            }
        }
    )

    print(f"[ELO] Updated: {player1_id}: {elo1} -> {new_elo1}, {player2_id}: {elo2} -> {new_elo2}")


@router.post("/{match_id}/reconnect")
async def reconnect_to_match(
        match_id: str,
        current_user: dict = Depends(get_current_user),
        db=Depends(get_database)
):
    """Переподключение к матчу"""

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))

    matches_collection = db["matches"]
    match_data = await matches_collection.find_one({"match_id": match_id})

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    if user_id not in [match_data["player1_id"], match_data["player2_id"]]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a participant"
        )

    # Проверяем дедлайн переподключения
    if match_data.get("reconnect_deadline"):
        deadline = match_data["reconnect_deadline"]
        if isinstance(deadline, str):
            deadline = datetime.fromisoformat(deadline)

        if datetime.utcnow() > deadline:
            # Время вышло — определяем победителя
            opponent_id = match_data["player2_id"] if user_id == match_data["player1_id"] else match_data["player1_id"]

            await matches_collection.update_one(
                {"match_id": match_id},
                {
                    "$set": {
                        "status": "finished",
                        "winner": opponent_id,
                        "finish_reason": "reconnect_timeout"
                    }
                }
            )

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reconnect timeout expired. You lost the match."
            )

    # Успешное переподключение
    now = datetime.utcnow()
    update_field = "player1_last_activity" if user_id == match_data["player1_id"] else "player2_last_activity"

    await matches_collection.update_one(
        {"match_id": match_id},
        {
            "$set": {
                update_field: now,
                "reconnect_deadline": None  # Сбрасываем дедлайн
            }
        }
    )

    # Обновляем в памяти
    if match_id in active_matches:
        active_matches[match_id][update_field] = now
        active_matches[match_id]["reconnect_deadline"] = None

    return {"success": True, "message": "Reconnected successfully"}


@router.post("/{match_id}/report-disconnect")
async def report_opponent_disconnect(
        match_id: str,
        current_user: dict = Depends(get_current_user),
        db=Depends(get_database)
):
    """Сообщает о дисконнекте оппонента"""

    user_id = str(current_user.get("telegram_id") or current_user.get("_id"))

    match_data = active_matches.get(match_id)

    if not match_data:
        matches_collection = db["matches"]
        match_data = await matches_collection.find_one({"match_id": match_id})

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    if match_data.get("status") != "active":
        return {"success": False, "message": "Match not active"}

    # Устанавливаем дедлайн переподключения
    now = datetime.utcnow()
    reconnect_deadline = now + timedelta(minutes=RECONNECT_TIMEOUT_MINUTES)

    match_data["reconnect_deadline"] = reconnect_deadline

    matches_collection = db["matches"]
    await matches_collection.update_one(
        {"match_id": match_id},
        {"$set": {"reconnect_deadline": reconnect_deadline}}
    )

    active_matches[match_id] = match_data

    return {
        "success": True,
        "reconnect_deadline": reconnect_deadline.isoformat(),
        "message": f"Opponent has {RECONNECT_TIMEOUT_MINUTES} minutes to reconnect"
    }
# backend/api/rest_api.py

from fastapi import APIRouter
from pydantic import BaseModel

from api.game_state_sync import (
    start_new_game,
    make_move
)

router = APIRouter()


# ======================
# МОДЕЛИ ДАННЫХ
# ======================

class CardData(BaseModel):
    name: str
    top: int
    right: int
    bottom: int
    left: int
    element: str | None = None
    nft_id: str | None = None


class MoveRequest(BaseModel):
    player: str
    position: int
    card: CardData


# ======================
# API МАРШРУТЫ
# ======================

@router.get("/ping")
def ping():
    return {"status": "ok", "message": "API is working"}


@router.post("/game/new")
def new_game():
    """
    Начать новую игру
    """
    return start_new_game()


@router.post("/game/move")
def game_move(request: MoveRequest):
    """
    Сделать ход
    """
    return make_move(
        player=request.player,
        position=request.position,
        card_data=request.card.dict()
    )

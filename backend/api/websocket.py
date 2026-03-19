from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """Менеджер WebSocket соединений"""

    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        self.game_states: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, game_id: str, player_id: str):
        """Подключить игрока"""
        await websocket.accept()

        if game_id not in self.active_connections:
            self.active_connections[game_id] = {}

        self.active_connections[game_id][player_id] = websocket
        logger.info("WS connected: player=%s game=%s", player_id, game_id)

    def disconnect(self, game_id: str, player_id: str):
        """Отключить игрока"""
        if game_id in self.active_connections and player_id in self.active_connections[game_id]:
            del self.active_connections[game_id][player_id]
            logger.info("WS disconnected: player=%s game=%s", player_id, game_id)

            # Если в игре не осталось игроков, удаляем игру
            if not self.active_connections[game_id]:
                del self.active_connections[game_id]
                self.game_states.pop(game_id, None)

    async def send_personal_message(self, message: dict, game_id: str, player_id: str):
        """Отправить сообщение конкретному игроку"""
        ws = self.active_connections.get(game_id, {}).get(player_id)
        if not ws:
            return
        try:
            await ws.send_json(message)
        except Exception:
            self.disconnect(game_id, player_id)

    async def broadcast(self, message: dict, game_id: str):
        """Отправить сообщение всем игрокам в игре"""
        conns = self.active_connections.get(game_id)
        if not conns:
            return

        disconnected = []
        for player_id, ws in conns.items():
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(player_id)

        for pid in disconnected:
            self.disconnect(game_id, pid)

    async def handle_message(self, message: dict, game_id: str, player_id: str):
        """Обработка входящих сообщений"""
        message_type = message.get("type")

        if message_type == "game_action":
            action = message.get("action")

            if action == "place_card":
                await self.handle_place_card(
                    game_id,
                    player_id,
                    message.get("card"),
                    message.get("row"),
                    message.get("col"),
                )
            elif action == "end_turn":
                await self.handle_end_turn(game_id, player_id)
            elif action == "surrender":
                await self.handle_surrender(game_id, player_id)

        elif message_type == "chat_message":
            await self.broadcast(
                {"type": "chat", "from": player_id, "message": message.get("message")},
                game_id,
            )

    async def handle_place_card(self, game_id: str, player_id: str, card: dict, row: int, col: int):
        if game_id not in self.game_states:
            return

        game_state = self.game_states[game_id]

        if game_state.get("current_player") != player_id:
            await self.send_personal_message(
                {"type": "error", "message": "Сейчас не ваш ход"},
                game_id,
                player_id,
            )
            return

        # TODO: тут должна быть реальная логика board/mechanics

        await self.broadcast(
            {
                "type": "game_update",
                "game_state": game_state,
                "action": "card_placed",
                "player": player_id,
                "row": row,
                "col": col,
            },
            game_id,
        )

    async def handle_end_turn(self, game_id: str, player_id: str):
        if game_id not in self.game_states:
            return

        game_state = self.game_states[game_id]
        players = game_state.get("players") or []

        if not players or game_state.get("current_player") not in players:
            return

        current_idx = players.index(game_state["current_player"])
        next_idx = (current_idx + 1) % len(players)
        game_state["current_player"] = players[next_idx]

        await self.broadcast(
            {
                "type": "game_update",
                "game_state": game_state,
                "action": "turn_ended",
                "next_player": game_state["current_player"],
            },
            game_id,
        )

    async def handle_surrender(self, game_id: str, player_id: str):
        await self.broadcast(
            {
                "type": "game_end",
                "winner": "opponent",
                "reason": "surrender",
                "surrendered": player_id,
            },
            game_id,
        )


manager = ConnectionManager()


@router.websocket("/ws/{game_id}/{player_id}")
async def ws_endpoint(websocket: WebSocket, game_id: str, player_id: str):
    await manager.connect(websocket, game_id, player_id)

    # Можно отправить "hello"/state
    await manager.send_personal_message(
        {"type": "connected", "gameId": game_id, "playerId": player_id},
        game_id,
        player_id,
    )

    try:
        while True:
            data = await websocket.receive_json()
            if isinstance(data, dict):
                await manager.handle_message(data, game_id, player_id)
    except WebSocketDisconnect:
        manager.disconnect(game_id, player_id)
    except Exception:
        logger.exception("WS error: game=%s player=%s", game_id, player_id)
        manager.disconnect(game_id, player_id)
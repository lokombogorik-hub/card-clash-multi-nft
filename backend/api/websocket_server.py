from fastapi import WebSocket
from typing import Dict, List
import json
import asyncio


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

        print(f"✅ Игрок {player_id} подключен к игре {game_id}")

    def disconnect(self, game_id: str, player_id: str):
        """Отключить игрока"""
        if game_id in self.active_connections:
            if player_id in self.active_connections[game_id]:
                del self.active_connections[game_id][player_id]
                print(f"❌ Игрок {player_id} отключен от игры {game_id}")

            # Если в игре не осталось игроков, удаляем игру
            if not self.active_connections[game_id]:
                del self.active_connections[game_id]
                if game_id in self.game_states:
                    del self.game_states[game_id]

    async def send_personal_message(self, message: dict, game_id: str, player_id: str):
        """Отправить сообщение конкретному игроку"""
        if game_id in self.active_connections and player_id in self.active_connections[game_id]:
            websocket = self.active_connections[game_id][player_id]
            try:
                await websocket.send_json(message)
            except:
                self.disconnect(game_id, player_id)

    async def broadcast(self, message: dict, game_id: str):
        """Отправить сообщение всем игрокам в игре"""
        if game_id in self.active_connections:
            disconnected = []
            for player_id, websocket in self.active_connections[game_id].items():
                try:
                    await websocket.send_json(message)
                except:
                    disconnected.append(player_id)

            # Удаляем отключенных игроков
            for player_id in disconnected:
                self.disconnect(game_id, player_id)

    async def handle_message(self, message: dict, game_id: str, player_id: str):
        """Обработка входящих сообщений"""
        message_type = message.get("type")

        if message_type == "game_action":
            # Обработка игровых действий
            action = message.get("action")

            if action == "place_card":
                await self.handle_place_card(
                    game_id, player_id,
                    message.get("card"),
                    message.get("row"),
                    message.get("col")
                )
            elif action == "end_turn":
                await self.handle_end_turn(game_id, player_id)
            elif action == "surrender":
                await self.handle_surrender(game_id, player_id)

        elif message_type == "chat_message":
            # Пересылка сообщения чата
            await self.broadcast({
                "type": "chat",
                "from": player_id,
                "message": message.get("message")
            }, game_id)

    async def handle_place_card(self, game_id: str, player_id: str, card: dict, row: int, col: int):
        """Обработка размещения карты"""
        if game_id not in self.game_states:
            return

        game_state = self.game_states[game_id]

        # Проверка, что ход игрока
        if game_state["current_player"] != player_id:
            await self.send_personal_message({
                "type": "error",
                "message": "Сейчас не ваш ход"
            }, game_id, player_id)
            return

        # Обновление состояния игры
        # (здесь должна быть логика из game/mechanics/board.py)

        # Отправка обновленного состояния всем игрокам
        await self.broadcast({
            "type": "game_update",
            "game_state": game_state,
            "action": "card_placed",
            "player": player_id,
            "row": row,
            "col": col
        }, game_id)

    async def handle_end_turn(self, game_id: str, player_id: str):
        """Обработка завершения хода"""
        if game_id not in self.game_states:
            return

        game_state = self.game_states[game_id]

        # Смена хода
        players = game_state["players"]
        current_idx = players.index(game_state["current_player"])
        next_idx = (current_idx + 1) % len(players)
        game_state["current_player"] = players[next_idx]

        await self.broadcast({
            "type": "game_update",
            "game_state": game_state,
            "action": "turn_ended",
            "next_player": game_state["current_player"]
        }, game_id)

    async def handle_surrender(self, game_id: str, player_id: str):
        """Обработка сдачи"""
        await self.broadcast({
            "type": "game_end",
            "winner": "opponent",
            "reason": "surrender",
            "surrendered": player_id
        }, game_id)


# Глобальный экземпляр менеджера
websocket_manager = ConnectionManager()
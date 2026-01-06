import asyncio
import random
from typing import Dict, List, Optional
import uuid
from datetime import datetime

from database.database_manager import get_db
from database.models.user import User


class MatchmakingQueue:
    """Очередь матчмейкинга для PvP"""

    def __init__(self):
        self.queue: List[Dict] = []  # Очередь игроков
        self.active_games: Dict[str, Dict] = {}  # Активные игры
        self.elo_range = 100  # Диапазон ELO для матча

    async def add_player(self, wallet_address: str, deck_id: Optional[int] = None) -> bool:
        """Добавить игрока в очередь"""
        # Проверяем, не в очереди ли уже игрок
        for player in self.queue:
            if player["wallet_address"] == wallet_address:
                return False

        # Получаем ELO рейтинг из базы
        db = next(get_db())
        user = db.query(User).filter(User.wallet_address == wallet_address).first()
        elo = user.elo_rating if user else 1000

        player_data = {
            "wallet_address": wallet_address,
            "elo": elo,
            "deck_id": deck_id,
            "joined_at": datetime.now(),
            "searching_time": 0
        }

        self.queue.append(player_data)
        print(f"🎮 Игрок {wallet_address} добавлен в очередь (ELO: {elo})")

        # Проверяем возможность создания матча
        await self._try_create_match()

        return True

    def remove_player(self, wallet_address: str):
        """Удалить игрока из очереди"""
        self.queue = [p for p in self.queue if p["wallet_address"] != wallet_address]

    async def process_queue(self):
        """Обработка очереди (запускается в фоне)"""
        while True:
            await asyncio.sleep(1)

            # Увеличиваем время поиска для всех игроков
            for player in self.queue:
                player["searching_time"] += 1

            # Пытаемся создать матч
            await self._try_create_match()

    async def _try_create_match(self):
        """Попытка создать матч из игроков в очереди"""
        if len(self.queue) < 2:
            return

        # Сортируем по ELO
        sorted_queue = sorted(self.queue, key=lambda x: x["elo"])

        for i in range(len(sorted_queue) - 1):
            player1 = sorted_queue[i]
            player2 = sorted_queue[i + 1]

            # Проверяем разницу в ELO
            elo_diff = abs(player1["elo"] - player2["elo"])

            # Или если игроки ищут долго, увеличиваем диапазон
            max_wait = max(player1["searching_time"], player2["searching_time"])
            expanded_range = self.elo_range + (max_wait // 10) * 50

            if elo_diff <= expanded_range:
                # Создаем игру
                game_id = str(uuid.uuid4())

                # Определяем, кто ходит первым (случайно)
                first_player = random.choice([player1, player2])
                second_player = player2 if first_player == player1 else player1

                game_data = {
                    "game_id": game_id,
                    "players": [
                        {
                            "wallet_address": first_player["wallet_address"],
                            "elo": first_player["elo"],
                            "deck_id": first_player["deck_id"],
                            "is_first": True
                        },
                        {
                            "wallet_address": second_player["wallet_address"],
                            "elo": second_player["elo"],
                            "deck_id": second_player["deck_id"],
                            "is_first": False
                        }
                    ],
                    "created_at": datetime.now(),
                    "status": "starting",
                    "board": None,  # Игровое поле будет создано при старте
                    "current_player": first_player["wallet_address"],
                    "turn": 0
                }

                self.active_games[game_id] = game_data

                # Удаляем игроков из очереди
                self.remove_player(player1["wallet_address"])
                self.remove_player(player2["wallet_address"])

                # Уведомляем игроков (через WebSocket)
                # Здесь должен быть вызов WebSocket менеджера
                print(f"🎲 Создана игра {game_id}: {player1['wallet_address']} vs {player2['wallet_address']}")

                # Запускаем игру
                asyncio.create_task(self._start_game(game_id))
                break

    async def _start_game(self, game_id: str):
        """Запуск игры"""
        game = self.active_games.get(game_id)
        if not game:
            return

        # Инициализация игрового поля
        from game.mechanics.board import Board
        board = Board()
        board.players = [
            game["players"][0]["wallet_address"],
            game["players"][1]["wallet_address"]
        ]

        game["board"] = board.to_dict()
        game["status"] = "active"

        print(f"🚀 Игра {game_id} началась!")

        # Здесь можно отправить начальное состояние через WebSocket

    def get_game_status(self, game_id: str) -> Optional[Dict]:
        """Получить статус игры"""
        return self.active_games.get(game_id)

    def end_game(self, game_id: str, winner_address: Optional[str] = None):
        """Завершить игру"""
        game = self.active_games.get(game_id)
        if not game:
            return

        # Обновление ELO рейтингов
        if winner_address:
            self._update_elo(game, winner_address)

        # Удаляем игру
        if game_id in self.active_games:
            del self.active_games[game_id]

        print(f"🏁 Игра {game_id} завершена. Победитель: {winner_address}")

    def _update_elo(self, game: Dict, winner_address: str):
        """Обновление ELO рейтингов после игры"""
        db = next(get_db())

        player1 = game["players"][0]["wallet_address"]
        player2 = game["players"][1]["wallet_address"]

        user1 = db.query(User).filter(User.wallet_address == player1).first()
        user2 = db.query(User).filter(User.wallet_address == player2).first()

        if not user1 or not user2:
            return

        # Расчет изменения ELO
        K = 32  # Коэффициент K

        # Ожидаемый результат
        expected1 = 1 / (1 + 10 ** ((user2.elo_rating - user1.elo_rating) / 400))
        expected2 = 1 / (1 + 10 ** ((user1.elo_rating - user2.elo_rating) / 400))

        # Фактический результат
        if winner_address == player1:
            actual1, actual2 = 1, 0
        elif winner_address == player2:
            actual1, actual2 = 0, 1
        else:  # Ничья
            actual1, actual2 = 0.5, 0.5

        # Обновление ELO
        user1.elo_rating += K * (actual1 - expected1)
        user2.elo_rating += K * (actual2 - expected2)

        # Обновление статистики
        user1.total_games += 1
        user2.total_games += 1

        if winner_address == player1:
            user1.wins += 1
            user2.losses += 1
        elif winner_address == player2:
            user2.wins += 1
            user1.losses += 1
        else:
            user1.draws += 1
            user2.draws += 1

        db.commit()
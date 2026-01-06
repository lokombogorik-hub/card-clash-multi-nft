# backend/game/mechanics/board.py

class Board:
    def __init__(self):
        """
        Создаём поле 3x3.
        Каждая клетка изначально пустая (None).
        """
        self.size = 3

        # Поле — это список из 9 клеток
        # Индексы:
        # 0 1 2
        # 3 4 5
        # 6 7 8
        self.cells = [None] * 9

    def place_card(self, position, card, owner):
        """
        Положить карту в клетку.

        position — номер клетки (0-8)
        card — объект карты (пока любой)
        owner — игрок ("player1" или "player2")
        """

        # Проверяем, что позиция правильная
        if position < 0 or position > 8:
            raise ValueError("Неверная позиция")

        # Проверяем, что клетка пустая
        if self.cells[position] is not None:
            raise ValueError("Клетка уже занята")

        # Кладём карту
        self.cells[position] = {
            "card": card,
            "owner": owner
        }

    def get_cell(self, position):
        """
        Получить содержимое клетки
        """
        return self.cells[position]

    def is_full(self):
        """
        Проверка: поле полностью заполнено?
        """
        return all(cell is not None for cell in self.cells)

    def get_state(self):
        """
        Получить состояние всего поля
        (удобно отдавать на frontend)
        """
        return self.cells

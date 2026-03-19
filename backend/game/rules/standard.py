# backend/game/rules/standard.py

class StandardRule:
    def apply(self, board, position):
        """
        Применить правило захвата после хода.

        board    — игровое поле (Board)
        position — куда положили карту (0-8)
        """

        cell = board.get_cell(position)

        if cell is None:
            return

        card = cell["card"]
        owner = cell["owner"]

        # Проверяем соседей
        self.check_top(board, position, card, owner)
        self.check_right(board, position, card, owner)
        self.check_bottom(board, position, card, owner)
        self.check_left(board, position, card, owner)

    def check_top(self, board, position, card, owner):
        # Если карта не в верхнем ряду — есть сосед сверху
        if position >= 3:
            neighbor_pos = position - 3
            self.compare(
                board,
                neighbor_pos,
                card.top,
                "bottom",
                owner
            )

    def check_right(self, board, position, card, owner):
        # Если карта не в правом столбце
        if position % 3 != 2:
            neighbor_pos = position + 1
            self.compare(
                board,
                neighbor_pos,
                card.right,
                "left",
                owner
            )

    def check_bottom(self, board, position, card, owner):
        # Если карта не в нижнем ряду
        if position <= 5:
            neighbor_pos = position + 3
            self.compare(
                board,
                neighbor_pos,
                card.bottom,
                "top",
                owner
            )

    def check_left(self, board, position, card, owner):
        # Если карта не в левом столбце
        if position % 3 != 0:
            neighbor_pos = position - 1
            self.compare(
                board,
                neighbor_pos,
                card.left,
                "right",
                owner
            )

    def compare(self, board, neighbor_pos, attack_value, defense_side, owner):
        """
        Сравниваем стороны двух карт
        """

        neighbor = board.get_cell(neighbor_pos)

        # Если там пусто — ничего не делаем
        if neighbor is None:
            return

        # Если карта того же игрока — не трогаем
        if neighbor["owner"] == owner:
            return

        defense_card = neighbor["card"]
        defense_value = getattr(defense_card, defense_side)

        # Главное сравнение
        if attack_value > defense_value:
            # Захватываем карту
            neighbor["owner"] = owner

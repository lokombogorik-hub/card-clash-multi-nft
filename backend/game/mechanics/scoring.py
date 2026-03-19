# backend/game/mechanics/scoring.py

class Scoring:
    def count(self, board):
        """
        Подсчёт очков на поле.

        board — объект Board
        """

        scores = {
            "player1": 0,
            "player2": 0
        }

        # Проходим по всем клеткам поля
        for cell in board.get_state():
            if cell is None:
                continue

            owner = cell["owner"]
            scores[owner] += 1

        return scores

    def get_winner(self, board):
        """
        Определить победителя
        """

        scores = self.count(board)

        if scores["player1"] > scores["player2"]:
            return "player1"
        elif scores["player2"] > scores["player1"]:
            return "player2"
        else:
            return "draw"

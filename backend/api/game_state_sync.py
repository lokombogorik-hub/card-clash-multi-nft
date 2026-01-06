# backend/api/game_state_sync.py

from game.mechanics.board import Board
from game.mechanics.card import Card
from game.rules.standard import StandardRule
from game.mechanics.scoring import Scoring

# Одна игра (пока одна на весь сервер)
board = Board()
rule = StandardRule()
scoring = Scoring()


def start_new_game():
    """
    Начать новую игру
    """
    global board
    board = Board()
    return {"status": "new_game_started"}


def make_move(player, position, card_data):
    """
    Сделать ход игрока

    player — "player1" или "player2"
    position — клетка 0-8
    card_data — данные карты
    """

    # Создаём карту из данных
    card = Card(
        name=card_data["name"],
        top=card_data["top"],
        right=card_data["right"],
        bottom=card_data["bottom"],
        left=card_data["left"],
        element=card_data.get("element"),
        nft_id=card_data.get("nft_id")
    )

    # Кладём карту
    board.place_card(position, card, player)

    # Применяем правило захвата
    rule.apply(board, position)

    # Считаем очки
    scores = scoring.count(board)

    # Проверяем победителя
    winner = None
    if board.is_full():
        winner = scoring.get_winner(board)

    return {
        "board": serialize_board(),
        "scores": scores,
        "winner": winner
    }


def serialize_board():
    """
    Превратить поле в простой формат
    """

    result = []

    for cell in board.get_state():
        if cell is None:
            result.append(None)
        else:
            result.append({
                "owner": cell["owner"],
                "card": cell["card"].to_dict()
            })

    return result

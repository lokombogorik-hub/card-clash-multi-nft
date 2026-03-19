# backend/game/mechanics/card.py

class Card:
    def __init__(
        self,
        name,
        top,
        right,
        bottom,
        left,
        element=None,
        nft_id=None
    ):
        """
        Создаём карту.

        name     — имя карты
        top      — сила сверху
        right    — сила справа
        bottom   — сила снизу
        left     — сила слева
        element  — элемент (огонь, вода и т.д.)
        nft_id   — ID NFT в блокчейне
        """

        self.name = name

        # Значения сторон
        self.top = top
        self.right = right
        self.bottom = bottom
        self.left = left

        # Дополнительные данные
        self.element = element
        self.nft_id = nft_id

    def get_sides(self):
        """
        Вернуть все стороны карты в виде словаря
        """
        return {
            "top": self.top,
            "right": self.right,
            "bottom": self.bottom,
            "left": self.left
        }

    def to_dict(self):
        """
        Превратить карту в словарь
        (удобно для API и frontend)
        """
        return {
            "name": self.name,
            "top": self.top,
            "right": self.right,
            "bottom": self.bottom,
            "left": self.left,
            "element": self.element,
            "nft_id": self.nft_id
        }

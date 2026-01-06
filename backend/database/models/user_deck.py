from sqlalchemy import Column, Integer, String, JSON, ForeignKey
from sqlalchemy.orm import relationship
from .user import Base


class UserDeck(Base):
    """Модель колоды пользователя"""
    __tablename__ = "user_decks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False, default="Моя колода")

    # Карты в колоде (максимум 10)
    card_ids = Column(JSON, default=[])  # Список ID карт

    # Статистика колоды
    games_played = Column(Integer, default=0)
    wins = Column(Integer, default=0)

    # Метаданные
    created_at = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_public = Column(Boolean, default=False)

    user = relationship("User", back_populates="decks")

    def validate_deck(self) -> bool:
        """Валидация колоды"""
        # Проверка количества карт
        if len(self.card_ids) > 10:
            return False

        # Проверка на дубликаты
        if len(self.card_ids) != len(set(self.card_ids)):
            return False

        return True

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "user_id": self.user_id,
            "card_count": len(self.card_ids),
            "card_ids": self.card_ids,
            "games_played": self.games_played,
            "wins": self.wins,
            "win_rate": (self.wins / self.games_played * 100) if self.games_played > 0 else 0,
            "is_active": self.is_active,
            "is_public": self.is_public,
            "created_at": self.created_at
        }
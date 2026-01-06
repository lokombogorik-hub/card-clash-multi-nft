from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, Boolean
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class User(Base):
    """Модель пользователя"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, nullable=True)
    email = Column(String, nullable=True)

    # Игровая статистика
    elo_rating = Column(Integer, default=1000)
    total_games = Column(Integer, default=0)
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)
    draws = Column(Integer, default=0)

    # Колоды
    decks = Column(JSON, default=[])  # Список колод

    # Настройки
    preferred_network = Column(String, default="near")
    notifications_enabled = Column(Boolean, default=True)

    # Метаданные
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "wallet_address": self.wallet_address,
            "username": self.username,
            "elo_rating": self.elo_rating,
            "total_games": self.total_games,
            "wins": self.wins,
            "losses": self.losses,
            "draws": self.draws,
            "win_rate": (self.wins / self.total_games * 100) if self.total_games > 0 else 0,
            "decks": self.decks,
            "preferred_network": self.preferred_network,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
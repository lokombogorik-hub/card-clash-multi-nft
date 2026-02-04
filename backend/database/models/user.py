from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, String, DateTime, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class User(Base):
    __tablename__ = "users"

    # tg_id как primary key
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)

    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    near_account_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # PvP Statistics
    elo_rating: Mapped[int] = mapped_column(Integer, default=1200, nullable=False)
    pvp_wins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pvp_losses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pvp_forfeits: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    experience: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_matches: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    win_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Economy
    total_spent_near: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_earned_near: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
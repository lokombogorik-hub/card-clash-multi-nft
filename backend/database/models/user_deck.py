from sqlalchemy import Column, String, Integer, DateTime, JSON, BigInteger
from sqlalchemy.sql import func
from database.base import Base


class UserDeck(Base):
    __tablename__ = "user_decks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, unique=True, index=True)
    cards = Column(JSON, default=list)        # card IDs
    full_cards = Column(JSON, default=list)   # full card objects
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
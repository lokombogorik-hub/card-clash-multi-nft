from sqlalchemy import Column, Integer, String, BigInteger, DateTime, Text, JSON
from sqlalchemy.sql import func
from database.models import Base


class UserDeck(Base):
    __tablename__ = "user_decks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False, index=True)

    # Store full NFT data as JSON array
    cards_json = Column(Text, nullable=False, default="[]")

    # Card keys for quick lookup
    card_keys = Column(Text, nullable=False, default="[]")

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
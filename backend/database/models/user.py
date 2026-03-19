from sqlalchemy import Column, Integer, String, BigInteger, DateTime
from sqlalchemy.sql import func
from database.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True)
    username = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    near_account_id = Column(String, nullable=True)

    # Stats
    total_matches = Column(Integer, default=0, nullable=False, server_default="0")
    wins = Column(Integer, default=0, nullable=False, server_default="0")
    losses = Column(Integer, default=0, nullable=False, server_default="0")

    # Rating system
    elo_rating = Column(Integer, default=1000, nullable=False, server_default="1000")
    rank = Column(String, default="Новичок", nullable=False, server_default="'Новичок'")

    # PvP specific
    pvp_wins = Column(Integer, default=0, nullable=False, server_default="0")
    pvp_losses = Column(Integer, default=0, nullable=False, server_default="0")

    nfts_count = Column(Integer, default=0, nullable=False, server_default="0")

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
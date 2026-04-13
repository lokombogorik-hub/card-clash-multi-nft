from sqlalchemy import Column, String, Integer, Boolean, DateTime
from sqlalchemy.sql import func
from database.base import Base


class MatchDeposit(Base):
    __tablename__ = "match_deposits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    match_id = Column(String, nullable=False, index=True)
    player_id = Column(String, nullable=False, index=True)
    token_id = Column(String, nullable=False)
    nft_contract_id = Column(String, nullable=True)
    near_wallet = Column(String, nullable=True)
    image = Column(String, nullable=True)
    refunded = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
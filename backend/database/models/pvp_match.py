from sqlalchemy import Column, Integer, String, BigInteger, DateTime, Text, Enum
from sqlalchemy.sql import func
from database.models import Base
import enum


class MatchStatus(str, enum.Enum):
    WAITING = "waiting"
    IN_PROGRESS = "in_progress"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class PvPMatch(Base):
    __tablename__ = "pvp_matches"

    id = Column(String(64), primary_key=True)  # UUID

    player1_id = Column(BigInteger, nullable=False, index=True)
    player2_id = Column(BigInteger, nullable=True, index=True)

    player1_deck_json = Column(Text, nullable=True)  # Full NFT data
    player2_deck_json = Column(Text, nullable=True)

    player1_elo = Column(Integer, default=1000)
    player2_elo = Column(Integer, default=1000)

    status = Column(String(20), default="waiting", index=True)

    winner_id = Column(BigInteger, nullable=True)
    loser_id = Column(BigInteger, nullable=True)

    # Score tracking
    player1_rounds = Column(Integer, default=0)
    player2_rounds = Column(Integer, default=0)

    # ELO changes after match
    elo_change = Column(Integer, default=0)

    # NFT claim info
    claimed_nft_contract = Column(String, nullable=True)
    claimed_nft_token_id = Column(String, nullable=True)
    claim_tx_hash = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    finished_at = Column(DateTime, nullable=True)
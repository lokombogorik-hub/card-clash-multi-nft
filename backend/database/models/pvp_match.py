from sqlalchemy import Column, String, Integer, Boolean, DateTime, JSON, Text
from sqlalchemy.sql import func
from database.base import Base


class PvPMatch(Base):
    __tablename__ = "pvp_matches"

    id = Column(String, primary_key=True)
    player1_id = Column(String, nullable=False, index=True)
    player2_id = Column(String, nullable=True, index=True)
    status = Column(String, default="waiting", nullable=False)  # waiting/waiting_escrow/active/finished/cancelled
    winner = Column(String, nullable=True)
    mode = Column(String, default="pvp", nullable=False)

    # Decks
    player1_deck = Column(JSON, default=list)
    player2_deck = Column(JSON, default=list)

    # Game state
    board = Column(JSON, default=list)
    board_elements = Column(JSON, default=list)
    current_turn = Column(String, nullable=True)
    player1_hand = Column(JSON, default=list)
    player2_hand = Column(JSON, default=list)
    moves_count = Column(Integer, default=0)

    # Escrow
    player1_escrow_confirmed = Column(Boolean, default=False)
    player2_escrow_confirmed = Column(Boolean, default=False)
    player1_near_wallet = Column(String, nullable=True)
    player2_near_wallet = Column(String, nullable=True)
    player1_escrow_tx = Column(String, nullable=True)
    player2_escrow_tx = Column(String, nullable=True)
    escrow_locked = Column(Boolean, default=False)
    escrow_timeout_at = Column(DateTime, nullable=True)

    # Claim
    claimed = Column(Boolean, default=False)
    claimed_token_id = Column(String, nullable=True)
    claimed_at = Column(DateTime, nullable=True)
    refunded = Column(Boolean, default=False)
    refunded_at = Column(DateTime, nullable=True)

    # Ready flags
    player1_ready = Column(Boolean, default=False)
    player2_ready = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancelled_reason = Column(String, nullable=True)
    game_started_at = Column(DateTime, nullable=True)
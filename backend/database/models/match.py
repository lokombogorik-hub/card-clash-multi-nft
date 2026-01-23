from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    String,
    DateTime,
    ForeignKey,
    Integer,
    Boolean,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from .base import Base


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status: Mapped[str] = mapped_column(String(32), default="waiting")  # waiting|active|finished

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    winner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    players = relationship("MatchPlayer", back_populates="match", cascade="all, delete-orphan")
    deposits = relationship("MatchDeposit", back_populates="match", cascade="all, delete-orphan")
    claim = relationship("MatchClaim", back_populates="match", cascade="all, delete-orphan", uselist=False)


class MatchPlayer(Base):
    __tablename__ = "match_players"
    __table_args__ = (
        UniqueConstraint("match_id", "user_id", name="uq_match_player"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    side: Mapped[str] = mapped_column(String(16), default="")  # "A"|"B"
    near_account_id_snapshot: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # хранение deck на этапе 1/2: можно keys, можно полные NFT; сейчас JSONB
    deck: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    match = relationship("Match", back_populates="players")


class MatchDeposit(Base):
    __tablename__ = "match_deposits"
    __table_args__ = (
        UniqueConstraint("match_id", "nft_contract_id", "token_id", name="uq_match_deposit_token"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    nft_contract_id: Mapped[str] = mapped_column(String(128))
    token_id: Mapped[str] = mapped_column(String(256))

    tx_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    verified_onchain: Mapped[bool] = mapped_column(Boolean, default=False)

    deposited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    match = relationship("Match", back_populates="deposits")


class MatchClaim(Base):
    __tablename__ = "match_claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    match_id: Mapped[str] = mapped_column(ForeignKey("matches.id"), unique=True, index=True)

    winner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    loser_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    nft_contract_id: Mapped[str] = mapped_column(String(128))
    token_id: Mapped[str] = mapped_column(String(256))

    tx_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    match = relationship("Match", back_populates="claim")
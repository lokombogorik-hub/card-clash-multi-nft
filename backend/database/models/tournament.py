from sqlalchemy import Column, String, Integer, DateTime, JSON, Boolean, Index
from sqlalchemy.sql import func
from database.base import Base


class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(String, primary_key=True)  # uuid
    name = Column(String, nullable=False)
    # registration / running / finished / cancelled
    status = Column(String, default="registration", nullable=False)

    # Вход: фиксированный взнос в NEAR (храним в yocto строкой, чтобы не упереться в bigint)
    entry_fee_yocto = Column(String, default="0", nullable=False)
    treasury = Column(String, nullable=False)  # кошелёк сбора взносов и выплаты призов

    # Распределение призового фонда в процентах, напр. [50,30,20].
    prize_distribution = Column(JSON, default=list)

    # Регистрация по времени. Неограниченное число участников, если max_participants=None.
    registration_ends_at = Column(DateTime, nullable=True)
    max_participants = Column(Integer, nullable=True)

    # Накопленный призовой фонд (сумма взносов) в yocto.
    prize_pool_yocto = Column(String, default="0", nullable=False)

    # Итоговые места: [{user_id, place, prize_yocto, near_account, payout_tx, paid}]
    winners = Column(JSON, default=list)
    settled = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, server_default=func.now())
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)


class TournamentParticipant(Base):
    __tablename__ = "tournament_participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tournament_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    near_account = Column(String, nullable=True)
    entry_tx = Column(String, nullable=True)  # tx оплаты взноса

    seed = Column(Integer, nullable=True)
    eliminated_round = Column(Integer, nullable=True)  # None = ещё в игре
    placement = Column(Integer, nullable=True)         # итоговое место (1 = чемпион)

    registered_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_tparticipant_unique", "tournament_id", "user_id", unique=True),
    )


class TournamentMatch(Base):
    __tablename__ = "tournament_matches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tournament_id = Column(String, nullable=False, index=True)
    round = Column(Integer, nullable=False)   # 1 = первый раунд
    slot = Column(Integer, nullable=False)    # позиция матча внутри раунда (0..)

    player1_id = Column(String, nullable=True)
    player2_id = Column(String, nullable=True)

    match_id = Column(String, nullable=True)  # id PvPMatch, когда игра создана
    winner_id = Column(String, nullable=True)

    # pending (ждём соперников из прошлого раунда) / ready (оба известны) /
    # active (игра идёт) / finished / bye (авто-проход)
    status = Column(String, default="pending", nullable=False)

    created_at = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_tmatch_round", "tournament_id", "round", "slot"),
    )

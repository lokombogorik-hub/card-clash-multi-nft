"""
Турниры Card Clash — отдельный модуль, НЕ трогает рабочее ядро PvP.

Идея:
- Вход платный (взнос в NEAR) -> копится призовой фонд.
- Регистрация по времени, число участников не ограничено (или лимит max_participants).
- При старте строится single-elimination сетка с "баями" под любое N
  (округляем вверх до степени двойки).
- Турнирный матч переиспользует готовый WS-движок: создаётся PvPMatch с
  mode="tournament", escrow_locked=True и БЕЗ депозитов NFT (вход уже оплачен).
  Победитель пишется сервером авторитетно -> сетка двигается по факту, а не по
  словам клиента. Отсутствие депозитов => auto_settle_forfeit ничего не переводит.
- Призы: фонд делится по prize_distribution (напр. [50,30,20]). Для топ-3
  доигрывается матч за 3-е место. Распределение — настройка, легко сменить на
  "по раундам"/топ-8 без правок кода.

ENV:
  TOURNAMENT_ADMIN_IDS   — id пользователей (через запятую), кому можно
                           создавать/стартовать/рассчитывать турниры. Пусто =
                           разрешено всем (только для теста! на проде задайте).
  TOURNAMENT_TREASURY    — кошелёк-казна (сбор взносов и выплата призов).
  TOURNAMENT_TREASURY_KEY— приватный ключ казны (ed25519:...). Если не задан —
                           призы только фиксируются (ручная выплата).
  TOURNAMENT_PAYMENT_VERIFY — "1" (по умолч.) проверять оплату взноса on-chain.
  NEAR_RPC_URL           — общий RPC (как в остальном проекте).
"""
from __future__ import annotations

import os
import math
import uuid
import random
import traceback
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header, Body
from pydantic import BaseModel
from sqlalchemy import select, delete

from database.session import get_session
from database.models.tournament import (
    Tournament,
    TournamentParticipant,
    TournamentMatch,
)

router = APIRouter(prefix="/api/tournaments", tags=["tournaments"])

YOCTO = 10 ** 24

TOURNAMENT_ADMIN_IDS = {
    x.strip() for x in os.getenv("TOURNAMENT_ADMIN_IDS", "").split(",") if x.strip()
}
TOURNAMENT_TREASURY = os.getenv("TOURNAMENT_TREASURY", "").strip()
TOURNAMENT_TREASURY_KEY = os.getenv("TOURNAMENT_TREASURY_KEY", "").strip()
TOURNAMENT_PAYMENT_VERIFY = os.getenv("TOURNAMENT_PAYMENT_VERIFY", "1") == "1"
NEAR_RPC_URL = os.getenv("NEAR_RPC_URL", "https://free.rpc.fastnear.com").strip()


# ─────────────────────────── ВСПОМОГАТЕЛЬНОЕ ────────────────────────────

def _uid_from_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    try:
        from utils.security import decode_access_token
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        payload = decode_access_token(token)
        if payload:
            uid = payload.get("sub") or payload.get("user_id") or payload.get("telegram_id")
            if uid:
                return str(uid)
    except Exception as e:
        print(f"[Tournaments] token decode error: {e}")
    return None


def _require_uid(authorization: Optional[str]) -> str:
    uid = _uid_from_token(authorization)
    if not uid:
        raise HTTPException(status_code=401, detail="Auth required")
    return uid


def _is_admin(uid: str) -> bool:
    # Пустой список = разрешено всем (тестовый режим). На проде задайте TOURNAMENT_ADMIN_IDS.
    if not TOURNAMENT_ADMIN_IDS:
        return True
    return str(uid) in TOURNAMENT_ADMIN_IDS


async def _require_admin(authorization: Optional[str]) -> str:
    """Админ = id из токена ИЛИ привязанный NEAR-аккаунт в TOURNAMENT_ADMIN_IDS.
    Пустой список = разрешено всем (тестовый режим)."""
    uid = _require_uid(authorization)
    if not TOURNAMENT_ADMIN_IDS:
        return uid
    if str(uid) in TOURNAMENT_ADMIN_IDS:
        return uid
    try:
        from database.models.user import User
        async for session in get_session():
            u = await session.get(User, int(uid))
            if u and u.near_account_id and str(u.near_account_id) in TOURNAMENT_ADMIN_IDS:
                return uid
            break
    except Exception as e:
        print(f"[Tournaments] admin check error: {e}")
    raise HTTPException(
        status_code=403,
        detail="Only admins. Set TOURNAMENT_ADMIN_IDS to your Telegram user id or your NEAR account.",
    )


async def _check_is_admin(authorization: Optional[str]) -> bool:
    """Не бросает исключение — просто True/False, для фронта (показывать ли
    кнопку «Создать турнир»)."""
    try:
        await _require_admin(authorization)
        return True
    except HTTPException:
        return False
    except Exception:
        return False


def _loser_of(m: TournamentMatch) -> Optional[str]:
    if not m.winner_id:
        return None
    if str(m.winner_id) == str(m.player1_id):
        return m.player2_id
    if str(m.winner_id) == str(m.player2_id):
        return m.player1_id
    return None


def _total_rounds(round1_match_count: int) -> int:
    """Сколько всего раундов, если в 1-м раунде было round1_match_count матчей."""
    size = max(1, round1_match_count) * 2
    return max(1, int(round(math.log2(size))))


def _wants_third_place(t: Tournament) -> bool:
    dist = t.prize_distribution or []
    return len(dist) >= 3


async def _load_user_deck(user_id: str) -> List[Dict]:
    try:
        from routers.matchmaking import load_user_deck
        return await load_user_deck(str(user_id))
    except Exception as e:
        print(f"[Tournaments] load_user_deck error: {e}")
        return []


async def _create_game_for_match(tm: TournamentMatch, t: Tournament) -> Optional[str]:
    """Создаёт PvPMatch (mode=tournament, без эскроу-стейка) для турнирного матча.
    Игроки потом просто подключаются к /ws/match/{match_id}."""
    p1 = str(tm.player1_id) if tm.player1_id else None
    p2 = str(tm.player2_id) if tm.player2_id else None
    if not p1 or not p2:
        return None
    try:
        from routers.matchmaking import active_matches, _save_match_to_db
        mid = f"t{t.id[:6]}_{tm.id}_{uuid.uuid4().hex[:6]}"
        d1 = await _load_user_deck(p1)
        d2 = await _load_user_deck(p2)
        match_data = {
            "match_id": mid,
            "player1_id": p1,
            "player2_id": p2,
            "status": "active",
            "player1_deck": d1,
            "player2_deck": d2,
            "board": [None] * 9,
            "board_elements": [],
            "current_turn": None,
            "player1_hand": [],
            "player2_hand": [],
            "player1_escrow_confirmed": True,
            "player2_escrow_confirmed": True,
            "escrow_locked": True,  # вход оплачен в NEAR -> NFT не стейкаем
            "mode": "tournament",
        }
        active_matches[mid] = match_data
        await _save_match_to_db(match_data)
        return mid
    except Exception as e:
        print(f"[Tournaments] create game error: {e}")
        traceback.print_exc()
        return None


async def _read_match_winner(match_id: str) -> Optional[str]:
    """Авторитетно читаем победителя завершённого PvPMatch (его ставит сервер)."""
    if not match_id:
        return None
    try:
        from routers.matchmaking import get_match
        m = await get_match(match_id)
        if m and m.get("status") == "finished" and m.get("winner"):
            return str(m.get("winner"))
    except Exception as e:
        print(f"[Tournaments] read winner error: {e}")
    return None


# ─────────────────────────── ДВИЖОК СЕТКИ ───────────────────────────────

async def _start_tournament(t: Tournament, session) -> None:
    parts = (await session.execute(
        select(TournamentParticipant).where(TournamentParticipant.tournament_id == t.id)
    )).scalars().all()

    n = len(parts)
    if n < 2:
        # некого сводить — отменяем (взносы остаются на казне для ручного возврата)
        t.status = "cancelled"
        await session.commit()
        return

    random.shuffle(parts)
    for i, p in enumerate(parts):
        p.seed = i

    size = 1
    while size < n:
        size *= 2

    slots = [parts[i].user_id if i < n else None for i in range(size)]

    round1: List[TournamentMatch] = []
    for s in range(size // 2):
        a = slots[2 * s]
        b = slots[2 * s + 1]
        tm = TournamentMatch(
            tournament_id=t.id, round=1, slot=s,
            player1_id=a, player2_id=b,
        )
        if a and b:
            tm.status = "ready"
        elif a or b:
            tm.status = "bye"
            tm.winner_id = a or b
            tm.finished_at = datetime.utcnow()
        else:
            tm.status = "bye"  # пустой (не должно происходить при size>=n)
        session.add(tm)
        round1.append(tm)

    t.status = "running"
    t.started_at = datetime.utcnow()
    await session.commit()

    for tm in round1:
        if tm.status == "ready":
            mid = await _create_game_for_match(tm, t)
            if mid:
                tm.match_id = mid
                tm.status = "active"
    await session.commit()

    # если были баи — возможно раунд уже "завершён" и можно строить следующий
    await _advance_if_round_complete(t, 1, session)


async def _advance_if_round_complete(t: Tournament, rnd: int, session) -> None:
    matches = (await session.execute(
        select(TournamentMatch)
        .where(TournamentMatch.tournament_id == t.id, TournamentMatch.round == rnd)
        .order_by(TournamentMatch.slot)
    )).scalars().all()
    if not matches:
        return

    if any(m.status not in ("finished", "bye") for m in matches):
        return

    # сколько всего раундов (по числу матчей 1-го раунда)
    r1 = (await session.execute(
        select(TournamentMatch)
        .where(TournamentMatch.tournament_id == t.id, TournamentMatch.round == 1)
    )).scalars().all()
    total = _total_rounds(len(r1))

    if rnd >= total:
        await _finish_tournament(t, matches, session)
        return

    # матч за 3-е место существует только в финальном раунде (rnd == total),
    # а он уходит в ветку выше — значит здесь все матчи раунда основные.
    main_sorted = sorted(matches, key=lambda m: m.slot)
    winners = [m.winner_id for m in main_sorted]

    next_round = rnd + 1
    next_matches: List[TournamentMatch] = []
    for s in range(len(winners) // 2):
        a = winners[2 * s]
        b = winners[2 * s + 1]
        tm = TournamentMatch(
            tournament_id=t.id, round=next_round, slot=s,
            player1_id=a, player2_id=b,
        )
        if a and b:
            tm.status = "ready"
        elif a or b:
            tm.status = "bye"
            tm.winner_id = a or b
            tm.finished_at = datetime.utcnow()
        else:
            tm.status = "bye"
        session.add(tm)
        next_matches.append(tm)

    # если следующий раунд — финал и нужен топ-3: матч за 3-е место между
    # проигравшими полуфинала
    if next_round == total and _wants_third_place(t):
        semis = main_sorted
        losers = [_loser_of(m) for m in semis if m.status == "finished"]
        losers = [x for x in losers if x]
        if len(losers) == 2:
            # оба полуфиналиста реальны -> доигрываем матч за 3-е место
            tm3 = TournamentMatch(
                tournament_id=t.id, round=next_round, slot=1,
                player1_id=losers[0], player2_id=losers[1], status="ready",
            )
            session.add(tm3)
            next_matches.append(tm3)
        elif len(losers) == 1:
            # второй финалист прошёл по баю -> 3-е место присуждаем единственному
            # проигравшему полуфинала без игры (bye-матч за 3-е место)
            tm3 = TournamentMatch(
                tournament_id=t.id, round=next_round, slot=1,
                player1_id=losers[0], player2_id=None,
                winner_id=losers[0], status="bye", finished_at=datetime.utcnow(),
            )
            session.add(tm3)
            next_matches.append(tm3)

    await session.commit()

    for tm in next_matches:
        if tm.status == "ready":
            mid = await _create_game_for_match(tm, t)
            if mid:
                tm.match_id = mid
                tm.status = "active"
    await session.commit()

    # рекурсивно — на случай новых баев
    await _advance_if_round_complete(t, next_round, session)


def _is_third_place_round(matches: List[TournamentMatch]) -> bool:
    return any(m.slot == 1 for m in matches) and any(m.slot == 0 for m in matches)


async def _finish_tournament(t: Tournament, final_matches: List[TournamentMatch], session) -> None:
    final_matches = sorted(final_matches, key=lambda m: m.slot)
    final = next((m for m in final_matches if m.slot == 0), None)
    third = next((m for m in final_matches if m.slot == 1), None)

    placements: List[Dict[str, Any]] = []
    if final and final.winner_id:
        champion = str(final.winner_id)
        runner = _loser_of(final)
        placements.append({"user_id": champion, "place": 1})
        if runner:
            placements.append({"user_id": str(runner), "place": 2})
    if third and third.winner_id:
        placements.append({"user_id": str(third.winner_id), "place": 3})
        tl = _loser_of(third)
        if tl:
            placements.append({"user_id": str(tl), "place": 4})

    # призовые суммы из фонда по распределению
    pool = int(t.prize_pool_yocto or "0")
    dist = t.prize_distribution or []
    for pl in placements:
        idx = pl["place"] - 1
        pct = dist[idx] if idx < len(dist) else 0
        pl["prize_yocto"] = str(pool * int(pct) // 100)
        pl["paid"] = False
        pl["payout_tx"] = None

    # near аккаунты призёров
    for pl in placements:
        part = (await session.execute(
            select(TournamentParticipant).where(
                TournamentParticipant.tournament_id == t.id,
                TournamentParticipant.user_id == pl["user_id"],
            )
        )).scalar_one_or_none()
        pl["near_account"] = part.near_account if part else None
        if part:
            part.placement = pl["place"]

    t.winners = placements
    t.status = "finished"
    t.finished_at = datetime.utcnow()
    await session.commit()


# ─────────────────────────── ВЫПЛАТА ПРИЗОВ ─────────────────────────────

async def _payout(near_account: str, amount_yocto: int) -> Dict[str, Any]:
    if not near_account:
        return {"success": False, "error": "no near account"}
    if not (TOURNAMENT_TREASURY and TOURNAMENT_TREASURY_KEY):
        return {"success": False, "error": "treasury key not configured"}
    try:
        from py_near.account import Account
        pk = TOURNAMENT_TREASURY_KEY
        if not pk.startswith("ed25519:"):
            pk = "ed25519:" + pk
        rpc = os.getenv("NEAR_RPC_URL", "").strip()
        acc = Account(TOURNAMENT_TREASURY, pk, rpc) if rpc else Account(TOURNAMENT_TREASURY, pk)
        await acc.startup()
        res = await acc.send_money(near_account, int(amount_yocto))
        tx_hash = ""
        if res is not None:
            if hasattr(res, "transaction") and hasattr(res.transaction, "hash"):
                tx_hash = res.transaction.hash
            else:
                tx_hash = str(res)[:32]
        return {"success": True, "tx_hash": tx_hash}
    except Exception as e:
        print(f"[Tournaments] payout error: {e}")
        traceback.print_exc()
        return {"success": False, "error": str(e)}


# ─────────────────────────── СЕРИАЛИЗАЦИЯ ───────────────────────────────

async def _bracket_view(t: Tournament, session, me: Optional[str]) -> Dict[str, Any]:
    matches = (await session.execute(
        select(TournamentMatch)
        .where(TournamentMatch.tournament_id == t.id)
        .order_by(TournamentMatch.round, TournamentMatch.slot)
    )).scalars().all()

    rounds: Dict[int, List[Dict[str, Any]]] = {}
    my_match = None
    for m in matches:
        item = {
            "id": m.id, "round": m.round, "slot": m.slot,
            "player1_id": m.player1_id, "player2_id": m.player2_id,
            "winner_id": m.winner_id, "status": m.status,
            "match_id": m.match_id,
            "is_third_place": (m.slot == 1 and _is_third_place_round(
                [x for x in matches if x.round == m.round]
            )),
        }
        rounds.setdefault(m.round, []).append(item)
        if me and m.status == "active" and str(me) in (str(m.player1_id), str(m.player2_id)):
            my_match = item

    return {
        "rounds": [{"round": r, "matches": rounds[r]} for r in sorted(rounds.keys())],
        "my_match": my_match,
    }


async def _participants_view(t: Tournament, session) -> List[Dict[str, Any]]:
    parts = (await session.execute(
        select(TournamentParticipant).where(TournamentParticipant.tournament_id == t.id)
    )).scalars().all()
    return [
        {
            "user_id": p.user_id,
            "near_account": p.near_account,
            "placement": p.placement,
            "eliminated_round": p.eliminated_round,
        }
        for p in parts
    ]


def _tournament_view(t: Tournament, count: int) -> Dict[str, Any]:
    return {
        "id": t.id,
        "name": t.name,
        "image_url": t.image_url,
        "status": t.status,
        "entry_fee_yocto": t.entry_fee_yocto,
        "entry_fee_near": round(int(t.entry_fee_yocto or "0") / YOCTO, 4),
        "treasury": t.treasury,
        "prize_distribution": t.prize_distribution or [],
        "registration_ends_at": t.registration_ends_at.isoformat() + "Z" if t.registration_ends_at else None,
        "max_participants": t.max_participants,
        "prize_pool_yocto": t.prize_pool_yocto,
        "prize_pool_near": round(int(t.prize_pool_yocto or "0") / YOCTO, 4),
        "participants_count": count,
        "winners": t.winners or [],
        "created_at": t.created_at.isoformat() + "Z" if t.created_at else None,
        "started_at": t.started_at.isoformat() + "Z" if t.started_at else None,
        "finished_at": t.finished_at.isoformat() + "Z" if t.finished_at else None,
    }


async def _reconcile(t: Tournament, session) -> None:
    """Лениво подтягиваем результаты: активные турнирные матчи, чьи PvPMatch уже
    завершены, переводим в finished и двигаем сетку. Делает бота самовосстанавливающимся,
    даже если фронт не вызвал report."""
    if t.status != "running":
        return
    active = (await session.execute(
        select(TournamentMatch).where(
            TournamentMatch.tournament_id == t.id,
            TournamentMatch.status == "active",
        )
    )).scalars().all()
    touched_rounds = set()
    for m in active:
        w = await _read_match_winner(m.match_id)
        if w:
            m.winner_id = w
            m.status = "finished"
            m.finished_at = datetime.utcnow()
            loser = _loser_of(m)
            if loser:
                part = (await session.execute(
                    select(TournamentParticipant).where(
                        TournamentParticipant.tournament_id == t.id,
                        TournamentParticipant.user_id == str(loser),
                    )
                )).scalar_one_or_none()
                if part and part.eliminated_round is None:
                    part.eliminated_round = m.round
            touched_rounds.add(m.round)
    if touched_rounds:
        await session.commit()
        for rnd in sorted(touched_rounds):
            await _advance_if_round_complete(t, rnd, session)


async def _maybe_auto_start(t: Tournament, session) -> None:
    if t.status != "registration":
        return
    if t.registration_ends_at and datetime.utcnow() >= t.registration_ends_at:
        await _start_tournament(t, session)


# ─────────────────────────── ЭНДПОИНТЫ ──────────────────────────────────

class CreateTournamentRequest(BaseModel):
    name: str
    entry_fee_near: float = 0.0
    prize_distribution: List[int] = [50, 30, 20]
    registration_minutes: int = 30
    max_participants: Optional[int] = None
    treasury: Optional[str] = None
    image_url: Optional[str] = None


@router.post("")
async def create_tournament(body: CreateTournamentRequest, authorization: str = Header(None)):
    uid = await _require_admin(authorization)

    dist = [int(x) for x in (body.prize_distribution or []) if int(x) > 0]
    if sum(dist) > 100:
        raise HTTPException(status_code=400, detail="prize_distribution sum must be <= 100")

    treasury = (body.treasury or TOURNAMENT_TREASURY).strip()
    if not treasury:
        raise HTTPException(status_code=400, detail="treasury wallet not set (env TOURNAMENT_TREASURY or body.treasury)")

    t = Tournament(
        id=uuid.uuid4().hex,
        name=body.name.strip() or "Card Clash Cup",
        status="registration",
        entry_fee_yocto=str(int(round(body.entry_fee_near * YOCTO))),
        treasury=treasury,
        prize_distribution=dist or [50, 30, 20],
        registration_ends_at=datetime.utcnow() + timedelta(minutes=max(1, body.registration_minutes)),
        max_participants=body.max_participants,
        prize_pool_yocto="0",
        winners=[],
        image_url=(body.image_url or None),
    )
    async for session in get_session():
        session.add(t)
        await session.commit()
        return _tournament_view(t, 0)


_LIST_CACHE = {"ts": 0.0, "out": None}
_ADMIN_CACHE = {}  # uid -> (ts, bool)


@router.get("")
async def list_tournaments(authorization: str = Header(None)):
    import time as _t
    now = _t.time()
    out = _LIST_CACHE["out"]
    # Тяжёлую работу (reconcile/auto-start/счётчики) делаем максимум раз в 5с,
    # а не на каждый запрос — это снимает основную нагрузку на БД под онлайном.
    if out is None or (now - _LIST_CACHE["ts"]) >= 5:
        async for session in get_session():
            ts = (await session.execute(
                select(Tournament).order_by(Tournament.created_at.desc())
            )).scalars().all()
            out = []
            for t in ts:
                await _maybe_auto_start(t, session)
                await _reconcile(t, session)
                cnt = len((await session.execute(
                    select(TournamentParticipant).where(TournamentParticipant.tournament_id == t.id)
                )).scalars().all())
                out.append(_tournament_view(t, cnt))
            break
        _LIST_CACHE.update(ts=now, out=out)

    # am_admin кэшируем по пользователю на 30с (иначе на каждый запрос лезли бы в БД)
    uid = _uid_from_token(authorization) or ""
    cached = _ADMIN_CACHE.get(uid)
    if cached and (now - cached[0]) < 30:
        am = cached[1]
    else:
        am = await _check_is_admin(authorization)
        _ADMIN_CACHE[uid] = (now, am)

    return {"tournaments": out, "am_admin": am}


@router.get("/{tid}")
async def get_tournament(tid: str, authorization: str = Header(None)):
    me = _uid_from_token(authorization)
    async for session in get_session():
        t = await session.get(Tournament, tid)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
        await _maybe_auto_start(t, session)
        await _reconcile(t, session)
        parts = await _participants_view(t, session)
        bracket = await _bracket_view(t, session, me)
        view = _tournament_view(t, len(parts))
        view["participants"] = parts
        view["bracket"] = bracket
        view["am_registered"] = bool(me and any(str(p["user_id"]) == str(me) for p in parts))
        view["am_admin"] = await _check_is_admin(authorization)
        return view


class RegisterRequest(BaseModel):
    tx_hash: Optional[str] = None
    near_account: str


@router.post("/{tid}/register")
async def register_tournament(tid: str, body: RegisterRequest, authorization: str = Header(None)):
    uid = _require_uid(authorization)
    async for session in get_session():
        t = await session.get(Tournament, tid)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
        if t.status != "registration":
            raise HTTPException(status_code=400, detail="Registration is closed")
        if t.registration_ends_at and datetime.utcnow() >= t.registration_ends_at:
            raise HTTPException(status_code=400, detail="Registration time is over")

        existing = (await session.execute(
            select(TournamentParticipant).where(
                TournamentParticipant.tournament_id == tid,
                TournamentParticipant.user_id == uid,
            )
        )).scalar_one_or_none()
        if existing:
            return {"ok": True, "already": True}

        if t.max_participants:
            cnt = len((await session.execute(
                select(TournamentParticipant).where(TournamentParticipant.tournament_id == tid)
            )).scalars().all())
            if cnt >= t.max_participants:
                raise HTTPException(status_code=400, detail="Tournament is full")

        fee = int(t.entry_fee_yocto or "0")
        if fee > 0 and TOURNAMENT_PAYMENT_VERIFY:
            if not body.tx_hash:
                raise HTTPException(status_code=400, detail="Payment tx required")
            try:
                from routers.cases import verify_case_payment
                min_yocto = int(fee * 0.99)
                ok, reason = await verify_case_payment(
                    tx_hash=body.tx_hash,
                    sender=body.near_account.strip(),
                    treasury=t.treasury,
                    min_yocto=min_yocto,
                )
            except Exception as e:
                ok, reason = False, f"verify error: {e}"
            if not ok:
                raise HTTPException(status_code=402, detail=f"Payment not verified: {reason}")

        part = TournamentParticipant(
            tournament_id=tid,
            user_id=uid,
            near_account=body.near_account.strip(),
            entry_tx=body.tx_hash,
        )
        session.add(part)
        if fee > 0:
            t.prize_pool_yocto = str(int(t.prize_pool_yocto or "0") + fee)
        await session.commit()
        return {"ok": True}


@router.post("/{tid}/start")
async def start_tournament_now(tid: str, authorization: str = Header(None)):
    uid = await _require_admin(authorization)
    async for session in get_session():
        t = await session.get(Tournament, tid)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
        if t.status != "registration":
            raise HTTPException(status_code=400, detail=f"Cannot start: status={t.status}")
        await _start_tournament(t, session)
        return {"ok": True, "status": t.status}


class ImageRequest(BaseModel):
    image_url: str


@router.post("/{tid}/image")
async def set_tournament_image(tid: str, body: ImageRequest, authorization: str = Header(None)):
    """Админ ставит фон турнира (URL или data:base64). Размер режем на клиенте."""
    await _require_admin(authorization)
    img = (body.image_url or "").strip()
    if len(img) > 600000:
        raise HTTPException(status_code=413, detail="Image too large (resize on client)")
    async for session in get_session():
        t = await session.get(Tournament, tid)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
        t.image_url = img or None
        await session.commit()
        return {"ok": True}


@router.post("/{tid}/report")
async def report_match(tid: str, body: Dict[str, Any] = Body(default={}), authorization: str = Header(None)):
    """Подсказка серверу, что турнирный матч завершился. Победитель всё равно
    читается авторитетно из PvPMatch (клиенту не доверяем)."""
    _require_uid(authorization)
    async for session in get_session():
        t = await session.get(Tournament, tid)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
        await _reconcile(t, session)
        return {"ok": True, "status": t.status}


@router.post("/{tid}/settle")
async def settle_tournament(tid: str, authorization: str = Header(None)):
    """Выплатить призы (если задан ключ казны) и пометить турнир рассчитанным."""
    uid = await _require_admin(authorization)
    async for session in get_session():
        t = await session.get(Tournament, tid)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
        if t.status != "finished":
            raise HTTPException(status_code=400, detail=f"Tournament not finished (status={t.status})")
        if t.settled:
            return {"ok": True, "already": True, "winners": t.winners}

        winners = list(t.winners or [])
        for w in winners:
            amt = int(w.get("prize_yocto", "0"))
            if amt <= 0 or w.get("paid"):
                continue
            r = await _payout(w.get("near_account"), amt)
            if r.get("success"):
                w["paid"] = True
                w["payout_tx"] = r.get("tx_hash")
            else:
                w["payout_error"] = r.get("error")
        t.winners = winners
        t.settled = all(w.get("paid") or int(w.get("prize_yocto", "0")) <= 0 for w in winners)
        await session.commit()
        return {"ok": True, "settled": t.settled, "winners": winners}


@router.delete("/{tid}")
async def delete_tournament(tid: str, authorization: str = Header(None)):
    """Удалить турнир (админ) вместе с участниками и матчами сетки."""
    await _require_admin(authorization)
    async for session in get_session():
        t = await session.get(Tournament, tid)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
        await session.execute(delete(TournamentMatch).where(TournamentMatch.tournament_id == tid))
        await session.execute(delete(TournamentParticipant).where(TournamentParticipant.tournament_id == tid))
        await session.delete(t)
        await session.commit()
        _LIST_CACHE["ts"] = 0
        return {"ok": True}

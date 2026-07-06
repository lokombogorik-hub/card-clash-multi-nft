import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.session import engine
from database.models import Base
from database.migrations_bootstrap import ensure_users_columns, ensure_all_tables, ensure_tournament_columns

from api.auth import router as auth_router
from api.users import router as users_router
from routers.mock_nfts import router as mock_nfts_router
from routers.near import router as near_router
from routers.matches import router as matches_router
from routers.matchmaking import router as matchmaking_router, cleanup_stale_matches
from routers.cases import router as cases_router
from routers.proxy import router as proxy_router
from routers.decks import router as decks_router
from routers.ws_match import router as ws_game_router
from routers.user import router as user_router
from routers.tournaments import router as tournaments_router
from routers.presence import router as presence_router
from routers.coins import router as coins_router
from routers.stress import router as stress_router

logger = logging.getLogger(__name__)

# Background task reference
cleanup_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    global cleanup_task

    # Startup
    if engine is not None:
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            await ensure_users_columns(engine)
            await ensure_all_tables(engine)
            await ensure_tournament_columns(engine)
            logger.info("DB schema ensured")
        except Exception:
            logger.exception("DB init failed")
    else:
        logger.warning("DB engine not configured")

    # Start background cleanup task
    cleanup_task = asyncio.create_task(cleanup_stale_matches())
    logger.info("Started background cleanup task for stale matches")

    yield

    # Shutdown
    if cleanup_task:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        logger.info("Stopped background cleanup task")


app = FastAPI(title="Card Clash API", lifespan=lifespan)

# Авторизация идёт через заголовок Authorization (Bearer), cookies не
# используются, поэтому allow_credentials=False — это снимает невалидную
# и небезопасную комбинацию "*" + credentials. Список доменов можно
# сузить через переменную окружения ALLOWED_ORIGINS (через запятую).
import os as _os
_allowed = [o.strip() for o in _os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────── RATE LIMIT ────────────────────────────────
# Простой лимитер в памяти (скользящее окно). Ключ — пользователь из токена,
# иначе IP. Отсекает флуд/скрипты, не мешая обычным опросам клиента.
# Один процесс (Railway hobby) — этого достаточно; при масштабировании вынести в Redis.
import time as _time
from collections import deque as _deque
from fastapi.responses import JSONResponse as _JSONResponse

_RL_WINDOW = 20.0     # окно, сек
_RL_MAX = 200         # макс запросов на ключ за окно (~10/сек — с большим запасом)
_rl_hits = {}
_rl_calls = 0


def _rl_key(request):
    auth = request.headers.get("authorization") or ""
    if auth:
        return "u:" + auth[-40:]
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return "ip:" + xff.split(",")[0].strip()
    return "ip:" + (request.client.host if request.client else "?")


@app.middleware("http")
async def rate_limit(request, call_next):
    global _rl_calls
    path = request.url.path
    if path in ("/health", "/") or path.startswith("/ws"):
        return await call_next(request)

    now = _time.time()
    key = _rl_key(request)
    dq = _rl_hits.get(key)
    if dq is None:
        dq = _deque()
        _rl_hits[key] = dq
    while dq and now - dq[0] > _RL_WINDOW:
        dq.popleft()
    if len(dq) >= _RL_MAX:
        return _JSONResponse(status_code=429, content={"detail": "Слишком много запросов, подожди пару секунд"})
    dq.append(now)

    # периодическая чистка «мёртвых» ключей, чтобы словарь не рос
    _rl_calls += 1
    if _rl_calls % 2000 == 0:
        for k in [k for k, d in _rl_hits.items() if not d or now - d[-1] > _RL_WINDOW]:
            _rl_hits.pop(k, None)

    return await call_next(request)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
def read_root():
    return {"status": "ok", "service": "Card Clash API"}


app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
# ВАЖНО: decks_router (реальная БД-колода) регистрируем ДО mock_nfts_router,
# иначе mock перехватывает /api/decks/active/full и /api/decks/ai_opponent и
# отдаёт случайные карты в неверном формате (фронт ждёт {cards:[...]}).
# Уникальные mock-роуты (/api/nfts/my, /api/decks/active GET/PUT) остаются за mock.
app.include_router(decks_router)
app.include_router(mock_nfts_router)
app.include_router(near_router)
app.include_router(matches_router)
app.include_router(matchmaking_router)
app.include_router(cases_router)
app.include_router(proxy_router)
app.include_router(ws_game_router)
app.include_router(user_router)
app.include_router(tournaments_router)
app.include_router(presence_router)
app.include_router(coins_router)
app.include_router(stress_router)

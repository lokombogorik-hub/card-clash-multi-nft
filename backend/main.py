import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.session import engine
from database.models import Base
from database.migrations_bootstrap import ensure_users_columns, ensure_all_tables

from api.auth import router as auth_router
from api.users import router as users_router
from routers.mock_nfts import router as mock_nfts_router
from routers.near import router as near_router
from routers.matches import router as matches_router
from routers.matchmaking import router as matchmaking_router, cleanup_stale_matches
from routers.cases import router as cases_router
from routers.proxy import router as proxy_router
from routers.decks import router as decks_router
from routers.ws_game import router as ws_game_router
from routers.user import router as user_router

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
def read_root():
    return {"status": "ok", "service": "Card Clash API"}


app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(mock_nfts_router)
app.include_router(near_router)
app.include_router(matches_router)
app.include_router(matchmaking_router)
app.include_router(cases_router)
app.include_router(proxy_router)
app.include_router(decks_router)
app.include_router(ws_game_router)
app.include_router(user_router)
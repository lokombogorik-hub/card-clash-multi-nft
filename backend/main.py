import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database.session import engine
from database.models import Base
from database.migrations_bootstrap import ensure_users_columns

from api.auth import router as auth_router
from api.users import router as users_router
from routers.mock_nfts import router as mock_nfts_router
from routers.near import router as near_router
from routers.matches import router as matches_router
from routers.matchmaking import router as matchmaking_router
from routers.cases import router as cases_router
from routers.proxy import router as proxy_router
from routers.decks import router as decks_router

logger = logging.getLogger(__name__)

app = FastAPI(title="Card Clash API")

# CORS middleware - must be first
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
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


@app.on_event("startup")
async def on_startup():
    if engine is None:
        logger.warning("DB engine not configured")
        return
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await ensure_users_columns(engine)
        logger.info("DB schema ensured")
    except Exception:
        logger.exception("DB init failed")
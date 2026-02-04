import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.session import engine
from database.models import Base  # imports all models

from database.migrations_bootstrap import ensure_users_columns

from api.auth import router as auth_router
from api.users import router as users_router
from api.websocket import router as websocket_router

from routers.mock_nfts import router as mock_nfts_router
from routers.near import router as near_router
from routers.matches import router as matches_router
from routers.matchmaking import router as matchmaking_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Card Clash API", version="2.0.0-stage2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "build": "stage2-pvp-nft", "version": "2.0.0"}


app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(websocket_router, prefix="/api")
app.include_router(mock_nfts_router)  # already has prefix="/api"
app.include_router(near_router)       # prefix="/api/near"
app.include_router(matches_router)    # prefix="/api/matches"
app.include_router(matchmaking_router)  # prefix="/api/matchmaking"


@app.on_event("startup")
async def on_startup():
    if engine is None:
        logger.warning("DB engine is not configured; skipping DB init")
        return

    try:
        # Create missing tables (new DB)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        # Bootstrap-migrate existing DB (old schema)
        await ensure_users_columns(engine)

        logger.info("🚀 DB schema ensured (create_all + bootstrap migrations)")
    except Exception:
        logger.exception("❌ DB init failed (service will still run)")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
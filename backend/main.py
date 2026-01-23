import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.session import engine
from database.models import Base  # important: imports all models

from api.auth import router as auth_router
from api.users import router as users_router
from api.websocket import router as websocket_router

from routers.mock_nfts import router as mock_nfts_router
from routers.near import router as near_router
from routers.matches import router as matches_router

logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "build": "stage2-db"}


app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(websocket_router, prefix="/api")
app.include_router(mock_nfts_router)  # already prefix="/api"
app.include_router(near_router)       # prefix="/api/near"
app.include_router(matches_router)    # prefix="/api/matches"


@app.on_event("startup")
async def on_startup():
    if engine is None:
        logger.warning("DB engine is not configured; skipping create_all")
        return
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("DB schema ensured (create_all)")
    except Exception:
        logger.exception("DB init failed (service will still run)")
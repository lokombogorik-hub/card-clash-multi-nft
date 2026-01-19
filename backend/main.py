import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.auth import router as auth_router
from api.users import router as users_router
from api.websocket import router as websocket_router
from routers.mock_nfts import router as mock_nfts_router

from database.session import engine
from database.models.user import User

logging.basicConfig(level=logging.INFO)

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
    return {"status": "ok", "build": "v9-db-safe-startup"}

@app.on_event("startup")
async def _startup_init_db():
    try:
        async with engine.begin() as conn:
            await conn.run_sync(User.metadata.create_all)
        logging.info("DB init OK")
    except Exception:
        logging.exception("DB init failed (continuing without DB)")

app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(websocket_router, prefix="/api")
app.include_router(mock_nfts_router)
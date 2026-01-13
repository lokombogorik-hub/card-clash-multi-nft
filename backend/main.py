from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from utils.config import settings
from api.auth import router as auth_router
from api.users import router as users_router

from database.session import engine
from database.base import Base
from database.models import user as _user_model  # noqa: F401

app = FastAPI(title="CardClash API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list() or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")

@app.on_event("startup")
async def startup():
    # для старта без Alembic
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
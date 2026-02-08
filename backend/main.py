from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database.session import create_all
from backend.database import migrations_bootstrap
from backend.api import auth
from backend.routers import mock_nfts, near, matches

app = FastAPI(title="Card Clash API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(mock_nfts.router)
app.include_router(near.router)
app.include_router(matches.router)

@app.on_event("startup")
async def startup():
    await create_all()
    await migrations_bootstrap.apply_migrations()

@app.get("/")
def read_root():
    return {"status": "ok", "service": "Card Clash API"}
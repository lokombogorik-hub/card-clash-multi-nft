from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
import hashlib
import random

# Подключаем твои существующие роуты (auth/users), чтобы работали:
# /api/auth/telegram и /api/users/me
from api.auth import router as auth_router
from api.users import router as users_router, get_current_user
from routers import mock_nfts

app = FastAPI()

# CORS (для старта пусть будет открыто; потом сузим до домена Vercel)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "build": "cors-1"}

# Подключаем auth/users под /api
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(mock_nfts.router)

# !!! ВРЕМЕННО: in-memory storage по user_id (потом заменим на Postgres)
ACTIVE_DECK: Dict[int, List[str]] = {}

ELEMENTS = [
  ("Earth","🟫"),
  ("Fire","🔥"),
  ("Water","💧"),
  ("Poison","☠️"),
  ("Holy","✨"),
  ("Thunder","⚡"),
  ("Wind","🌪️"),
  ("Ice","❄️"),
]

RANKS = ["common", "rare", "epic", "legendary"]


class NftOut(BaseModel):
  key: str
  chain: str
  contractId: str
  tokenId: str
  name: str
  element: str
  elementIcon: str
  rank: str
  # чтобы не ломать старый фронт: и stats, и sides (одно и то же)
  stats: dict
  sides: dict


class NftList(BaseModel):
  items: List[NftOut]


class DeckIn(BaseModel):
  cards: List[str]


class DeckOut(BaseModel):
  cards: List[str]


class DeckFullOut(BaseModel):
  cards: List[NftOut]


def _rng_for_user(user_id: int) -> random.Random:
  h = hashlib.sha256(f"mock-nfts:v1:{user_id}".encode("utf-8")).digest()
  seed = int.from_bytes(h[:8], "big", signed=False)
  return random.Random(seed)


def _inventory_for_user(user_id: int, count: int = 16) -> List[NftOut]:
  rng = _rng_for_user(user_id)
  items: List[NftOut] = []

  for i in range(count):
    el, ic = rng.choice(ELEMENTS)
    rank = rng.choices(RANKS, weights=[60, 25, 10, 5], k=1)[0]
    sides = {
      "top": rng.randint(1, 10),
      "right": rng.randint(1, 10),
      "bottom": rng.randint(1, 10),
      "left": rng.randint(1, 10),
    }

    key = f"mock:{user_id}:{i+1:02d}"

    items.append(NftOut(
      key=key,
      chain="near",
      contractId="demo.collection.near",
      tokenId=key,  # чтобы ключи колоды совпадали
      name=f"{el} NFT #{i+1:02d}",
      element=el,
      elementIcon=ic,
      rank=rank,
      stats=sides,
      sides=sides,
    ))

  return items


def _inventory_map(user_id: int) -> Dict[str, NftOut]:
  inv = _inventory_for_user(user_id)
  return {n.key: n for n in inv}


def _get_or_init_deck(user_id: int) -> List[str]:
  if user_id in ACTIVE_DECK and len(ACTIVE_DECK[user_id]) == 5:
    return ACTIVE_DECK[user_id]

  inv = _inventory_for_user(user_id)
  keys = [n.key for n in inv[:5]]
  ACTIVE_DECK[user_id] = keys
  return keys

  inv = _inventory_map(int(user.id))
  missing = [k for k in payload.cards if k not in inv]
  if missing:
    raise HTTPException(status_code=400, detail={"error": "unknown keys", "missing": missing})

  ACTIVE_DECK[int(user.id)] = payload.cards
  return {"cards": payload.cards}
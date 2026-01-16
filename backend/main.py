from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict
import random

# !!! ВРЕМЕННО: in-memory storage по user_id (потом заменим на Postgres)
ACTIVE_DECK: Dict[int, List[str]] = {}

ELEMENTS = [
  ("earth","🟫"),
  ("fire","🔥"),
  ("water","💧"),
  ("poison","☠️"),
  ("holy","✨"),
  ("thunder","⚡"),
  ("wind","🌪️"),
  ("ice","❄️"),
]

class NftOut(BaseModel):
  chain: str
  contractId: str
  tokenId: str
  name: str
  element: str
  elementIcon: str
  rank: str
  stats: dict

class NftList(BaseModel):
  items: List[NftOut]

class DeckIn(BaseModel):
  cards: List[str]

class DeckOut(BaseModel):
  cards: List[str]

# предполагаю что у тебя есть get_current_user() из JWT
def get_current_user():
  ...

@app.get("/api/nfts/my", response_model=NftList)
async def my_nfts(user=Depends(get_current_user)):
  items = []
  for i in range(16):
    el, ic = random.choice(ELEMENTS)
    items.append({
      "chain": "near",
      "contractId": "demo.collection.near",
      "tokenId": str(1000 + i),
      "name": f"NFT #{1000+i}",
      "element": el,
      "elementIcon": ic,
      "rank": random.choice(["common","rare","epic","legendary"]),
      "stats": {
        "top": random.randint(1,10),
        "right": random.randint(1,10),
        "bottom": random.randint(1,10),
        "left": random.randint(1,10),
      }
    })
  return {"items": items}

@app.get("/api/decks/active", response_model=DeckOut)
async def get_active_deck(user=Depends(get_current_user)):
  cards = ACTIVE_DECK.get(user.id, [])
  return {"cards": cards}

@app.put("/api/decks/active", response_model=DeckOut)
async def put_active_deck(payload: DeckIn, user=Depends(get_current_user)):
  if len(payload.cards) != 5:
    raise HTTPException(status_code=400, detail="Deck must contain exactly 5 cards")
  ACTIVE_DECK[user.id] = payload.cards
  return {"cards": payload.cards}await conn.run_sync(Base.metadata.create_all)
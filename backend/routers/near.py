from __future__ import annotations

import os
import asyncio
from typing import Any, Dict

import aiohttp
from fastapi import APIRouter, Body, Depends, HTTPException

from api.users import get_current_user
from database.session import get_session
from database.models.user import User

router = APIRouter(prefix="/api/near", tags=["near"])

NEAR_RPC_URL = os.getenv("NEAR_RPC_URL", "https://rpc.mainnet.near.org")


def _is_valid_account_id(account_id: str) -> bool:
    a = (account_id or "").strip().lower()
    if len(a) < 2 or len(a) > 64:
        return False
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-_.")
    return all(ch in allowed for ch in a)


@router.post("/rpc")
async def near_rpc(payload: Dict[str, Any] = Body(...)):
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                NEAR_RPC_URL,
                json=payload,
                headers={"content-type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=20),
            ) as resp:
                return await resp.json()
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="NEAR RPC timeout")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NEAR RPC proxy error: {e}")


@router.post("/link")
async def link_near_account(
    data: Dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
):
    account_id = (data.get("accountId") or data.get("account_id") or "").strip().lower()
    if not _is_valid_account_id(account_id):
        raise HTTPException(status_code=400, detail="Invalid NEAR accountId")

    try:
        async for session in get_session():
            u = await session.get(User, int(user.id))
            if u is None:
                u = User(id=int(user.id), username=user.username)
                session.add(u)

            u.near_account_id = account_id
            await session.commit()
            break
    except Exception:
        # даже если БД падает — хотя бы отвечаем ok
        pass

    return {"ok": True, "accountId": account_id}


@router.get("/link")
async def get_linked_near_account(user: User = Depends(get_current_user)):
    try:
        async for session in get_session():
            u = await session.get(User, int(user.id))
            if u and u.near_account_id:
                return {"accountId": u.near_account_id}
            break
    except Exception:
        pass

    return {"accountId": None}
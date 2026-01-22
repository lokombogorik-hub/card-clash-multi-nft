from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

FASTNEAR_BASE = "https://api.fastnear.com/v0"


async def fetch_nfts_for_owner(account_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Возвращает список NFT владельца через fastnear indexer.

    Ответ fastnear может меняться, поэтому ниже мы обрабатываем несколько возможных форм.
    """
    url = f"{FASTNEAR_BASE}/account/{account_id}/nfts"
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, params={"limit": limit})
        r.raise_for_status()
        data = r.json()

    # Возможные формы:
    # - list
    # - { "nfts": [...] }
    # - { "items": [...] }
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if isinstance(data.get("nfts"), list):
            return data["nfts"]
        if isinstance(data.get("items"), list):
            return data["items"]
    return []
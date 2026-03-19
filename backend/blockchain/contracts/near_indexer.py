from __future__ import annotations

import asyncio
import json
import urllib.parse
import urllib.request
from typing import Any, Dict, List

FASTNEAR_BASE = "https://api.fastnear.com/v0"


def _fetch_json(url: str, timeout: float = 20.0) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "accept": "application/json",
            "user-agent": "card-clash/1.0",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)


async def fetch_nfts_for_owner(account_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    FastNEAR indexer: GET /account/{account_id}/nfts?limit=...
    Без httpx/requests — только stdlib, чтобы не ломать деплой.
    """
    safe_account = urllib.parse.quote(account_id.strip())
    url = f"{FASTNEAR_BASE}/account/{safe_account}/nfts?limit={int(limit)}"

    data = await asyncio.to_thread(_fetch_json, url)

    # возможные формы ответа:
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
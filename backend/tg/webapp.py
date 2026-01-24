from __future__ import annotations

import hashlib
import hmac
import os
import time
import urllib.parse
import json
from typing import Any, Dict, Optional


def _parse_init_data(init_data: str) -> Dict[str, str]:
    """
    Parse Telegram WebApp initData querystring into dict[str,str].
    """
    data = {}
    for k, v in urllib.parse.parse_qsl(init_data, keep_blank_values=True):
        data[k] = v
    return data


def verify_init_data(init_data: str, bot_token: Optional[str] = None, max_age_sec: int = 60 * 60) -> bool:
    """
    Telegram WebApp initData verification:
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app

    Raises ValueError on invalid.
    """
    token = bot_token or os.getenv("TELEGRAM_BOT_TOKEN", "")
    if not token:
        raise ValueError("TELEGRAM_BOT_TOKEN is not set")

    data = _parse_init_data(init_data)

    received_hash = data.get("hash")
    if not received_hash:
        raise ValueError("hash missing in initData")

    # Optional freshness check
    auth_date = data.get("auth_date")
    if auth_date and auth_date.isdigit():
        age = int(time.time()) - int(auth_date)
        if age > max_age_sec:
            raise ValueError("initData expired")

    # Build data_check_string excluding hash
    pairs = []
    for k in sorted(data.keys()):
        if k == "hash":
            continue
        pairs.append(f"{k}={data[k]}")
    data_check_string = "\n".join(pairs)

    secret_key = hmac.new(b"WebAppData", token.encode("utf-8"), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise ValueError("hash mismatch")

    return True


def extract_user(init_data: str) -> Dict[str, Any]:
    """
    Returns Telegram user dict from initData.
    Always returns dict, never string.
    """
    data = _parse_init_data(init_data)
    raw_user = data.get("user")
    if not raw_user:
        return {}

    # `user` is JSON string
    try:
        u = json.loads(raw_user)
        if isinstance(u, dict):
            return u
    except Exception:
        pass

    return {}
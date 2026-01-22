import hmac
import hashlib
import json
import time
from urllib.parse import parse_qsl
from dataclasses import dataclass
from typing import Any, Dict

from utils.config import settings


@dataclass
class TgWebAppUser:
    id: int
    username: str | None
    first_name: str | None
    last_name: str | None
    language_code: str | None


def _secret_key(bot_token: str) -> bytes:
    # Telegram WebApp secret key:
    return hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()


def verify_init_data(init_data: str) -> Dict[str, Any]:
    bot_token = settings.effective_bot_token
    if not bot_token:
        raise ValueError("Bot token missing (set TELEGRAM_BOT_TOKEN or BOT_TOKEN)")

    data = dict(parse_qsl(init_data, strict_parsing=True))
    received_hash = data.pop("hash", None)
    if not received_hash:
        raise ValueError("initData hash missing")

    data_check_string = "\n".join([f"{k}={v}" for k, v in sorted(data.items())])

    sk = _secret_key(bot_token)
    calculated = hmac.new(sk, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated, received_hash):
        raise ValueError("initData hash invalid")

    auth_date = int(data.get("auth_date", "0"))
    if auth_date <= 0:
        raise ValueError("auth_date missing")

    if int(time.time()) - auth_date > settings.TG_INITDATA_MAX_AGE_SEC:
        raise ValueError("initData expired")

    return data


def extract_user(init_data_verified: Dict[str, Any]) -> TgWebAppUser:
    user_raw = init_data_verified.get("user")
    if not user_raw:
        raise ValueError("user missing in initData")
    obj = json.loads(user_raw)
    return TgWebAppUser(
        id=int(obj["id"]),
        username=obj.get("username"),
        first_name=obj.get("first_name"),
        last_name=obj.get("last_name"),
        language_code=obj.get("language_code"),
    )
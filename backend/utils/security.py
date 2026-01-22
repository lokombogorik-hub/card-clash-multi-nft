from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt

from utils.config import settings


def create_access_token(data: Dict[str, Any]) -> str:
    if not settings.JWT_SECRET:
        # лучше явно падать, чем выдавать "битые" токены
        raise RuntimeError("JWT_SECRET is not set")

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=int(settings.JWT_EXPIRES_MIN))

    payload = dict(data)
    payload.update(
        {
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        }
    )

    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)
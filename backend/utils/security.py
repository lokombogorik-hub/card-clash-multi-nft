from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from jose import jwt, JWTError

from utils.config import settings


def create_access_token(data: Dict[str, Any]) -> str:
    if not settings.JWT_SECRET:
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


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and verify JWT token."""
    if not settings.JWT_SECRET:
        raise RuntimeError("JWT_SECRET is not set")

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALG]
        )
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}")
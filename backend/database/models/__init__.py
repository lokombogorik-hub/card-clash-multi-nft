from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from database.models.user import User

__all__ = ["Base", "User"]
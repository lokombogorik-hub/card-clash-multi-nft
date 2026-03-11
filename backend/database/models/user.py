from sqlalchemy import Column, Integer, String, BigInteger
from database.models import Base


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True)
    username = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    near_account_id = Column(String, nullable=True)
    total_matches = Column(Integer, default=0, nullable=False, server_default="0")
    wins = Column(Integer, default=0, nullable=False, server_default="0")
    losses = Column(Integer, default=0, nullable=False, server_default="0")
    elo_rating = Column(Integer, default=1000, nullable=False, server_default="1000")
    nfts_count = Column(Integer, default=0, nullable=False, server_default="0")
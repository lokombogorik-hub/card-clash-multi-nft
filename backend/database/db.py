# backend/database/db.py
import os
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL") or os.getenv("MONGODB_URL") or os.getenv(
    "DATABASE_URL") or "mongodb://localhost:27017"
DB_NAME = os.getenv("MONGO_DB_NAME") or os.getenv("DB_NAME") or "cardclash"

_client: Optional[AsyncIOMotorClient] = None
_database = None


async def connect_to_mongo():
    """Connect to MongoDB"""
    global _client, _database
    try:
        _client = AsyncIOMotorClient(MONGO_URL)
        _database = _client[DB_NAME]
        # тест подключения
        await _client.admin.command('ping')
        print(f"[DB] Connected to MongoDB: {DB_NAME}")
    except Exception as e:
        print(f"[DB] MongoDB connection failed: {e}")

        _database = None


async def close_mongo_connection():
    """Close MongoDB connection"""
    global _client
    if _client:
        _client.close()
        print("[DB] MongoDB connection closed")


def get_database():
    """Get database instance - used as FastAPI dependency"""
    global _database
    if _database is None:
        # Врзврат
        return InMemoryDB()
    return _database


class InMemoryDB:
    """In-memory fallback when MongoDB is not available"""

    def __init__(self):
        self._collections = {}

    def __getitem__(self, name: str):
        if name not in self._collections:
            self._collections[name] = InMemoryCollection(name)
        return self._collections[name]


class InMemoryCollection:
    """In-memory collection fallback"""

    def __init__(self, name: str):
        self.name = name
        self._data = {}
        self._counter = 0

    async def find_one(self, filter_dict: dict):
        for doc in self._data.values():
            match = True
            for key, value in filter_dict.items():
                if key == "$or":
                    # Оператор
                    or_match = False
                    for condition in value:
                        cond_match = True
                        for k, v in condition.items():
                            if doc.get(k) != v:
                                cond_match = False
                                break
                        if cond_match:
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif doc.get(key) != value:
                    match = False
                    break
            if match:
                return doc
        return None

    async def insert_one(self, document: dict):
        self._counter += 1
        doc_id = document.get("_id") or f"mem_{self._counter}"
        document["_id"] = doc_id
        self._data[doc_id] = document

        class InsertResult:
            def __init__(self, inserted_id):
                self.inserted_id = inserted_id

        return InsertResult(doc_id)

    async def update_one(self, filter_dict: dict, update: dict, upsert: bool = False):
        doc = await self.find_one(filter_dict)

        if doc:

            if "$set" in update:
                for key, value in update["$set"].items():
                    doc[key] = value

            if "$inc" in update:
                for key, value in update["$inc"].items():
                    doc[key] = doc.get(key, 0) + value

            class UpdateResult:
                modified_count = 1
                upserted_id = None

            return UpdateResult()
        elif upsert:
            # Новыйв документ
            new_doc = {}
            for key, value in filter_dict.items():
                if not key.startswith("$"):
                    new_doc[key] = value
            if "$set" in update:
                for key, value in update["$set"].items():
                    new_doc[key] = value
            await self.insert_one(new_doc)

            class UpdateResult:
                modified_count = 0
                upserted_id = new_doc.get("_id")

            return UpdateResult()
        else:
            class UpdateResult:
                modified_count = 0
                upserted_id = None

            return UpdateResult()

    async def delete_one(self, filter_dict: dict):
        doc = await self.find_one(filter_dict)
        if doc and doc.get("_id") in self._data:
            del self._data[doc["_id"]]

            class DeleteResult:
                deleted_count = 1

            return DeleteResult()

        class DeleteResult:
            deleted_count = 0

        return DeleteResult()

    def find(self, filter_dict: dict = None):
        return InMemoryCursor(self._data.values(), filter_dict)


class InMemoryCursor:
    """In-memory cursor for find() operations"""

    def __init__(self, data, filter_dict=None):
        self._data = list(data)
        self._filter = filter_dict or {}

    async def to_list(self, length: int = None):
        results = []
        for doc in self._data:
            match = True
            for key, value in self._filter.items():
                if doc.get(key) != value:
                    match = False
                    break
            if match:
                results.append(doc)
            if length and len(results) >= length:
                break
        return results

    def sort(self, key_or_list, direction=None):
        # Simple sort implementation
        return self

    def limit(self, n: int):
        self._data = self._data[:n]
        return self
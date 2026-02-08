from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from backend.database.session import get_session
from backend.api.users import get_current_user
from backend.database.models.user import User
from pydantic import BaseModel
import random
import httpx

router = APIRouter(prefix="/api/cases", tags=["cases"])

# Конфигурация коллекций
COLLECTIONS = {
    "cardclash": {
        "contract_id": "cardclash-nft.retardo-s.near",
        "treasury": "retardo-s.near",
        "total_supply": 10000,
    },
    # Партнёрские коллекции добавляются здесь
    # "partner1": {
    #     "contract_id": "partner-nft.near",
    #     "treasury": "partner-treasury.near",
    #     "total_supply": 5000,
    # },
}


# Распределение рарности по tokenId % total_supply
def get_rarity_from_token_id(token_id: str, total_supply: int) -> str:
    """
    Извлекаем числовую часть из token_id и определяем рарность
    """
    # Извлекаем число из token_id (например, "card_1234" -> 1234)
    num = int(''.join(filter(str.isdigit, token_id)) or "0")

    percent = (num / total_supply) * 100

    if percent <= 25:
        return "legendary"
    elif percent <= 50:
        return "epic"
    elif percent <= 75:
        return "rare"
    else:
        return "common"


# Веса для случайного выбора (можно настроить)
RARITY_WEIGHTS = {
    "common": 55,  # 55%
    "rare": 30,  # 30%
    "epic": 12,  # 12%
    "legendary": 3,  # 3%
}


class OpenCaseRequest(BaseModel):
    case_id: str
    tx_hash: str


class ClaimNFTRequest(BaseModel):
    reserved_token_id: str


@router.post("/open")
async def open_case(
        data: OpenCaseRequest,
        user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
):
    """
    1. Проверяем оплату (tx_hash)
    2. Выбираем рарность по весам
    3. Резервируем случайную NFT нужной рарности из пула
    4. Возвращаем данные для анимации
    """

    # TODO: Проверить tx_hash через NEAR RPC
    # Пока пропускаем для демо

    # Определяем сколько карт выдавать
    card_count = 1 if data.case_id == "starter" else 5

    # Выбираем рарность (для starter) или гарантированные (для других кейсов)
    if data.case_id == "starter":
        # Случайная рарность
        target_rarity = random.choices(
            list(RARITY_WEIGHTS.keys()),
            weights=list(RARITY_WEIGHTS.values())
        )[0]
    elif data.case_id == "premium":
        # Случайные 5 карт
        target_rarity = "mixed"
    elif data.case_id == "legendary":
        # 5 epic карт
        target_rarity = "epic"
    elif data.case_id == "ultimate":
        # 5 legendary карт
        target_rarity = "legendary"
    else:
        raise HTTPException(400, "Unknown case_id")

    # Выбираем коллекцию (пока только своя)
    collection = COLLECTIONS["cardclash"]

    # Генерируем случайные token_id из нужного диапазона рарности
    reserved_tokens = []

    for _ in range(card_count):
        if target_rarity == "mixed":
            # Случайная рарность для каждой карты
            rarity = random.choices(
                list(RARITY_WEIGHTS.keys()),
                weights=list(RARITY_WEIGHTS.values())
            )[0]
        else:
            rarity = target_rarity

        # Генерируем tokenId в нужном диапазоне
        total = collection["total_supply"]

        if rarity == "legendary":
            num = random.randint(0, int(total * 0.25))
        elif rarity == "epic":
            num = random.randint(int(total * 0.25), int(total * 0.50))
        elif rarity == "rare":
            num = random.randint(int(total * 0.50), int(total * 0.75))
        else:  # common
            num = random.randint(int(total * 0.75), total - 1)

        token_id = f"card_{num:05d}"  # card_00123

        reserved_tokens.append({
            "token_id": token_id,
            "contract_id": collection["contract_id"],
            "rarity": rarity,
        })

    # TODO: Сохранить резервацию в БД (чтобы не выдать дважды)

    # Возвращаем данные для фронта
    return {
        "cards": reserved_tokens,
        "collection": "cardclash",
        "ready_for_claim": True,
    }


@router.post("/claim")
async def claim_nft(
        data: ClaimNFTRequest,
        user: User = Depends(get_current_user),
):
    """
    Формируем транзакцию nft_transfer для подписи в кошельке
    """

    if not user.near_account_id:
        raise HTTPException(400, "NEAR account not linked")

    # TODO: Проверить что этот token_id зарезервирован за этим пользователем

    # Определяем из какой коллекции
    collection = COLLECTIONS["cardclash"]

    # Формируем транзакцию для подписи
    return {
        "transaction": {
            "receiverId": collection["contract_id"],
            "actions": [{
                "type": "FunctionCall",
                "params": {
                    "methodName": "nft_transfer",
                    "args": {
                        "receiver_id": user.near_account_id,
                        "token_id": data.reserved_token_id,
                        "approval_id": None,
                        "memo": None,
                    },
                    "gas": "30000000000000",
                    "deposit": "1",
                }
            }]
        }
    }
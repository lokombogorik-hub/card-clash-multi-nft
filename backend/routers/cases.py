from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database.session import get_db
from api.users import get_current_user
from database.models.user import User
from pydantic import BaseModel
import random

router = APIRouter(prefix="/api/cases", tags=["cases"])

COLLECTIONS = {
    "cardclash": {
        "contract_id": "cardclash-nft.retardo-s.near",
        "treasury": "retardo-s.near",
        "total_supply": 10000,
    },
}

RARITY_WEIGHTS = {
    "common": 55,
    "rare": 30,
    "epic": 12,
    "legendary": 3,
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
    session: AsyncSession = Depends(get_db),
):
    # Validate case_id
    if data.case_id == "starter":
        card_count = 1
        target_rarity = "mixed"
    elif data.case_id == "premium":
        card_count = 5
        target_rarity = "mixed"
    elif data.case_id == "legendary":
        card_count = 5
        target_rarity = "epic"
    elif data.case_id == "ultimate":
        card_count = 5
        target_rarity = "legendary"
    else:
        raise HTTPException(400, "Unknown case_id")

    # TODO: Validate tx_hash on-chain (check transfer to treasury)
    # For now we accept any non-empty tx_hash
    if not data.tx_hash or len(data.tx_hash) < 5:
        raise HTTPException(400, "Invalid tx_hash")

    collection = COLLECTIONS["cardclash"]
    reserved_tokens = []

    for _ in range(card_count):
        if target_rarity == "mixed":
            rarity = random.choices(
                list(RARITY_WEIGHTS.keys()),
                weights=list(RARITY_WEIGHTS.values())
            )[0]
        else:
            rarity = target_rarity

        total = collection["total_supply"]

        if rarity == "legendary":
            num = random.randint(0, int(total * 0.25))
        elif rarity == "epic":
            num = random.randint(int(total * 0.25), int(total * 0.50))
        elif rarity == "rare":
            num = random.randint(int(total * 0.50), int(total * 0.75))
        else:
            num = random.randint(int(total * 0.75), total - 1)

        token_id = f"card_{num:05d}"

        reserved_tokens.append({
            "token_id": token_id,
            "contract_id": collection["contract_id"],
            "rarity": rarity,
        })

    return {
        "cards": reserved_tokens,
        "collection": "cardclash",
        "tx_hash": data.tx_hash,
        "ready_for_claim": True,
    }


@router.post("/claim")
async def claim_nft(
    data: ClaimNFTRequest,
    user: User = Depends(get_current_user),
):
    near_account = getattr(user, "near_account_id", None)
    if not near_account:
        raise HTTPException(400, "NEAR account not linked. Connect wallet first.")

    collection = COLLECTIONS["cardclash"]

    return {
        "transaction": {
            "receiverId": collection["contract_id"],
            "actions": [{
                "type": "FunctionCall",
                "params": {
                    "methodName": "nft_transfer",
                    "args": {
                        "receiver_id": near_account,
                        "token_id": data.reserved_token_id,
                    },
                    "gas": "30000000000000",
                    "deposit": "1",
                }
            }]
        }
    }
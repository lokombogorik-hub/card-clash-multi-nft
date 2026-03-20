# backend/routers/matches.py
from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from utils.rating import calculate_rating_change, get_rank_by_rating
from database.session import get_session
from database.models.user import User
import uuid
import os

router = APIRouter(prefix="/api/matches", tags=["matches"])

# Import shared storage
from routers.matchmaking import active_matches

RECONNECT_TIMEOUT_MINUTES = 3

# ============================================================
# ESCROW CONFIGURATION
# ============================================================

ESCROW_WALLET = os.getenv("ESCROW_WALLET", "escrow.near")
ESCROW_PRIVATE_KEY = os.getenv("ESCROW_PRIVATE_KEY", "")
NFT_CONTRACT_ID = os.getenv("NFT_CONTRACT_ID", "")

# In-memory storage for deposits
match_deposits: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}


# ============================================================
# REQUEST/RESPONSE MODELS
# ============================================================

class CreateMatchRequest(BaseModel):
    player1_id: Optional[str] = None
    player2_id: Optional[str] = None
    mode: str = "pvp"
    player1_deck: Optional[List[Dict[str, Any]]] = None
    player2_deck: Optional[List[Dict[str, Any]]] = None


class RegisterDepositsRequest(BaseModel):
    token_ids: List[str]
    nft_contract_id: Optional[str] = None
    images: Optional[List[str]] = None
    near_wallet: Optional[str] = None


class ClaimRequest(BaseModel):
    pick_index: int
    token_id: Optional[str] = None
    nft_contract_id: Optional[str] = None


class PlayCardRequest(BaseModel):
    match_id: str
    card_index: int
    attribute: str


class MatchState(BaseModel):
    match_id: str
    status: str
    current_round: int
    player1_score: int
    player2_score: int
    player1_id: str
    player2_id: str
    player1_deck: List[Dict[str, Any]]
    player2_deck: List[Dict[str, Any]]
    winner: Optional[str] = None


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def get_player_id_from_token(token: str) -> Optional[str]:
    """Extract player_id from JWT token"""
    try:
        from utils.security import decode_access_token
        payload = decode_access_token(token)
        return str(payload.get("sub") or payload.get("user_id") or payload.get("telegram_id"))
    except:
        return None


def is_escrow_configured() -> bool:
    """Check if escrow system is configured"""
    return bool(ESCROW_PRIVATE_KEY) and bool(NFT_CONTRACT_ID)


async def transfer_nft_from_escrow(to_wallet: str, token_id: str, nft_contract_id: str) -> Dict:
    """Transfer NFT from escrow wallet to player using py-near"""

    if not ESCROW_PRIVATE_KEY:
        print(f"[ESCROW] Private key not configured, mock transfer")
        return {
            "success": False,
            "error": "Escrow private key not configured",
            "mock": True,
        }

    try:
        from py_near.account import Account

        # Ensure private key has correct format
        private_key = ESCROW_PRIVATE_KEY
        if not private_key.startswith("ed25519:"):
            private_key = "ed25519:" + private_key

        # Initialize account
        account = Account(ESCROW_WALLET, private_key)

        # Startup is required for py-near
        await account.startup()

        # Call nft_transfer with correct py-near 1.2.22 syntax
        # FIXED: use 'amount' instead of 'attached_deposit' or 'deposit'
        result = await account.function_call(
            nft_contract_id or NFT_CONTRACT_ID,
            "nft_transfer",
            {
                "receiver_id": to_wallet,
                "token_id": str(token_id),
            },
            gas=30_000_000_000_000,  # 30 TGas
            amount=1,  # 1 yoctoNEAR - correct parameter name for py-near 1.2.22
        )

        # Extract tx hash
        tx_hash = ""
        if result:
            if hasattr(result, "transaction") and hasattr(result.transaction, "hash"):
                tx_hash = result.transaction.hash
            elif hasattr(result, "transaction_outcome") and hasattr(result.transaction_outcome, "id"):
                tx_hash = result.transaction_outcome.id
            elif isinstance(result, dict) and "transaction" in result:
                tx_hash = result.get("transaction", {}).get("hash", "")
            else:
                tx_hash = str(result)[:32]

        print(f"[ESCROW] Transferred {token_id} to {to_wallet}, tx: {tx_hash}")

        return {
            "success": True,
            "tx_hash": tx_hash,
            "token_id": token_id,
            "to": to_wallet,
        }

    except Exception as e:
        print(f"[ESCROW] Transfer error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
        }


# ============================================================
# MATCH CREATION & MANAGEMENT
# ============================================================

@router.post("/create")
async def create_match(request: CreateMatchRequest):
    """Create a new match (for escrow flow)"""

    match_id = str(uuid.uuid4())

    match_data = {
        "match_id": match_id,
        "player1_id": str(request.player1_id) if request.player1_id else None,
        "player2_id": str(request.player2_id) if request.player2_id else None,
        "mode": request.mode,
        "status": "waiting",
        "player1_deck": request.player1_deck or [],
        "player2_deck": request.player2_deck or [],
        "player1_score": 0,
        "player2_score": 0,
        "current_round": 0,
        "created_at": datetime.utcnow().isoformat(),
        "escrow_locked": False,
        "winner": None,
        "claimed": False,
        "claimed_token_id": None,
        "refunded": False,
    }

    active_matches[match_id] = match_data
    match_deposits[match_id] = {}

    print(f"[MATCHES] Created match {match_id}, mode={request.mode}, player1={request.player1_id}")

    return {
        "match_id": match_id,
        "status": "waiting",
        "message": "Match created, waiting for escrow lock",
    }


@router.post("/{match_id}/register_deposits")
async def register_deposits(
        match_id: str,
        request: RegisterDepositsRequest,
        authorization: Optional[str] = Header(None),
):
    """Register player's NFT deposits for a match"""

    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    # Get player_id from auth
    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)

    if not player_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Validate player is in this match
    if player_id not in [match_data.get("player1_id"), match_data.get("player2_id")]:
        if not match_data.get("player2_id"):
            match_data["player2_id"] = player_id
            active_matches[match_id] = match_data
        else:
            raise HTTPException(status_code=403, detail="Not a participant in this match")

    # Store near_wallet for this player
    if request.near_wallet:
        if player_id == match_data.get("player1_id"):
            match_data["player1_near_wallet"] = request.near_wallet
        else:
            match_data["player2_near_wallet"] = request.near_wallet
        active_matches[match_id] = match_data

    # Register deposits
    nft_contract = request.nft_contract_id or NFT_CONTRACT_ID

    deposits = []
    for i, token_id in enumerate(request.token_ids):
        image = request.images[i] if request.images and i < len(request.images) else None
        deposits.append({
            "token_id": token_id,
            "nft_contract_id": nft_contract,
            "image": image,
            "player_id": player_id,
            "near_wallet": request.near_wallet,
        })

    if match_id not in match_deposits:
        match_deposits[match_id] = {}

    match_deposits[match_id][player_id] = deposits

    # Check if both players deposited
    p1_id = match_data.get("player1_id")
    p2_id = match_data.get("player2_id")

    p1_deposited = p1_id and p1_id in match_deposits.get(match_id, {})
    p2_deposited = p2_id and p2_id in match_deposits.get(match_id, {})

    if p1_deposited and p2_deposited:
        match_data["escrow_locked"] = True
        match_data["status"] = "active"
        active_matches[match_id] = match_data

    print(f"[MATCHES] Registered {len(deposits)} deposits for player {player_id} in match {match_id}")

    return {
        "success": True,
        "deposits_count": len(deposits),
        "escrow_locked": match_data.get("escrow_locked", False),
        "status": match_data.get("status"),
    }


@router.post("/{match_id}/confirm_escrow")
async def confirm_escrow(match_id: str, body: dict):
    """Confirm that NFTs are locked in escrow"""
    from routers.matchmaking import ESCROW_LOCK_TIMEOUT_SECONDS

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    # Проверяем, не истёк ли таймаут
    created_at_str = match_data.get("created_at")
    if created_at_str:
        try:
            if isinstance(created_at_str, str):
                created_at = datetime.fromisoformat(created_at_str.replace("Z", ""))
            else:
                created_at = created_at_str

            elapsed = (datetime.utcnow() - created_at).total_seconds()
            if elapsed > ESCROW_LOCK_TIMEOUT_SECONDS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Lock timeout expired. Match cancelled."
                )
        except HTTPException:
            raise
        except:
            pass

    # Проверяем статус матча
    if match_data.get("status") == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Match was cancelled"
        )

    player_id = body.get("player_id")
    tx_hash = body.get("tx_hash")
    token_ids = body.get("token_ids", [])
    near_wallet = body.get("near_wallet")

    if not player_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="player_id required"
        )

    # Mark escrow as confirmed for this player
    if player_id == match_data.get("player1_id"):
        match_data["player1_escrow_tx"] = tx_hash
        match_data["player1_escrow_confirmed"] = True
        if near_wallet:
            match_data["player1_near_wallet"] = near_wallet
    elif player_id == match_data.get("player2_id"):
        match_data["player2_escrow_tx"] = tx_hash
        match_data["player2_escrow_confirmed"] = True
        if near_wallet:
            match_data["player2_near_wallet"] = near_wallet
    else:
        if not match_data.get("player2_id"):
            match_data["player2_id"] = player_id
            match_data["player2_escrow_tx"] = tx_hash
            match_data["player2_escrow_confirmed"] = True
            if near_wallet:
                match_data["player2_near_wallet"] = near_wallet

    # Register deposits if token_ids provided
    if token_ids:
        if match_id not in match_deposits:
            match_deposits[match_id] = {}

        deposits = [{
            "token_id": tid,
            "nft_contract_id": NFT_CONTRACT_ID,
            "player_id": player_id,
            "near_wallet": near_wallet,
        } for tid in token_ids]
        match_deposits[match_id][player_id] = deposits

    # Check if both players confirmed
    p1_confirmed = match_data.get("player1_escrow_confirmed", False)
    p2_confirmed = match_data.get("player2_escrow_confirmed", False)

    if p1_confirmed and p2_confirmed:
        match_data["escrow_locked"] = True
        match_data["status"] = "active"
        match_data["game_started_at"] = datetime.utcnow().isoformat()

    active_matches[match_id] = match_data

    print(f"[MATCHES] Escrow confirmed for {player_id} in match {match_id}")

    return {
        "success": True,
        "escrow_locked": match_data.get("escrow_locked", False),
        "status": match_data.get("status"),
        "both_locked": p1_confirmed and p2_confirmed,
    }

# ============================================================
# DEPOSITS & CLAIM
# ============================================================

@router.get("/{match_id}/opponent_deposits")
async def get_opponent_deposits(
        match_id: str,
        authorization: Optional[str] = Header(None),
):
    """Get opponent's deposits for claim selection"""

    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    # Get requesting player's ID
    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)

    if not player_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Find opponent
    p1_id = match_data.get("player1_id")
    p2_id = match_data.get("player2_id")

    if player_id == p1_id:
        opponent_id = p2_id
    elif player_id == p2_id:
        opponent_id = p1_id
    else:
        raise HTTPException(status_code=403, detail="Not a participant")

    # Get opponent's deposits
    opponent_deposits = match_deposits.get(match_id, {}).get(opponent_id, [])

    # Return deposits with images for reveal
    deposits_list = []
    for i, dep in enumerate(opponent_deposits):
        deposits_list.append({
            "index": i,
            "token_id": dep.get("token_id"),
            "nft_contract_id": dep.get("nft_contract_id"),
            "image": dep.get("image"),  # Include image for reveal
        })

    return {
        "match_id": match_id,
        "opponent_id": opponent_id,
        "deposits": deposits_list,
        "count": len(deposits_list),
    }


@router.post("/{match_id}/claim")
async def claim_card(
        match_id: str,
        request: ClaimRequest,
        authorization: Optional[str] = Header(None),
):
    """Claim one card from opponent after winning"""

    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    # Check match is finished
    if match_data.get("status") != "finished":
        raise HTTPException(status_code=400, detail="Match is not finished")

    # Check not already claimed
    if match_data.get("claimed"):
        raise HTTPException(status_code=400, detail="Already claimed")

    # Get requesting player's ID
    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)

    if not player_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Verify this player is the winner
    winner_id = match_data.get("winner")
    if player_id != winner_id:
        raise HTTPException(status_code=403, detail="Only winner can claim")

    # Find loser
    p1_id = match_data.get("player1_id")
    p2_id = match_data.get("player2_id")
    loser_id = p2_id if winner_id == p1_id else p1_id

    # Get loser's deposits
    loser_deposits = match_deposits.get(match_id, {}).get(loser_id, [])

    if not loser_deposits:
        raise HTTPException(status_code=400, detail="No deposits found for loser")

    # Validate pick_index
    pick_index = request.pick_index
    if pick_index < 0 or pick_index >= len(loser_deposits):
        raise HTTPException(status_code=400, detail=f"Invalid pick_index: {pick_index}")

    # Get the picked card
    picked_card = loser_deposits[pick_index]
    token_id = picked_card.get("token_id")
    nft_contract_id = picked_card.get("nft_contract_id") or NFT_CONTRACT_ID

    # Get winner's wallet
    if winner_id == p1_id:
        winner_near_wallet = match_data.get("player1_near_wallet")
    else:
        winner_near_wallet = match_data.get("player2_near_wallet")

    # Transfer NFT if escrow is configured
    transfer_result = None
    if is_escrow_configured() and winner_near_wallet:
        transfer_result = await transfer_nft_from_escrow(
            to_wallet=winner_near_wallet,
            token_id=token_id,
            nft_contract_id=nft_contract_id,
        )

    # Mark as claimed
    match_data["claimed"] = True
    match_data["claimed_token_id"] = token_id
    match_data["claimed_at"] = datetime.utcnow().isoformat()
    active_matches[match_id] = match_data

    print(f"[MATCHES] Player {player_id} claimed token {token_id} from match {match_id}")

    # Auto-refund remaining NFTs
    await refund_remaining_nfts(match_id)

    return {
        "success": True,
        "claimed_card": {
            "token_id": token_id,
            "nft_contract_id": nft_contract_id,
            "image": picked_card.get("image"),
            "index": pick_index,
        },
        "transfer": transfer_result,
        "message": "Card claimed successfully!",
    }


async def refund_remaining_nfts(match_id: str):
    """Refund all remaining NFTs after claim"""

    match_data = active_matches.get(match_id)
    if not match_data:
        return

    if match_data.get("refunded"):
        return

    claimed_token_id = match_data.get("claimed_token_id")
    deposits = match_deposits.get(match_id, {})

    refunds = []

    for pid, player_deposits in deposits.items():
        # Get player's wallet
        if pid == match_data.get("player1_id"):
            near_wallet = match_data.get("player1_near_wallet")
        else:
            near_wallet = match_data.get("player2_near_wallet")

        if not near_wallet:
            # Try from deposit data
            for dep in player_deposits:
                if dep.get("near_wallet"):
                    near_wallet = dep["near_wallet"]
                    break

        if near_wallet and is_escrow_configured():
            for dep in player_deposits:
                token_id = dep.get("token_id")
                nft_contract = dep.get("nft_contract_id") or NFT_CONTRACT_ID

                # Skip the claimed token
                if token_id == claimed_token_id:
                    continue

                if token_id:
                    result = await transfer_nft_from_escrow(
                        to_wallet=near_wallet,
                        token_id=token_id,
                        nft_contract_id=nft_contract,
                    )
                    refunds.append({
                        "player_id": pid,
                        "token_id": token_id,
                        "result": result,
                    })

    match_data["refunded"] = True
    match_data["refunded_at"] = datetime.utcnow().isoformat()
    match_data["refund_count"] = len(refunds)
    active_matches[match_id] = match_data

    print(f"[MATCHES] Refunded {len(refunds)} NFTs for match {match_id}")


@router.get("/{match_id}/deposits")
async def get_all_deposits(match_id: str):
    """Get all deposits for a match (debug)"""

    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    deposits = match_deposits.get(match_id, {})

    return {
        "match_id": match_id,
        "deposits": deposits,
        "player1_id": match_data.get("player1_id"),
        "player2_id": match_data.get("player2_id"),
        "escrow_locked": match_data.get("escrow_locked", False),
    }


# ============================================================
# CANCEL & REFUND
# ============================================================

@router.post("/{match_id}/cancel")
async def cancel_match(match_id: str, authorization: Optional[str] = Header(None)):
    """Cancel match and refund NFTs to players"""

    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    # Get player ID
    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)

    # Mark match as cancelled
    match_data["status"] = "cancelled"
    match_data["cancelled_at"] = datetime.utcnow().isoformat()
    match_data["cancelled_by"] = player_id
    active_matches[match_id] = match_data

    # Refund all deposits
    refunds = []
    deposits = match_deposits.get(match_id, {})

    for pid, player_deposits in deposits.items():
        near_wallet = None

        # Find player's wallet
        if pid == match_data.get("player1_id"):
            near_wallet = match_data.get("player1_near_wallet")
        elif pid == match_data.get("player2_id"):
            near_wallet = match_data.get("player2_near_wallet")

        if not near_wallet:
            for dep in player_deposits:
                if dep.get("near_wallet"):
                    near_wallet = dep["near_wallet"]
                    break

        if near_wallet and is_escrow_configured():
            for dep in player_deposits:
                token_id = dep.get("token_id")
                nft_contract = dep.get("nft_contract_id") or NFT_CONTRACT_ID

                if token_id:
                    result = await transfer_nft_from_escrow(
                        to_wallet=near_wallet,
                        token_id=token_id,
                        nft_contract_id=nft_contract,
                    )
                    refunds.append({
                        "player_id": pid,
                        "token_id": token_id,
                        "result": result,
                    })

    # Clear deposits
    if match_id in match_deposits:
        del match_deposits[match_id]

    print(f"[MATCHES] Match {match_id} cancelled, refunded {len(refunds)} NFTs")

    return {
        "success": True,
        "message": "Match cancelled, NFTs refunded",
        "refunds": refunds,
    }


# ============================================================
# EXISTING ENDPOINTS
# ============================================================

@router.get("/{match_id}")
async def get_match(match_id: str):
    """Get match data"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    return match_data


@router.get("/{match_id}/state")
async def get_match_state(match_id: str):
    """Get match state"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    return MatchState(
        match_id=match_data["match_id"],
        status=match_data.get("status", "active"),
        current_round=match_data.get("current_round", 0),
        player1_score=match_data.get("player1_score", 0),
        player2_score=match_data.get("player2_score", 0),
        player1_id=match_data.get("player1_id", ""),
        player2_id=match_data.get("player2_id", ""),
        player1_deck=match_data.get("player1_deck", []),
        player2_deck=match_data.get("player2_deck", []),
        winner=match_data.get("winner")
    )


@router.post("/{match_id}/play")
async def play_card(match_id: str, request: PlayCardRequest):
    """Play a card in match"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    if match_data.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Match is not active"
        )

    return {"success": True, "message": "Move recorded"}


@router.post("/{match_id}/finish")
async def finish_match(match_id: str, body: dict):
    """Finish match, declare winner and update ratings"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    winner_user_id = body.get("winner_user_id")
    winner_near_wallet = body.get("winner_near_wallet")
    is_pvp = match_data.get("mode") == "pvp" or match_data.get("player2_id")

    match_data["status"] = "finished"
    match_data["winner"] = str(winner_user_id) if winner_user_id else None
    if winner_near_wallet:
        match_data["winner_near_wallet"] = winner_near_wallet
    match_data["finished_at"] = datetime.utcnow().isoformat()

    # Update ratings for PvP matches
    rating_update = None
    if is_pvp and winner_user_id:
        p1_id = match_data.get("player1_id")
        p2_id = match_data.get("player2_id")

        if p1_id and p2_id:
            loser_id = p2_id if str(winner_user_id) == str(p1_id) else p1_id
            rating_update = await update_player_ratings(
                winner_id=str(winner_user_id),
                loser_id=str(loser_id)
            )
            if rating_update:
                match_data["rating_update"] = rating_update

    active_matches[match_id] = match_data

    print(f"[MATCHES] Match {match_id} finished, winner: {winner_user_id}, rating_update: {rating_update}")

    return {
        "success": True,
        "winner": winner_user_id,
        "rating_update": rating_update,
    }


async def update_player_ratings(winner_id: str, loser_id: str) -> Optional[Dict]:
    """Обновить очки после PvP: +10 победителю, -10 проигравшему"""
    try:
        async for session in get_session():
            winner = await session.get(User, int(winner_id))
            loser  = await session.get(User, int(loser_id))

            if not winner or not loser:
                print(f"[RATING] Users not found: winner={winner_id}, loser={loser_id}")
                return None

            winner_rating = winner.elo_rating or 0
            loser_rating  = loser.elo_rating  or 0

            winner_change, loser_change = calculate_rating_change(winner_rating, loser_rating)

            new_winner_rating = max(0, winner_rating + winner_change)
            new_loser_rating  = max(0, loser_rating  + loser_change)

            new_winner_rank = get_rank_by_rating(new_winner_rating)
            new_loser_rank  = get_rank_by_rating(new_loser_rating)

            # Обновляем победителя
            winner.elo_rating   = new_winner_rating
            winner.rank         = new_winner_rank["name"]
            winner.pvp_wins     = (winner.pvp_wins  or 0) + 1
            winner.wins         = (winner.wins       or 0) + 1
            winner.total_matches = (winner.total_matches or 0) + 1

            # Обновляем проигравшего
            loser.elo_rating    = new_loser_rating
            loser.rank          = new_loser_rank["name"]
            loser.pvp_losses    = (loser.pvp_losses  or 0) + 1
            loser.losses        = (loser.losses       or 0) + 1
            loser.total_matches = (loser.total_matches or 0) + 1

            await session.commit()

            result = {
                "winner": {
                    "id": winner_id,
                    "old_rating": winner_rating,
                    "new_rating": new_winner_rating,
                    "change": winner_change,
                    "old_rank": get_rank_by_rating(winner_rating)["name"],
                    "new_rank": new_winner_rank["name"],
                    "rank_up": new_winner_rank["name"] != get_rank_by_rating(winner_rating)["name"],
                },
                "loser": {
                    "id": loser_id,
                    "old_rating": loser_rating,
                    "new_rating": new_loser_rating,
                    "change": loser_change,
                    "old_rank": get_rank_by_rating(loser_rating)["name"],
                    "new_rank": new_loser_rank["name"],
                    "rank_down": new_loser_rank["name"] != get_rank_by_rating(loser_rating)["name"],
                },
            }

            print(f"[RATING] winner {winner_id}: {winner_rating} → {new_winner_rating} ({new_winner_rank['name']})")
            print(f"[RATING] loser  {loser_id}: {loser_rating} → {new_loser_rating} ({new_loser_rank['name']})")

            return result

    except Exception as e:
        print(f"[RATING] Error: {e}")
        import traceback
        traceback.print_exc()
        return None


@router.post("/{match_id}/claim_tx")
async def record_claim_tx(match_id: str, body: dict):
    """Record claim transaction"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    tx_hash = body.get("tx_hash")
    match_data["claim_tx_hash"] = tx_hash

    active_matches[match_id] = match_data

    return {"success": True, "tx_hash": tx_hash}


@router.post("/{match_id}/reconnect")
async def reconnect_to_match(match_id: str):
    """Reconnect to match"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    return {"success": True, "message": "Reconnected successfully"}


# ============================================================
# CONFIG STATUS
# ============================================================

@router.get("/config/status")
async def get_escrow_status():
    """Get escrow configuration status"""
    return {
        "escrow_wallet": ESCROW_WALLET,
        "escrow_configured": is_escrow_configured(),
        "nft_contract": NFT_CONTRACT_ID or "NOT SET",
    }
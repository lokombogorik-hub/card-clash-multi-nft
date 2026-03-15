# backend/routers/matches.py
from fastapi import APIRouter, HTTPException, status, Depends, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
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
    """Transfer NFT from escrow wallet to winner using py-near"""

    if not ESCROW_PRIVATE_KEY:
        print(f"[ESCROW] Private key not configured, mock transfer")
        return {
            "success": False,
            "error": "Escrow private key not configured",
            "mock": True,
        }

    try:
        from py_near.account import Account

        # Initialize account with private key
        account = Account(ESCROW_WALLET, ESCROW_PRIVATE_KEY)

        # Call nft_transfer
        result = await account.function_call(
            nft_contract_id or NFT_CONTRACT_ID,
            "nft_transfer",
            {
                "receiver_id": to_wallet,
                "token_id": token_id,
            },
            gas=30_000_000_000_000,  # 30 TGas
            deposit=1,  # 1 yoctoNEAR required
        )

        # Extract tx hash
        tx_hash = ""
        if hasattr(result, "transaction") and hasattr(result.transaction, "hash"):
            tx_hash = result.transaction.hash
        elif hasattr(result, "transaction_outcome") and hasattr(result.transaction_outcome, "id"):
            tx_hash = result.transaction_outcome.id

        print(f"[ESCROW] Transferred {token_id} to {to_wallet}, tx: {tx_hash}")

        return {
            "success": True,
            "tx_hash": tx_hash,
            "token_id": token_id,
            "to": to_wallet,
        }

    except Exception as e:
        print(f"[ESCROW] Transfer error: {e}")
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

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    player_id = body.get("player_id")
    tx_hash = body.get("tx_hash")
    token_ids = body.get("token_ids", [])

    if not player_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="player_id required"
        )

    # Mark escrow as confirmed for this player
    if player_id == match_data.get("player1_id"):
        match_data["player1_escrow_tx"] = tx_hash
        match_data["player1_escrow_confirmed"] = True
    elif player_id == match_data.get("player2_id"):
        match_data["player2_escrow_tx"] = tx_hash
        match_data["player2_escrow_confirmed"] = True
    else:
        if not match_data.get("player2_id"):
            match_data["player2_id"] = player_id
            match_data["player2_escrow_tx"] = tx_hash
            match_data["player2_escrow_confirmed"] = True

    # Register deposits if token_ids provided
    if token_ids:
        if match_id not in match_deposits:
            match_deposits[match_id] = {}

        deposits = [{"token_id": tid, "nft_contract_id": NFT_CONTRACT_ID, "player_id": player_id} for tid in token_ids]
        match_deposits[match_id][player_id] = deposits

    # Check if both players confirmed
    p1_confirmed = match_data.get("player1_escrow_confirmed", False)
    p2_confirmed = match_data.get("player2_escrow_confirmed", False)

    if p1_confirmed and p2_confirmed:
        match_data["escrow_locked"] = True
        match_data["status"] = "active"

    active_matches[match_id] = match_data

    print(f"[MATCHES] Escrow confirmed for {player_id} in match {match_id}")

    return {
        "success": True,
        "escrow_locked": match_data.get("escrow_locked", False),
        "status": match_data.get("status"),
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

    # Return deposits (hidden - no images until after pick)
    hidden_deposits = []
    for i, dep in enumerate(opponent_deposits):
        hidden_deposits.append({
            "index": i,
            "token_id": dep.get("token_id"),
            "nft_contract_id": dep.get("nft_contract_id"),
        })

    return {
        "match_id": match_id,
        "opponent_id": opponent_id,
        "deposits": hidden_deposits,
        "count": len(hidden_deposits),
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

    # Transfer NFT if escrow is configured
    transfer_result = None
    winner_near_wallet = match_data.get("winner_near_wallet")

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
    """Finish match and declare winner"""

    match_data = active_matches.get(match_id)

    if not match_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Match not found"
        )

    winner_user_id = body.get("winner_user_id")
    winner_near_wallet = body.get("winner_near_wallet")

    match_data["status"] = "finished"
    match_data["winner"] = str(winner_user_id) if winner_user_id else None
    match_data["winner_near_wallet"] = winner_near_wallet
    match_data["finished_at"] = datetime.utcnow().isoformat()

    active_matches[match_id] = match_data

    print(f"[MATCHES] Match {match_id} finished, winner: {winner_user_id}")

    return {"success": True, "winner": winner_user_id}


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
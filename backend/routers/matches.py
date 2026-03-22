from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from utils.rating import calculate_rating_change, get_rank_by_rating
from database.session import get_session
from database.models.user import User
import uuid
import os
import httpx
import json
import base64

router = APIRouter(prefix="/api/matches", tags=["matches"])

from routers.matchmaking import active_matches

RECONNECT_TIMEOUT_MINUTES = 3

ESCROW_WALLET = os.getenv("ESCROW_WALLET", "escrow.near")
ESCROW_PRIVATE_KEY = os.getenv("ESCROW_PRIVATE_KEY", "")
NFT_CONTRACT_ID = os.getenv("NFT_CONTRACT_ID", "")

match_deposits: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}


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


def get_player_id_from_token(token: str) -> Optional[str]:
    try:
        from utils.security import decode_access_token
        payload = decode_access_token(token)
        return str(payload.get("sub") or payload.get("user_id") or payload.get("telegram_id"))
    except:
        return None


def is_escrow_configured() -> bool:
    return bool(ESCROW_PRIVATE_KEY) and bool(NFT_CONTRACT_ID)


async def fetch_nft_image(token_id: str, nft_contract: str) -> str:
    if not nft_contract or not token_id:
        return ""
    try:
        args = json.dumps({"token_id": token_id})
        args_b64 = base64.b64encode(args.encode()).decode()

        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                "https://rpc.mainnet.near.org",
                json={
                    "jsonrpc": "2.0", "id": "1", "method": "query",
                    "params": {
                        "request_type": "call_function",
                        "finality": "final",
                        "account_id": nft_contract,
                        "method_name": "nft_token",
                        "args_base64": args_b64,
                    }
                }
            )
            data = resp.json()
            if "result" in data and "result" in data["result"]:
                token = json.loads(bytes(data["result"]["result"]).decode())
                media = (token.get("metadata") or {}).get("media", "")
                if media:
                    if media.startswith("ipfs://"):
                        return "https://ipfs.near.social/ipfs/" + media[7:]
                    if media.startswith("http"):
                        return media
                    return "https://ipfs.near.social/ipfs/" + media
    except Exception as e:
        print(f"[MATCHES] fetch_nft_image error for {token_id}: {e}")
    return ""


async def transfer_nft_from_escrow(to_wallet: str, token_id: str, nft_contract_id: str) -> Dict:
    if not ESCROW_PRIVATE_KEY:
        print(f"[ESCROW] Private key not configured, mock transfer")
        return {"success": False, "error": "Escrow private key not configured", "mock": True}

    try:
        from py_near.account import Account

        private_key = ESCROW_PRIVATE_KEY
        if not private_key.startswith("ed25519:"):
            private_key = "ed25519:" + private_key

        account = Account(ESCROW_WALLET, private_key)
        await account.startup()

        result = await account.function_call(
            nft_contract_id or NFT_CONTRACT_ID,
            "nft_transfer",
            {"receiver_id": to_wallet, "token_id": str(token_id)},
            gas=30_000_000_000_000,
            amount=1,
        )

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
        return {"success": True, "tx_hash": tx_hash, "token_id": token_id, "to": to_wallet}

    except Exception as e:
        print(f"[ESCROW] Transfer error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


# =============================================================
# СТАТИЧЕСКИЕ РОУТЫ — ОБЯЗАТЕЛЬНО ПЕРЕД /{match_id}
# =============================================================

@router.get("/leaderboard")
async def get_leaderboard(limit: int = 10):
    try:
        async for session in get_session():
            from sqlalchemy import select, desc

            stmt = select(User).order_by(desc(User.elo_rating)).limit(limit)
            result = await session.execute(stmt)
            users = result.scalars().all()

            leaders = []
            for i, u in enumerate(users):
                leaders.append({
                    "rank": i + 1,
                    "user_id": u.id,
                    "username": u.username or u.first_name or f"Player #{u.id}",
                    "first_name": u.first_name or "",
                    "photo_url": getattr(u, "photo_url", None) or "",
                    "rating": u.elo_rating or 0,
                    "wins": u.wins or 0,
                    "losses": u.losses or 0,
                    "rank_name": u.rank or "Rookie",
                })

            return {"leaders": leaders, "total": len(leaders)}

    except Exception as e:
        print(f"[LEADERBOARD] Error: {e}")
        import traceback
        traceback.print_exc()
        return {"leaders": [], "total": 0}


@router.get("/config/status")
async def get_escrow_status():
    return {
        "escrow_wallet": ESCROW_WALLET,
        "escrow_configured": is_escrow_configured(),
        "nft_contract": NFT_CONTRACT_ID or "NOT SET",
    }


# =============================================================
# POST РОУТЫ
# =============================================================

@router.post("/create")
async def create_match(request: CreateMatchRequest):
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

    return {"match_id": match_id, "status": "waiting", "message": "Match created"}


# =============================================================
# ДИНАМИЧЕСКИЕ РОУТЫ /{match_id} — ПОСЛЕ СТАТИЧЕСКИХ
# =============================================================

@router.post("/{match_id}/register_deposits")
async def register_deposits(
        match_id: str,
        request: RegisterDepositsRequest,
        authorization: Optional[str] = Header(None),
):
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)

    if not player_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    if player_id not in [match_data.get("player1_id"), match_data.get("player2_id")]:
        if not match_data.get("player2_id"):
            match_data["player2_id"] = player_id
            active_matches[match_id] = match_data
        else:
            raise HTTPException(status_code=403, detail="Not a participant")

    if request.near_wallet:
        if player_id == match_data.get("player1_id"):
            match_data["player1_near_wallet"] = request.near_wallet
        else:
            match_data["player2_near_wallet"] = request.near_wallet
        active_matches[match_id] = match_data

    nft_contract = request.nft_contract_id or NFT_CONTRACT_ID

    deposits = []
    for i, token_id in enumerate(request.token_ids):
        image = request.images[i] if request.images and i < len(request.images) else None

        if not image and nft_contract:
            image = await fetch_nft_image(token_id, nft_contract)
            if image:
                print(f"[MATCHES] Fetched image for {token_id}: {image[:60]}...")

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
    from routers.matchmaking import ESCROW_LOCK_TIMEOUT_SECONDS

    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    created_at_str = match_data.get("created_at")
    if created_at_str:
        try:
            if isinstance(created_at_str, str):
                created_at = datetime.fromisoformat(created_at_str.replace("Z", ""))
            else:
                created_at = created_at_str
            elapsed = (datetime.utcnow() - created_at).total_seconds()
            if elapsed > ESCROW_LOCK_TIMEOUT_SECONDS:
                raise HTTPException(status_code=400, detail="Lock timeout expired.")
        except HTTPException:
            raise
        except:
            pass

    if match_data.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Match was cancelled")

    player_id = body.get("player_id")
    tx_hash = body.get("tx_hash")
    token_ids = body.get("token_ids", [])
    near_wallet = body.get("near_wallet")

    if not player_id:
        raise HTTPException(status_code=400, detail="player_id required")

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

    if token_ids:
        if match_id not in match_deposits:
            match_deposits[match_id] = {}

        contract = NFT_CONTRACT_ID or ""
        deposits = []
        for tid in token_ids:
            image = await fetch_nft_image(tid, contract)
            if image:
                print(f"[MATCHES] confirm_escrow image for {tid}: {image[:60]}...")
            deposits.append({
                "token_id": tid,
                "nft_contract_id": contract,
                "player_id": player_id,
                "near_wallet": near_wallet,
                "image": image,
            })
        match_deposits[match_id][player_id] = deposits

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


@router.get("/{match_id}/opponent_deposits")
async def get_opponent_deposits(
        match_id: str,
        authorization: Optional[str] = Header(None),
):
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)

    if not player_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    p1_id = match_data.get("player1_id")
    p2_id = match_data.get("player2_id")

    if player_id == p1_id:
        opponent_id = p2_id
    elif player_id == p2_id:
        opponent_id = p1_id
    else:
        raise HTTPException(status_code=403, detail="Not a participant")

    opponent_deposits = match_deposits.get(match_id, {}).get(opponent_id, [])

    deposits_list = []
    for i, dep in enumerate(opponent_deposits):
        deposits_list.append({
            "index": i,
            "token_id": dep.get("token_id"),
            "nft_contract_id": dep.get("nft_contract_id"),
            "image": dep.get("image"),
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
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    if match_data.get("status") != "finished":
        raise HTTPException(status_code=400, detail="Match is not finished")

    if match_data.get("claimed"):
        raise HTTPException(status_code=400, detail="Already claimed")

    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)

    if not player_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    winner_id = match_data.get("winner")
    if player_id != winner_id:
        raise HTTPException(status_code=403, detail="Only winner can claim")

    p1_id = match_data.get("player1_id")
    p2_id = match_data.get("player2_id")
    loser_id = p2_id if winner_id == p1_id else p1_id

    loser_deposits = match_deposits.get(match_id, {}).get(loser_id, [])
    if not loser_deposits:
        raise HTTPException(status_code=400, detail="No deposits found for loser")

    pick_index = request.pick_index
    if pick_index < 0 or pick_index >= len(loser_deposits):
        raise HTTPException(status_code=400, detail=f"Invalid pick_index: {pick_index}")

    picked_card = loser_deposits[pick_index]
    token_id = picked_card.get("token_id")
    nft_contract_id = picked_card.get("nft_contract_id") or NFT_CONTRACT_ID

    image = picked_card.get("image")
    if not image and nft_contract_id and token_id:
        image = await fetch_nft_image(token_id, nft_contract_id)

    if winner_id == p1_id:
        winner_near_wallet = match_data.get("player1_near_wallet")
    else:
        winner_near_wallet = match_data.get("player2_near_wallet")

    transfer_result = None
    if is_escrow_configured() and winner_near_wallet:
        transfer_result = await transfer_nft_from_escrow(
            to_wallet=winner_near_wallet,
            token_id=token_id,
            nft_contract_id=nft_contract_id,
        )

    match_data["claimed"] = True
    match_data["claimed_token_id"] = token_id
    match_data["claimed_at"] = datetime.utcnow().isoformat()
    active_matches[match_id] = match_data

    print(f"[MATCHES] Player {player_id} claimed token {token_id}, image={image}")

    await refund_remaining_nfts(match_id)

    return {
        "success": True,
        "claimed_card": {
            "token_id": token_id,
            "nft_contract_id": nft_contract_id,
            "image": image,
            "imageUrl": image,
            "index": pick_index,
        },
        "transfer": transfer_result,
        "message": "Card claimed successfully!",
    }


async def refund_remaining_nfts(match_id: str):
    match_data = active_matches.get(match_id)
    if not match_data or match_data.get("refunded"):
        return

    claimed_token_id = match_data.get("claimed_token_id")
    deposits = match_deposits.get(match_id, {})
    refunds = []

    for pid, player_deposits in deposits.items():
        if pid == match_data.get("player1_id"):
            near_wallet = match_data.get("player1_near_wallet")
        else:
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
                if token_id == claimed_token_id:
                    continue
                if token_id:
                    result = await transfer_nft_from_escrow(
                        to_wallet=near_wallet,
                        token_id=token_id,
                        nft_contract_id=nft_contract,
                    )
                    refunds.append({"player_id": pid, "token_id": token_id, "result": result})

    match_data["refunded"] = True
    match_data["refunded_at"] = datetime.utcnow().isoformat()
    match_data["refund_count"] = len(refunds)
    active_matches[match_id] = match_data
    print(f"[MATCHES] Refunded {len(refunds)} NFTs for match {match_id}")


@router.get("/{match_id}/deposits")
async def get_all_deposits(match_id: str):
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")
    return {
        "match_id": match_id,
        "deposits": match_deposits.get(match_id, {}),
        "player1_id": match_data.get("player1_id"),
        "player2_id": match_data.get("player2_id"),
        "escrow_locked": match_data.get("escrow_locked", False),
    }


@router.post("/{match_id}/cancel")
async def cancel_match(match_id: str, authorization: Optional[str] = Header(None)):
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=404, detail="Match not found")

    player_id = None
    if authorization:
        token = authorization.replace("Bearer ", "")
        player_id = get_player_id_from_token(token)

    match_data["status"] = "cancelled"
    match_data["cancelled_at"] = datetime.utcnow().isoformat()
    match_data["cancelled_by"] = player_id
    active_matches[match_id] = match_data

    refunds = []
    deposits = match_deposits.get(match_id, {})

    for pid, player_deposits in deposits.items():
        near_wallet = None
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
                    refunds.append({"player_id": pid, "token_id": token_id, "result": result})

    if match_id in match_deposits:
        del match_deposits[match_id]

    print(f"[MATCHES] Match {match_id} cancelled, refunded {len(refunds)} NFTs")
    return {"success": True, "message": "Match cancelled, NFTs refunded", "refunds": refunds}


@router.get("/{match_id}")
async def get_match(match_id: str):
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    return match_data


@router.get("/{match_id}/state")
async def get_match_state(match_id: str):
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
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
        winner=match_data.get("winner"),
    )


@router.post("/{match_id}/play")
async def play_card(match_id: str, request: PlayCardRequest):
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    if match_data.get("status") != "active":
        raise HTTPException(status_code=400, detail="Match is not active")
    return {"success": True, "message": "Move recorded"}


@router.post("/{match_id}/finish")
async def finish_match(match_id: str, body: dict):
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")

    winner_user_id = body.get("winner_user_id")
    winner_near_wallet = body.get("winner_near_wallet")
    is_pvp = match_data.get("mode") == "pvp" or match_data.get("player2_id")

    match_data["status"] = "finished"
    match_data["winner"] = str(winner_user_id) if winner_user_id else None
    if winner_near_wallet:
        match_data["winner_near_wallet"] = winner_near_wallet
    match_data["finished_at"] = datetime.utcnow().isoformat()

    rating_update = None
    if is_pvp and winner_user_id:
        p1_id = match_data.get("player1_id")
        p2_id = match_data.get("player2_id")
        if p1_id and p2_id:
            loser_id = p2_id if str(winner_user_id) == str(p1_id) else p1_id
            rating_update = await update_player_ratings(
                winner_id=str(winner_user_id),
                loser_id=str(loser_id),
            )
            if rating_update:
                match_data["rating_update"] = rating_update

    active_matches[match_id] = match_data
    print(f"[MATCHES] Match {match_id} finished, winner: {winner_user_id}")

    return {"success": True, "winner": winner_user_id, "rating_update": rating_update}


async def update_player_ratings(winner_id: str, loser_id: str) -> Optional[Dict]:
    try:
        async for session in get_session():
            winner = await session.get(User, int(winner_id))
            loser = await session.get(User, int(loser_id))

            if not winner or not loser:
                print(f"[RATING] Users not found: winner={winner_id}, loser={loser_id}")
                return None

            winner_rating = winner.elo_rating or 0
            loser_rating = loser.elo_rating or 0

            winner_change, loser_change = calculate_rating_change(winner_rating, loser_rating)

            new_winner_rating = max(0, winner_rating + winner_change)
            new_loser_rating = max(0, loser_rating + loser_change)

            new_winner_rank = get_rank_by_rating(new_winner_rating)
            new_loser_rank = get_rank_by_rating(new_loser_rating)

            winner.elo_rating = new_winner_rating
            winner.rank = new_winner_rank["name"]
            winner.pvp_wins = (winner.pvp_wins or 0) + 1
            winner.wins = (winner.wins or 0) + 1
            winner.total_matches = (winner.total_matches or 0) + 1

            loser.elo_rating = new_loser_rating
            loser.rank = new_loser_rank["name"]
            loser.pvp_losses = (loser.pvp_losses or 0) + 1
            loser.losses = (loser.losses or 0) + 1
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

            print(f"[RATING] winner {winner_id}: {winner_rating}→{new_winner_rating} ({new_winner_rank['name']})")
            print(f"[RATING] loser  {loser_id}: {loser_rating}→{new_loser_rating} ({new_loser_rank['name']})")

            return result

    except Exception as e:
        print(f"[RATING] Error: {e}")
        import traceback
        traceback.print_exc()
        return None


@router.post("/{match_id}/claim_tx")
async def record_claim_tx(match_id: str, body: dict):
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    match_data["claim_tx_hash"] = body.get("tx_hash")
    active_matches[match_id] = match_data
    return {"success": True, "tx_hash": body.get("tx_hash")}


@router.post("/{match_id}/reconnect")
async def reconnect_to_match(match_id: str):
    match_data = active_matches.get(match_id)
    if not match_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    return {"success": True, "message": "Reconnected successfully"}
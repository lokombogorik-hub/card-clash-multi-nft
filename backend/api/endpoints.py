from fastapi import APIRouter, Depends, HTTPException
from typing import List

router = APIRouter(prefix="/api/v1")


@router.post("/decks/create")
async def create_deck(
        deck_data: DeckCreateRequest,
        user: User = Depends(get_current_user)
):
    """Создание новой колоды"""
    deck_builder = DeckBuilder(user.id)

    # Проверяем, что пользователь владеет этими картами
    user_nfts = await deck_builder.get_user_collection(user.wallets)
    user_card_ids = {card['id'] for card in user_nfts}

    for card_id in deck_data.card_ids:
        if card_id not in user_card_ids:
            raise HTTPException(400, f"Card {card_id} not owned by user")

    # Создаем колоду
    deck = await deck_builder.save_user_deck(
        name=deck_data.name,
        card_ids=deck_data.card_ids,
        rules_compatibility=deck_data.rules
    )

    return {"deck_id": deck.id, "status": "created"}


@router.get("/decks/my")
async def get_my_decks(user: User = Depends(get_current_user)):
    """Получить все колоды пользователя"""
    decks = await UserDeck.filter(user_id=user.id)

    # Загружаем информацию о картах для каждой колоды
    enriched_decks = []
    for deck in decks:
        cards_info = await load_cards_info(deck.card_ids)
        enriched_decks.append({
            **deck.dict(),
            'cards': cards_info,
            'chain_distribution': get_chain_distribution(cards_info)
        })

    return enriched_decks


@router.post("/game/start")
async def start_game(
        game_request: GameStartRequest,
        user: User = Depends(get_current_user)
):
    """Начать игру с выбранной колодой"""
    # Проверяем, что колода принадлежит пользователю
    deck = await UserDeck.get_or_none(id=game_request.deck_id, user_id=user.id)
    if not deck:
        raise HTTPException(404, "Deck not found")

    # Создаем игровую сессию
    game = GameSession(
        player1_id=user.id,
        deck_id=deck.id,
        game_type=game_request.game_type,
        rules=game_request.rules
    )

    await game.save()

    # Возвращаем данные для WebApp
    return {
        "game_id": game.id,
        "webapp_url": f"https://game.cardclash.com/play?game_id={game.id}",
        "deck": deck.cards
    }
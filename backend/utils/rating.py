# backend/utils/rating.py

from typing import Tuple, Dict, Any, List

# Ранги и их границы
RANKS: List[Dict[str, Any]] = [
    {"name": "Новичок", "min": 0, "max": 1199, "icon": "🌱"},
    {"name": "Мастер", "min": 1200, "max": 1499, "icon": "⚔️"},
    {"name": "Профи", "min": 1500, "max": 1799, "icon": "🏆"},
    {"name": "Легенда", "min": 1800, "max": 99999, "icon": "👑"},
]

MAX_RATING_DIFF = 300


def get_rank_by_rating(rating: int) -> Dict[str, Any]:
    """Получить ранг по рейтингу"""
    for rank in RANKS:
        if rank["min"] <= rating <= rank["max"]:
            return rank
    return RANKS[0]


def calculate_rating_change(winner_rating: int, loser_rating: int, is_draw: bool = False) -> Tuple[int, int]:
    """
    ELO-подобная система
    Возвращает (winner_change, loser_change)
    """
    expected_winner = 1 / (1 + 10 ** ((loser_rating - winner_rating) / 400))
    k_factor = 32

    if is_draw:
        winner_change = round(k_factor * (0.5 - expected_winner))
        loser_change = round(k_factor * (0.5 - (1 - expected_winner)))
        return winner_change, loser_change

    winner_change = round(k_factor * (1 - expected_winner))
    loser_change = round(k_factor * (0 - (1 - expected_winner)))

    winner_change = max(5, min(50, winner_change))
    loser_change = max(-40, min(-5, loser_change))

    return winner_change, loser_change


def get_progress_to_next_rank(rating: int) -> Dict[str, Any]:
    """Прогресс до следующего ранга"""
    current_rank = get_rank_by_rating(rating)
    current_index = next((i for i, r in enumerate(RANKS) if r["name"] == current_rank["name"]), 0)

    if current_index >= len(RANKS) - 1:
        return {
            "current_rank": current_rank,
            "next_rank": None,
            "progress_percent": 100,
            "points_to_next": 0,
        }

    next_rank = RANKS[current_index + 1]
    range_size = current_rank["max"] - current_rank["min"]
    progress_in_rank = rating - current_rank["min"]
    progress_percent = round((progress_in_rank / range_size) * 100) if range_size > 0 else 0
    points_to_next = next_rank["min"] - rating

    return {
        "current_rank": current_rank,
        "next_rank": next_rank,
        "progress_percent": min(100, max(0, progress_percent)),
        "points_to_next": max(0, points_to_next),
    }
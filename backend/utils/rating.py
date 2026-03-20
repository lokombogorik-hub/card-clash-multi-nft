# backend/utils/rating.py

from typing import Tuple, Dict, Any, List

# Ранги — границы в очках (не ELO, а простые очки)
RANKS: List[Dict[str, Any]] = [
    {"name": "Новичок", "min": 0,   "max": 299,  "icon": "🌱"},
    {"name": "Мастер",  "min": 300, "max": 699,  "icon": "⚔️"},
    {"name": "Профи",   "min": 700, "max": 1199, "icon": "🏆"},
    {"name": "Легенда", "min": 1200,"max": 99999, "icon": "👑"},
]

POINTS_PER_WIN  =  10
POINTS_PER_LOSS = -10
MIN_POINTS      =   0  # Ниже 0 не падает


def get_rank_by_rating(rating: int) -> Dict[str, Any]:
    """Получить ранг по очкам"""
    for rank in RANKS:
        if rank["min"] <= rating <= rank["max"]:
            return rank
    return RANKS[0]


def calculate_rating_change(winner_rating: int, loser_rating: int, is_draw: bool = False) -> Tuple[int, int]:
    """
    Простая система: +10 победителю, -10 проигравшему
    Возвращает (winner_change, loser_change)
    """
    if is_draw:
        return 0, 0
    return POINTS_PER_WIN, POINTS_PER_LOSS


def get_progress_to_next_rank(rating: int) -> Dict[str, Any]:
    """Прогресс внутри текущего ранга"""
    current_rank = get_rank_by_rating(rating)
    current_index = next(
        (i for i, r in enumerate(RANKS) if r["name"] == current_rank["name"]), 0
    )

    # Легенда — максимальный ранг
    if current_index >= len(RANKS) - 1:
        return {
            "current_rank": current_rank,
            "next_rank": None,
            "progress_percent": 100,
            "points_to_next": 0,
            "points_in_rank": rating - current_rank["min"],
            "rank_total": 0,
        }

    next_rank = RANKS[current_index + 1]
    rank_total = current_rank["max"] - current_rank["min"] + 1
    points_in_rank = rating - current_rank["min"]
    progress_percent = round((points_in_rank / rank_total) * 100)
    points_to_next = next_rank["min"] - rating

    return {
        "current_rank": current_rank,
        "next_rank": next_rank,
        "progress_percent": min(100, max(0, progress_percent)),
        "points_to_next": max(0, points_to_next),
        "points_in_rank": points_in_rank,
        "rank_total": rank_total,
    }


def can_match_together(rating1: int, rating2: int, max_diff: int = 300) -> bool:
    return abs(rating1 - rating2) <= max_diff
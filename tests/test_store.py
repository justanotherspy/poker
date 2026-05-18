"""Unit tests for the multi-game Redis persistence store."""

from unittest.mock import patch

import fakeredis

import poker.store as store_module
from poker.store import (
    delete_game,
    get_game,
    list_games,
    lock,
    save_game,
)


def _game_dict(game_id: str = "test-game-id", created_at: float = 1.0) -> dict:  # type: ignore[type-arg]
    return {
        "game_id": game_id,
        "seat_count": 2,
        "starting_stack": 1000,
        "action_log": [{"type": "deal_hole", "card": "Ah"}],
        "bluffs": {},
        "chat_log": [],
        "created_at": created_at,
        "hand_number": 1,
        "sb_idx": 0,
        "current_hand_stacks": [1000, 1000],
        "archived_history": [],
        "seat_tokens": {"1": "tok-1", "2": "tok-2"},
        "seats_open": [1, 2],
        "game_ended": False,
    }


# ---------------------------------------------------------------------------
# save / get round-trip
# ---------------------------------------------------------------------------


def test_save_and_get_roundtrip() -> None:
    d = _game_dict()
    save_game(d)
    result = get_game("test-game-id")
    assert result is not None
    assert result["game_id"] == d["game_id"]
    assert result["seat_count"] == 2
    assert result["action_log"] == d["action_log"]


def test_get_returns_none_for_unknown() -> None:
    assert get_game("does-not-exist") is None


def test_save_overwrites_same_id() -> None:
    save_game(_game_dict("g1"))
    d2 = _game_dict("g1")
    d2["hand_number"] = 5
    save_game(d2)
    result = get_game("g1")
    assert result is not None
    assert result["hand_number"] == 5


def test_save_keeps_games_isolated() -> None:
    save_game(_game_dict("g1", created_at=1.0))
    save_game(_game_dict("g2", created_at=2.0))
    assert get_game("g1") is not None
    assert get_game("g2") is not None


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------


def test_delete_removes_game() -> None:
    save_game(_game_dict("g1"))
    assert delete_game("g1") is True
    assert get_game("g1") is None


def test_delete_unknown_is_falsey() -> None:
    assert delete_game("nope") is False


def test_delete_only_affects_target() -> None:
    save_game(_game_dict("g1"))
    save_game(_game_dict("g2"))
    delete_game("g1")
    assert get_game("g1") is None
    assert get_game("g2") is not None


# ---------------------------------------------------------------------------
# list_games — ordering and contents
# ---------------------------------------------------------------------------


def test_list_games_empty() -> None:
    assert list_games() == []


def test_list_games_returns_all() -> None:
    save_game(_game_dict("g1", created_at=1.0))
    save_game(_game_dict("g2", created_at=2.0))
    games = list_games()
    ids = {g["game_id"] for g in games}
    assert ids == {"g1", "g2"}


def test_list_games_sorted_by_created_at() -> None:
    save_game(_game_dict("late", created_at=10.0))
    save_game(_game_dict("early", created_at=1.0))
    save_game(_game_dict("middle", created_at=5.0))
    games = list_games()
    assert [g["game_id"] for g in games] == ["early", "middle", "late"]


# ---------------------------------------------------------------------------
# graceful in-memory fallback when Redis is unavailable
# ---------------------------------------------------------------------------


def test_save_no_redis_uses_memory() -> None:
    with patch.object(store_module, "_client", return_value=None):
        store_module._memory["games"] = {}
        save_game(_game_dict("memid"))
        assert get_game("memid") is not None


def test_list_games_no_redis() -> None:
    with patch.object(store_module, "_client", return_value=None):
        store_module._memory["games"] = {}
        save_game(_game_dict("g1", created_at=1.0))
        save_game(_game_dict("g2", created_at=2.0))
        ids = [g["game_id"] for g in list_games()]
        assert ids == ["g1", "g2"]


def test_delete_no_redis_clears_memory() -> None:
    with patch.object(store_module, "_client", return_value=None):
        store_module._memory["games"] = {}
        save_game(_game_dict("g1"))
        assert delete_game("g1") is True
        assert get_game("g1") is None


# ---------------------------------------------------------------------------
# per-game lock — basic smoke
# ---------------------------------------------------------------------------


def test_lock_allows_sequential_entry() -> None:
    results = []
    with lock("g1"):
        results.append("inside")
    assert results == ["inside"]


def test_two_game_locks_independent() -> None:
    with lock("g1"):
        with lock("g2"):
            pass


def test_lock_no_redis() -> None:
    with patch.object(store_module, "_client", return_value=None):
        store_module._memory["games"] = {}
        with lock("g1"):
            pass


# ---------------------------------------------------------------------------
# TTL is set on saved keys
# ---------------------------------------------------------------------------


def test_save_sets_ttl(fake_redis: fakeredis.FakeRedis) -> None:  # type: ignore[type-arg]
    save_game(_game_dict("ttlg"))
    ttl = fake_redis.ttl("game:ttlg:state")
    assert ttl > 0

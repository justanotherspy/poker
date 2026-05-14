"""Unit tests for the Redis persistence store."""

from unittest.mock import patch

import fakeredis
import pytest

import poker.store as store_module
from poker.store import clear, load, save


@pytest.fixture(autouse=True)
def fake_redis() -> fakeredis.FakeRedis:  # type: ignore[type-arg]
    r: fakeredis.FakeRedis = fakeredis.FakeRedis(decode_responses=True)  # type: ignore[type-arg]
    # Also reset the in-memory fallback between tests.
    store_module._memory.clear()
    with patch.object(store_module, "_client", return_value=r):
        yield r


def _game_dict(game_id: str = "test-game-id") -> dict:  # type: ignore[type-arg]
    return {
        "game_id": game_id,
        "seat_count": 2,
        "starting_stack": 1000,
        "action_log": [{"type": "deal_hole", "card": "Ah"}],
        "bluffs": {},
    }


# ---------------------------------------------------------------------------
# save / load round-trip
# ---------------------------------------------------------------------------


def test_save_and_load_roundtrip() -> None:
    d = _game_dict()
    save(d)
    result = load()
    assert result is not None
    assert result["game_id"] == d["game_id"]
    assert result["seat_count"] == 2
    assert result["action_log"] == d["action_log"]


def test_load_returns_none_when_empty() -> None:
    assert load() is None


def test_load_returns_none_after_clear() -> None:
    save(_game_dict())
    clear()
    assert load() is None


def test_save_overwrites_previous() -> None:
    save(_game_dict("first"))
    save(_game_dict("second"))
    result = load()
    assert result is not None
    assert result["game_id"] == "second"


# ---------------------------------------------------------------------------
# clear
# ---------------------------------------------------------------------------


def test_clear_removes_state_key() -> None:
    d = _game_dict()
    save(d)
    clear()
    assert load() is None


def test_clear_on_empty_is_safe() -> None:
    clear()  # no error when nothing saved


# ---------------------------------------------------------------------------
# graceful in-memory fallback when Redis is unavailable
# ---------------------------------------------------------------------------


def test_save_no_redis_uses_memory() -> None:
    with patch.object(store_module, "_client", return_value=None):
        store_module._memory.clear()
        save(_game_dict())
        assert load() is not None


def test_load_no_redis_returns_memory() -> None:
    with patch.object(store_module, "_client", return_value=None):
        store_module._memory.clear()
        assert load() is None
        save(_game_dict("mem-id"))
        result = load()
        assert result is not None
        assert result["game_id"] == "mem-id"


def test_clear_no_redis_clears_memory() -> None:
    with patch.object(store_module, "_client", return_value=None):
        store_module._memory.clear()
        save(_game_dict())
        clear()
        assert load() is None


# ---------------------------------------------------------------------------
# lock — basic smoke test (no actual concurrency)
# ---------------------------------------------------------------------------


def test_lock_allows_sequential_entry() -> None:
    from poker.store import lock

    results = []
    with lock():
        results.append("inside")
    assert results == ["inside"]


def test_lock_no_redis_uses_memory_lock() -> None:
    from poker.store import lock

    with patch.object(store_module, "_client", return_value=None):
        with lock():
            pass  # no error


# ---------------------------------------------------------------------------
# TTL is set on saved keys
# ---------------------------------------------------------------------------


def test_save_sets_ttl(fake_redis: fakeredis.FakeRedis) -> None:  # type: ignore[type-arg]
    d = _game_dict()
    save(d)
    ttl = fake_redis.ttl(f"game:{d['game_id']}:state")
    assert ttl > 0

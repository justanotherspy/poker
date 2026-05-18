"""Redis-backed persistence for many concurrent games.

If REDIS_URL is not set, functions fall back to an in-process memory store
so the server works correctly in single-machine / local-dev mode.

The store is keyed exclusively by `game_id`. There is no notion of an
"active" game; the spectator UI selects one explicitly and agents discover
games via the `list_games` MCP tool.
"""

import json
import os
import threading
import time
from contextlib import contextmanager
from typing import Any, Generator

import redis as _redis_module

_Redis = _redis_module.Redis

# In-memory fallback used when REDIS_URL is unset.
_memory: dict[str, Any] = {"games": {}}
_memory_lock_factory_lock = threading.Lock()
_memory_locks: dict[str, threading.Lock] = {}

# TTL for Redis game state keys: 24 hours.  Prevents stale blobs accumulating
# if a game is abandoned without an explicit delete.
_STATE_TTL = 86400

_STATE_KEY = "game:{game_id}:state"
_LOCK_KEY = "lock:game:{game_id}"
_SCAN_PATTERN = "game:*:state"


def _client() -> "_Redis | None":
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    return _redis_module.from_url(url, decode_responses=True)


def _memory_lock_for(game_id: str) -> threading.Lock:
    with _memory_lock_factory_lock:
        existing = _memory_locks.get(game_id)
        if existing is None:
            existing = threading.Lock()
            _memory_locks[game_id] = existing
        return existing


@contextmanager
def lock(game_id: str, timeout: float = 5.0) -> Generator[None, None, None]:
    """Exclusive lock around one game's load-operate-save cycle.

    Uses a per-game Redis SETNX lock when Redis is available, or a per-game
    threading.Lock in memory-only mode. Two different games can be modified
    concurrently; the same game is serialized.
    """
    r = _client()
    if r is None:
        with _memory_lock_for(game_id):
            yield
        return

    lock_key = _LOCK_KEY.format(game_id=game_id)
    deadline = time.monotonic() + timeout
    acquired = False
    while time.monotonic() < deadline:
        acquired = bool(r.set(lock_key, "1", nx=True, ex=int(timeout) + 1))
        if acquired:
            break
        time.sleep(0.05)
    if not acquired:
        raise TimeoutError(f"Could not acquire lock for game {game_id}")
    try:
        yield
    finally:
        r.delete(lock_key)


def save_game(game_dict: dict[str, Any]) -> None:
    r = _client()
    game_id = game_dict["game_id"]
    if r is None:
        _memory["games"][game_id] = game_dict
        return
    r.set(
        _STATE_KEY.format(game_id=game_id),
        json.dumps(game_dict),
        ex=_STATE_TTL,
    )


def get_game(game_id: str) -> dict[str, Any] | None:
    r = _client()
    if r is None:
        result = _memory["games"].get(game_id)
        return dict(result) if result is not None else None
    raw = r.get(_STATE_KEY.format(game_id=game_id))
    if not raw:
        return None
    return json.loads(str(raw))  # type: ignore[no-any-return]


def delete_game(game_id: str) -> bool:
    r = _client()
    if r is None:
        return _memory["games"].pop(game_id, None) is not None
    deleted = r.delete(_STATE_KEY.format(game_id=game_id))
    return bool(deleted)


def list_games() -> list[dict[str, Any]]:
    """Return every game's serialized dict, oldest first."""
    r = _client()
    if r is None:
        games: list[dict[str, Any]] = [dict(g) for g in _memory["games"].values()]
    else:
        games = []
        for key in r.scan_iter(match=_SCAN_PATTERN):
            raw = r.get(key)
            if raw:
                games.append(json.loads(str(raw)))
    games.sort(key=lambda g: g.get("created_at", 0))
    return games

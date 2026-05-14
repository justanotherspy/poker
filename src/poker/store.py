"""Redis-backed game state persistence.

If REDIS_URL is not set, functions fall back to an in-process memory store
so the server works correctly in single-machine / local-dev mode.
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
_memory: dict[str, Any] = {}
_memory_lock = threading.Lock()

# TTL for Redis game state keys: 24 hours.  Prevents stale blobs accumulating
# if a game is abandoned without an explicit clear().
_STATE_TTL = 86400


def _client() -> "_Redis | None":
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    return _redis_module.from_url(url, decode_responses=True)


@contextmanager
def lock(timeout: float = 5.0) -> Generator[None, None, None]:
    """Exclusive lock around a load-operate-save cycle.

    Uses a Redis SETNX lock when Redis is available, or the in-process
    threading.Lock when running in memory-only mode.  Callers should wrap
    the full get_game() → apply → save() sequence inside this context.
    """
    r = _client()
    if r is None:
        with _memory_lock:
            yield
        return

    lock_key = "lock:active_game"
    deadline = time.monotonic() + timeout
    acquired = False
    while time.monotonic() < deadline:
        acquired = bool(r.set(lock_key, "1", nx=True, ex=int(timeout) + 1))
        if acquired:
            break
        time.sleep(0.05)
    if not acquired:
        raise TimeoutError("Could not acquire game lock")
    try:
        yield
    finally:
        r.delete(lock_key)


def save(game_dict: dict[str, Any]) -> None:
    r = _client()
    if r is None:
        _memory["active"] = game_dict
        return
    game_id = game_dict["game_id"]
    r.set(f"game:{game_id}:state", json.dumps(game_dict), ex=_STATE_TTL)
    r.set("active_game", game_id)


def load() -> dict[str, Any] | None:
    r = _client()
    if r is None:
        return _memory.get("active")
    game_id = r.get("active_game")
    if not game_id:
        return None
    raw = r.get(f"game:{game_id}:state")
    if not raw:
        return None
    return json.loads(str(raw))  # type: ignore[no-any-return]


def clear() -> None:
    r = _client()
    if r is None:
        _memory.pop("active", None)
        return
    game_id = r.get("active_game")
    if game_id:
        r.delete(f"game:{game_id}:state")
    r.delete("active_game")

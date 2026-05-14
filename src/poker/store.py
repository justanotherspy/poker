"""Redis-backed game state persistence.

If REDIS_URL is not set, all functions are no-ops and the server runs
in single-machine in-memory mode.
"""

import json
import os
from typing import Any

import redis as _redis_module

_Redis = _redis_module.Redis


def _client() -> "_Redis | None":
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    return _redis_module.from_url(url, decode_responses=True)


def save(game_dict: dict[str, Any]) -> None:
    r = _client()
    if r is None:
        return
    game_id = game_dict["game_id"]
    r.set(f"game:{game_id}:state", json.dumps(game_dict))
    r.set("active_game", game_id)


def load() -> dict[str, Any] | None:
    r = _client()
    if r is None:
        return None
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
        return
    game_id = r.get("active_game")
    if game_id:
        r.delete(f"game:{game_id}:state")
    r.delete("active_game")

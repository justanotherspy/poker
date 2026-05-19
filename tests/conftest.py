"""Shared test fixtures and env setup.

Centralises:
- the in-memory `_memory` reset between tests so games written by one
  test don't leak into the next,
- the fakeredis fixture used everywhere,
- a dev-friendly spectator password so HTTP tests can hit the gated
  endpoints with a single header.
"""

import os
from unittest.mock import patch

import fakeredis
import pytest

# Set before any `poker.*` import so module-level reads see them.
os.environ.setdefault("SPECTATOR_DEV_PASSWORD", "test")

SPECTATOR_HEADER = {"X-Spectator-Password": "test"}

import poker.store as store_module  # noqa: E402


@pytest.fixture(autouse=True)
def fake_redis() -> fakeredis.FakeRedis:  # type: ignore[type-arg]
    """Patches the Redis client and resets the in-memory fallback."""
    r: fakeredis.FakeRedis = fakeredis.FakeRedis(decode_responses=True)  # type: ignore[type-arg]
    store_module._memory["games"] = {}
    with patch.object(store_module, "_client", return_value=r):
        yield r

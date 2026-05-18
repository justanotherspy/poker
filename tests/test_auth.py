"""Unit tests for the spectator password verifier."""

import hashlib
import os
from unittest.mock import patch

from poker.auth import verify_spectator_password


def test_dev_plaintext_accepted() -> None:
    # SPECTATOR_DEV_PASSWORD is set to "test" in conftest. The plaintext
    # bypass exists for direct backend access (curl, scripts, tests).
    assert verify_spectator_password("test") is True


def test_dev_hash_not_accepted_via_plaintext_bypass() -> None:
    # Important: the dev-plaintext bypass does NOT silently accept the
    # SHA-256 of the dev password. To use the UI in dev mode, set
    # SPECTATOR_PASSWORD_HASH instead — that's the only path that should
    # match a hex string, and it's an explicit, intentional opt-in.
    hashed = hashlib.sha256(b"test").hexdigest()
    assert verify_spectator_password(hashed) is False


def test_unknown_password_rejected() -> None:
    assert verify_spectator_password("wrong") is False


def test_empty_password_rejected() -> None:
    assert verify_spectator_password("") is False


def test_production_hash_accepted() -> None:
    # When SPECTATOR_PASSWORD_HASH is set, submitting that hash works
    # even without the dev password fallback.
    secret = "shh"
    hashed = hashlib.sha256(secret.encode()).hexdigest()
    with patch.dict(os.environ, {"SPECTATOR_PASSWORD_HASH": hashed}, clear=False):
        assert verify_spectator_password(hashed) is True


def test_production_hash_is_case_insensitive() -> None:
    secret = "shh"
    hashed = hashlib.sha256(secret.encode()).hexdigest()
    with patch.dict(
        os.environ, {"SPECTATOR_PASSWORD_HASH": hashed.upper()}, clear=False
    ):
        assert verify_spectator_password(hashed) is True
        assert verify_spectator_password(hashed.upper()) is True

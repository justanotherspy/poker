"""Unit tests for the spectator password verifier."""

import hashlib
import os
from unittest.mock import patch

from poker.auth import verify_spectator_password


def test_dev_plaintext_accepted() -> None:
    # SPECTATOR_DEV_PASSWORD is set to "test" in conftest.
    assert verify_spectator_password("test") is True


def test_hashed_dev_password_accepted() -> None:
    # The browser hashes the password before sending. Make sure the
    # hashed form of the dev password is also accepted, so the UI can
    # use a single code path.
    hashed = hashlib.sha256("test".encode()).hexdigest()
    assert verify_spectator_password(hashed) is True


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

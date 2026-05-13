.PHONY: test lint format typecheck semgrep check

test:
	uv run pytest

lint:
	uv run ruff check src tests

format:
	uv run black src tests

typecheck:
	uv run mypy src

semgrep:
	semgrep --config auto src

check: lint typecheck semgrep test

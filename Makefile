.PHONY: test lint format typecheck check

test:
	uv run pytest

lint:
	uv run ruff check src tests

format:
	uv run black src tests

typecheck:
	uv run mypy src

check: lint typecheck test

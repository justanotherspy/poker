.PHONY: test lint format typecheck semgrep check \
        frontend-install frontend-build frontend-dev \
        docker-build docker-run

# Python checks
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

# Frontend (Bun + Next.js)
frontend-install:
	cd frontend && bun install --frozen-lockfile

frontend-build:
	cd frontend && bun run build

frontend-dev:
	cd frontend && bun run dev

# Docker
docker-build:
	docker build -t claude-poker .

docker-run:
	docker run -e MCP_API_KEY_HASHES=$${MCP_API_KEY_HASHES} -p 8000:8000 claude-poker

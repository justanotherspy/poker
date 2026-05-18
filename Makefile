.PHONY: test e2e lint format format-check typecheck semgrep check \
        frontend-install frontend-build frontend-dev \
        docker-build docker-run \
        gen-api-key

# Python checks
test:
	uv run pytest -m "not e2e"

e2e:
	uv run pytest -m e2e -v

lint:
	uv run ruff check src tests

format:
	uv run black src tests

# Mirrors the CI "Python Format (black)" check exactly.
format-check:
	uv run black --check src tests

typecheck:
	uv run mypy src

# Scans the whole repo (including frontend/) to match the CI semgrep job,
# which runs `semgrep --config auto .` and surfaces findings via SARIF
# upload to the GitHub Advanced Security "Semgrep OSS" check.
semgrep:
	semgrep --config auto --error .

check: format-check lint typecheck semgrep test frontend-typecheck frontend-build

# Frontend (Bun + Next.js)
frontend-install:
	cd frontend && bun install --frozen-lockfile

frontend-typecheck:
	cd frontend && bun run lint

frontend-build:
	cd frontend && bun run build

frontend-dev:
	cd frontend && bun run dev

# API key management
gen-api-key:
	@python3 -c "import hashlib, secrets; k = secrets.token_urlsafe(32); print('KEY  (keep secret):', k); print('HASH (add to MCP_API_KEY_HASHES):', hashlib.sha256(k.encode()).hexdigest())"

# Docker
docker-build:
	docker build -t claude-poker .

docker-run:
	docker run --env-file .env -p 8000:8000 claude-poker

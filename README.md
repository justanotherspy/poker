# Claude Poker

A Texas Hold'em table where Claude agents play each other. Built as an MCP server (FastMCP) with a companion web UI, using PokerKit as the game engine.

## Architecture

```
https://claude-poker.fly.dev/
├── /            → Next.js web UI (React + Tailwind, static export)
├── /mcp         → FastMCP endpoint — Claude agents connect here (API key required)
├── /api/health  → Health check
└── /api/*       → Game state REST API (SSE for live updates)
```

Single Docker image: Bun builds the Next.js frontend at image build time; FastAPI serves everything at runtime.

## Stack

| Layer | Tech |
|---|---|
| Game engine | [PokerKit](https://github.com/uoftcprg/pokerkit) |
| MCP server | [FastMCP](https://github.com/jlowin/fastmcp) |
| HTTP API + static serving | [FastAPI](https://fastapi.tiangolo.com) + [uvicorn](https://www.uvicorn.org) |
| Frontend | [Next.js 14](https://nextjs.org) + TypeScript + Tailwind (static export) |
| Agents | [Anthropic Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) |
| Python tooling | [uv](https://docs.astral.sh/uv/) |
| Frontend tooling | [Bun](https://bun.sh) |
| Hosting | [Fly.io](https://fly.io) (`claude-poker`, region `iad`) |

## Local Development

### Python server

```bash
uv sync --all-groups          # install deps
uv run uvicorn poker.server:app --reload --port 8000
```

The server starts without a built frontend — `GET /` returns a placeholder page. Build the frontend first if you need the real UI.

### Frontend (Next.js)

```bash
cd frontend
bun install
bun run dev    # dev server on :3000
```

To build the static frontend and serve it from FastAPI:

```bash
make frontend-build   # outputs to src/poker/static/
```

### Python checks

```bash
make check   # lint (ruff) + typecheck (mypy) + semgrep + test (pytest)
```

## Docker

```bash
make docker-build
MCP_API_KEY_HASHES=<hash> make docker-run
# → http://localhost:8000
```

## API Key Auth

The `/mcp` endpoint requires `Authorization: Bearer <key>`. Keys are stored server-side as SHA-256 hashes in the `MCP_API_KEY_HASHES` environment variable (comma-separated, no plaintext).

Generate a key + hash:

```bash
python3 -c "
import hashlib, secrets
k = secrets.token_urlsafe(32)
print('KEY (keep this):', k)
print('HASH (store this):', hashlib.sha256(k.encode()).hexdigest())
"
```

## Fly.io Deploy

Deploys automatically on push to `main`. Manual deploy:

```bash
fly deploy --remote-only --app claude-poker
```

### First-time setup

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh
fly auth login

# Create app
fly apps create claude-poker

# Set API key hash as secret
fly secrets set MCP_API_KEY_HASHES="<hash>" --app claude-poker

# Create deploy token for GitHub Actions
fly tokens create deploy --app claude-poker
# → add as FLY_API_TOKEN in GitHub repo Settings → Secrets → Actions
```

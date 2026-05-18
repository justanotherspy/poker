# Claude Poker

[![CI](https://github.com/justanotherspy/poker/actions/workflows/ci.yml/badge.svg)](https://github.com/justanotherspy/poker/actions/workflows/ci.yml)
[![Deploy](https://img.shields.io/github/deployments/justanotherspy/poker/production?label=deploy)](https://github.com/justanotherspy/poker/deployments/activity_log?environments_filter=production)

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
| Frontend | [Next.js 16](https://nextjs.org) + TypeScript + Tailwind (static export) |
| Agents | [Anthropic Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) |
| Python tooling | [uv](https://docs.astral.sh/uv/) |
| Frontend tooling | [Bun](https://bun.sh) |
| Hosting | [Fly.io](https://fly.io) (`claude-poker`, region `iad`) |

## Local Development

```bash
cp .env.example .env   # fill in values
uv sync --all-groups
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

### MCP auth in development

The `/mcp` endpoint requires `Authorization: Bearer <key>`. In development, set `MCP_DEV_TOKEN` to any plaintext string in `.env` — the server accepts it directly. To connect Claude Code's `claude-poker-local` MCP server to your local instance, set `POKER_MCP_API_KEY` to the same value.

### Python checks

```bash
make check   # lint (ruff) + typecheck (mypy) + semgrep + test (pytest)
make e2e     # end-to-end tests — starts a real server on :18765
```

## Docker

```bash
make docker-build
make docker-run   # reads env from .env → http://localhost:8000
```

## Fly.io Deploy

Deploys automatically on push to `main`. Manual deploy:

```bash
fly deploy --remote-only --app claude-poker
```

**Secrets** (set with `fly secrets set --app claude-poker`):
- `MCP_API_KEY_HASHES` — comma-separated SHA-256 hashes of API keys (no plaintext)

# Poker Project

## Workflow

- Always run `make check` before opening a PR.
- Always open a PR for changes (even small ones).
- Use the GitHub MCP tools (`mcp__github__create_pull_request`) when creating PRs.
- Follow the PR template at `.github/PULL_REQUEST_TEMPLATE.md`: Problem + Solution sections only, always reference a Linear ticket (JUS-XX).

## Libraries

- **PokerKit** (`/websites/pokerkit_readthedocs_io_en` on Context7) — poker game simulation, hand evaluation, statistical analysis
- **FastMCP** — MCP server framework
- **FastAPI** + **uvicorn** — HTTP API surface for the web UI
- **Anthropic Managed Agents** — one session per seat; push table events as `user.message` into each running session

## Tooling

- **uv** for Python package management and running tools (`uv run <tool>`)
- **Python 3.13+**
- **black** — formatting | **ruff** — linting | **mypy** (strict) — type checking | **pytest** — tests

## Makefile

| Target | What it does |
|--------|-------------|
| `make test` | Run pytest (excludes e2e) |
| `make e2e` | Run e2e tests (starts a real server on :18765) |
| `make lint` | Run ruff |
| `make format` | Run black |
| `make typecheck` | Run mypy |
| `make semgrep` | Run semgrep (community edition, `--config auto`) |
| `make check` | lint + typecheck + semgrep + test |
| `make frontend-install` | `bun install --frozen-lockfile` in `frontend/` |
| `make frontend-build` | Build Next.js static export into `src/poker/static/` |
| `make frontend-dev` | Start Next.js dev server on :3000 |
| `make docker-build` | Build Docker image `claude-poker` |
| `make docker-run` | Run `claude-poker` image on port 8000 (reads env from `.env`) |

## Local Development

Copy `.env.example` to `.env` and fill in values before running anything locally.

### Auth in development

The `/mcp` endpoint normally requires a SHA-256-hashed API key via `Authorization: Bearer <key>`. For local dev, set `MCP_DEV_TOKEN` in `.env` to any plaintext string — the server accepts it directly, bypassing hash checks. The e2e tests use this mechanism automatically.

The `claude-poker-local` MCP server in `.mcp.json` connects to `http://localhost:8000/mcp` using `POKER_MCP_API_KEY` from your environment. Set that to your `MCP_DEV_TOKEN` value when working locally.

## MCP Servers

Configured in `.mcp.json`:

| Server | Purpose |
|--------|---------|
| `github` | GitHub API — PRs, issues, files, CI (requires `GITHUB_TOKEN`) |
| `linear` | Read/update Linear issues (requires `LINEAR_API_KEY`) |
| `context7` | Fetch current library docs via `resolve-library-id` + `query-docs` |
| `fly` | Manage the Fly.io deployment (check status, set secrets, view logs) |
| `claude-poker` | Talk to the live game at `claude-poker.fly.dev/mcp` (requires `POKER_MCP_API_KEY`) |
| `claude-poker-local` | Talk to a local server at `localhost:8000/mcp` (set `POKER_MCP_API_KEY` to your `MCP_DEV_TOKEN`) |
| `excalidraw` | Create and manipulate Excalidraw diagrams (elements, scenes, grouping, alignment) |

## Fly.io Deployment

- **App**: `claude-poker` | **Region**: `iad`
- **Endpoints**: `/` (web UI), `/mcp` (MCP — auth required), `/api/health` (health check)
- Deploys automatically on push to `main` via `.github/workflows/deploy.yml`
- Requires `FLY_API_TOKEN` secret in GitHub repo settings

**Secrets** (set with `fly secrets set --app claude-poker`):
- `MCP_API_KEY_HASHES` — comma-separated SHA-256 hashes of MCP API keys (no plaintext)

Manual deploy: `flyctl deploy --remote-only`

## Linear

Work is tracked in Linear under the **JUS** project. Use the Linear MCP server to read and update issues, leave comments, and check project status. Always reference the ticket (JUS-XX) in commits and PRs.

When working with any library, use Context7 MCP to fetch current docs:
1. Call `resolve-library-id` with the library name
2. Call `query-docs` with the returned ID and your question

# Poker Project

## Workflow

- Always open a **draft PR** for changes (even small ones).
- Use `gh pr create --draft` when creating PRs.
- Follow the PR template at `.github/PULL_REQUEST_TEMPLATE.md`: Problem + Solution sections only, always reference a Linear ticket (JUS-XX).

## Libraries

- **PokerKit** (`/websites/pokerkit_readthedocs_io_en` on Context7) — poker game simulation, hand evaluation, statistical analysis
- **FastMCP** — MCP server framework
- **FastAPI** + **uvicorn** — HTTP API surface for the web UI

## Tooling

- **uv** for Python package management and running tools (`uv run <tool>`)
- **Python 3.13+**
- **black** — formatting | **ruff** — linting | **mypy** (strict) — type checking | **pytest** — tests

## Makefile

| Target | What it does |
|--------|-------------|
| `make test` | Run pytest |
| `make lint` | Run ruff |
| `make format` | Run black |
| `make typecheck` | Run mypy |
| `make semgrep` | Run semgrep (community edition, `--config auto`) — requires `pipx install semgrep` |
| `make check` | lint + typecheck + semgrep + test |

## Linear

Work is tracked in Linear under the **JUS** project. Use the Linear MCP server to read and update issues, leave comments, and check project status. Always reference the ticket (JUS-XX) in commits and PRs.

When working with any library, use Context7 MCP to fetch current docs:
1. Call `resolve-library-id` with the library name
2. Call `query-docs` with the returned ID and your question

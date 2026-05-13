# poker

A poker game server where Claude plays poker. Built as an MCP server (FastMCP) with a companion HTTP API for the web UI, using PokerKit as the game engine.

## Stack

- **Python 3.13+** managed by [uv](https://docs.astral.sh/uv/)
- **FastMCP** — MCP server
- **FastAPI** — HTTP API for the web UI
- **PokerKit** — poker game logic

## Development

```bash
uv sync --all-groups  # install all deps + create .venv
make test             # run tests
make lint             # ruff
make format           # black
make typecheck        # mypy
make semgrep          # semgrep (requires: pipx install semgrep)
make check            # lint + typecheck + semgrep + test
```

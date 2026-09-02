# Stage 1: install frontend dependencies
FROM oven/bun:1@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6 AS deps
WORKDIR /app
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile

# Stage 2: build Next.js static export
FROM oven/bun:1@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6 AS frontend-build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN bun run build

# Stage 3: Python runtime
FROM python:3.14.7-slim@sha256:cad9a2c871761c413caa6fdd6441c783451e740a48aaeba60ae62a8b53525ef6
COPY --from=ghcr.io/astral-sh/uv:latest@sha256:8b940d3a9d65bed080436972241af2e21c84b5e8c9193f7014ed71479ee795ff /uv /usr/local/bin/uv
RUN groupadd --system poker && useradd --system --gid poker --create-home poker \
    && install -d -o poker -g poker /app
WORKDIR /app
COPY --chown=poker:poker pyproject.toml uv.lock ./
COPY --chown=poker:poker src/ ./src/
COPY --from=frontend-build --chown=poker:poker /app/out ./src/poker/static/
USER poker
RUN uv sync --frozen --no-dev
EXPOSE 8000
CMD ["uv", "run", "--frozen", "--no-sync", "--no-dev", "uvicorn", "poker.server:app", "--host", "0.0.0.0", "--port", "8000"]

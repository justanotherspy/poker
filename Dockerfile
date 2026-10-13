# Stage 1: install frontend dependencies
FROM oven/bun:1@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS deps
WORKDIR /app
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile

# Stage 2: build Next.js static export
FROM oven/bun:1@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS frontend-build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN bun run build

# Stage 3: Python runtime
FROM python:3.15.0-slim@sha256:ea4f1f290e071bf7d28199cfb3e09f5dbad31b50e9c32fd58f2f2d7be915f3ae
COPY --from=ghcr.io/astral-sh/uv:latest@sha256:cdc6093146eb3ff6a40107b38f008b789e050e77ad87865e381d9917da55a168 /uv /usr/local/bin/uv
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

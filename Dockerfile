# Stage 1: install frontend dependencies
FROM oven/bun:1@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS deps
WORKDIR /app
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile

# Stage 2: build Next.js static export
FROM oven/bun:1@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS frontend-build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN bun run build

# Stage 3: Python runtime
FROM python:3.14.5-slim@sha256:c845af9399020c7e562969a13689e929074a10fd057acd1b1fad06a2fb068e97
COPY --from=ghcr.io/astral-sh/uv:latest@sha256:b46b03ddfcfbf8f547af7e9eaefdf8a39c8cebcba7c98858d3162bd28cf536f6 /uv /usr/local/bin/uv
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

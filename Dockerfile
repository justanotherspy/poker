# Stage 1: install frontend dependencies
FROM oven/bun:1@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS deps
WORKDIR /app
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile

# Stage 2: build Next.js static export
FROM oven/bun:1@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS frontend-build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN bun run build

# Stage 3: Python runtime
FROM python:3.14.8-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170
COPY --from=ghcr.io/astral-sh/uv:latest@sha256:3af4716e991d6956a41e573eab705d0ee08500cd829ed30293eb8472f372c65a /uv /usr/local/bin/uv
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

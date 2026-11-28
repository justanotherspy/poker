# Stage 1: install frontend dependencies
FROM oven/bun:1@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18 AS deps
WORKDIR /app
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile

# Stage 2: build Next.js static export
FROM oven/bun:1@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18 AS frontend-build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN bun run build

# Stage 3: Python runtime
FROM python:3.15.2-slim@sha256:08a4c22c92b79ec821a7ad49768480039ee5b7accac3955228e75366e30abc8e
COPY --from=ghcr.io/astral-sh/uv:latest@sha256:a3ea1357342c1a4bf9a0c53a3deb1b55379aefa037338d8113d5771efa01774f /uv /usr/local/bin/uv
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

# Stage 1: install frontend dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY frontend/package.json frontend/bun.lockb* ./
RUN bun install --frozen-lockfile

# Stage 2: build Next.js static export
FROM oven/bun:1 AS frontend-build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN bun run build

# Stage 3: Python runtime
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY src/ ./src/
COPY --from=frontend-build /app/out ./src/poker/static/
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "poker.server:app", "--host", "0.0.0.0", "--port", "8000"]

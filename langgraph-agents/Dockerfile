# LangGraph Agents Dockerfile (Aegra-based)
# Production-ready container for InterviewLM AI agents
#
# Uses Aegra - open source LangGraph Platform alternative
# - Serves multiple agent graphs (coding, evaluation, interview, etc.)
# - Persists state in PostgreSQL with LangGraph checkpointer
# - LangGraph SDK compatible API
# - LangSmith observability

FROM python:3.11-slim-bookworm AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100

WORKDIR /app

# Create non-root user for runtime
RUN addgroup --system app && adduser --system --ingroup app app

# -----------------------------
# Builder stage
# -----------------------------
FROM base AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Aegra source and install
COPY aegra/pyproject.toml ./
COPY aegra/README.md ./
COPY aegra/src/ ./src/

# Install Aegra and its dependencies
RUN python -m pip install --upgrade pip && \
    pip install --no-cache-dir .

# Install additional dependencies for our agents
COPY requirements.txt ./requirements-extra.txt
RUN pip install --no-cache-dir -r requirements-extra.txt

# -----------------------------
# Final, minimal runtime image
# -----------------------------
FROM base AS final

# Install minimal runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages and console scripts from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages/ /usr/local/lib/python3.11/site-packages/
COPY --from=builder /usr/local/bin/ /usr/local/bin/

# Copy Aegra runtime assets
COPY aegra/alembic.ini ./alembic.ini
COPY aegra/alembic/ ./alembic/
COPY aegra/src/ ./src/

# Copy our noop auth.py (created for development/internal use)
COPY auth.py ./auth.py

# Copy our graph configuration and code
COPY langgraph.json ./langgraph.json
COPY agents/ ./agents/
COPY tools/ ./tools/
COPY middleware/ ./middleware/

# Copy startup script
COPY start.sh ./start.sh
RUN chmod +x start.sh

# Set PYTHONPATH to include our code
ENV PYTHONPATH=/app:/app/agents:/app/tools:/app/middleware

# Change ownership to app user before switching
RUN chown -R app:app /app

EXPOSE 8000

# Health check - Aegra uses /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run as non-root
USER app

# Start server with migrations
CMD ["./start.sh"]

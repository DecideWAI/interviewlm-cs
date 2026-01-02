# LangGraph Agents Dockerfile
# Production-ready container for InterviewLM AI agents
#
# This container runs the LangGraph server which:
# - Serves multiple agent graphs (coding, evaluation, interview, etc.)
# - Persists state in PostgreSQL
# - Uses Redis for pub-sub streaming
# - Implements custom authentication middleware

FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r agents && useradd -r -g agents agents

# Set working directory
WORKDIR /app

# Copy requirements first (for better caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Change ownership to non-root user
RUN chown -R agents:agents /app

# Switch to non-root user
USER agents

# Expose port for LangGraph server
EXPOSE 8000

# Health check - LangGraph uses /ok endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/ok || exit 1

# Default command - run the production FastAPI server
# Reads langgraph.json and serves all graphs via REST API
CMD ["python", "server.py"]

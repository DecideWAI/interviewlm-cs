# LangGraph Agents Makefile
# Common commands for development, testing, and deployment

.PHONY: help install test benchmark lint format clean docker-up docker-down langgraph-dev langgraph-deploy langgraph-up langgraph-down langgraph-test

# Default target
help:
	@echo "LangGraph Agents - Available Commands"
	@echo "======================================"
	@echo ""
	@echo "Setup:"
	@echo "  make install      - Install dependencies"
	@echo "  make install-dev  - Install with dev dependencies"
	@echo ""
	@echo "LangGraph Server (Primary):"
	@echo "  make langgraph-dev    - Run LangGraph dev server (port 2024)"
	@echo "  make langgraph-up     - Start LangGraph with Docker (port 8123)"
	@echo "  make langgraph-down   - Stop LangGraph Docker services"
	@echo "  make langgraph-deploy - Deploy to LangGraph Cloud"
	@echo "  make langgraph-test   - Verify all graph exports"
	@echo ""
	@echo "Testing:"
	@echo "  make test         - Run tests"
	@echo "  make test-cov     - Run tests with coverage"
	@echo "  make benchmark    - Run benchmark suite"
	@echo "  make test-cache   - Test prompt caching"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint         - Run linter (ruff)"
	@echo "  make format       - Format code (ruff)"
	@echo "  make typecheck    - Run type checker (mypy)"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up    - Start all services (docker-compose)"
	@echo "  make docker-down  - Stop all services"
	@echo "  make docker-build - Build docker images"
	@echo "  make docker-logs  - View docker logs"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean        - Remove cache files"
	@echo "  make env          - Show environment info"

# =============================================================================
# Setup
# =============================================================================

install:
	pip install -r requirements.txt
	pip install -e .

install-dev:
	pip install -r requirements.txt
	pip install -e .
	pip install ruff mypy

# =============================================================================
# Development (use langgraph-dev instead)
# =============================================================================

# Note: FastAPI server (api.py) has been deprecated in favor of LangGraph dev server.
# Use 'make langgraph-dev' to start the LangGraph server on port 2024.
# The TypeScript client uses @langchain/langgraph-sdk to communicate with it.

# =============================================================================
# Testing
# =============================================================================

test:
	pytest -v

test-cov:
	pytest -v --cov=agents --cov=tools --cov-report=html

test-cache:
	python test_coding_cache.py

benchmark:
	python benchmark.py --iterations 2 --verbose

benchmark-full:
	python benchmark.py --iterations 5 --verbose

# =============================================================================
# Code Quality
# =============================================================================

lint:
	ruff check .

format:
	ruff format .

typecheck:
	mypy agents/ tools/ --ignore-missing-imports

# =============================================================================
# Docker
# =============================================================================

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-build:
	docker-compose build

docker-logs:
	docker-compose logs -f

docker-restart:
	docker-compose down && docker-compose up -d

# =============================================================================
# LangGraph Cloud
# =============================================================================

# Run LangGraph development server locally (uses langgraph.json)
# Default port: 2024, Studio UI: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
langgraph-dev:
	langgraph dev --port 2024

# Run LangGraph dev server on custom port (e.g., make langgraph-dev-port PORT=8080)
langgraph-dev-port:
	langgraph dev --port $(PORT)

# Start LangGraph with Docker (includes postgres + redis for persistence)
# Default port: 8123
# Note: This will conflict with existing postgres/redis containers - stop them first
langgraph-up:
	@echo "Stopping existing containers that may conflict..."
	-docker stop interviewlm-postgres-dev interviewlm-redis-dev 2>/dev/null || true
	langgraph up --port 8123

# Stop LangGraph Docker services and restart existing containers
langgraph-down:
	langgraph down
	@echo "Restarting existing development containers..."
	-docker start interviewlm-postgres-dev interviewlm-redis-dev 2>/dev/null || true

# Deploy to LangGraph Cloud
langgraph-deploy:
	langgraph deploy

# Verify all graph exports load correctly
langgraph-test:
	@python -c "\
from agents.coding_agent import graph; \
from agents.evaluation_agent import evaluation_graph; \
from agents.interview_agent import interview_graph; \
from agents.question_evaluation_agent import question_evaluation_graph; \
from agents.supervisor import supervisor_graph; \
print('All graphs loaded successfully:'); \
print('  coding_agent:', type(graph).__name__); \
print('  evaluation_agent:', type(evaluation_graph).__name__); \
print('  interview_agent:', type(interview_graph).__name__); \
print('  question_evaluation_agent:', type(question_evaluation_graph).__name__); \
print('  supervisor:', type(supervisor_graph).__name__)"

# =============================================================================
# Utilities
# =============================================================================

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name ".coverage" -delete 2>/dev/null || true
	@echo "Cleaned cache files"

env:
	@echo "Python: $$(python --version)"
	@echo "Pip: $$(pip --version)"
	@echo ""
	@echo "Key packages:"
	@pip show langchain langgraph langchain-anthropic anthropic langsmith 2>/dev/null | grep -E "^(Name|Version):" | paste - -

# =============================================================================
# Model-specific benchmarks
# =============================================================================

benchmark-haiku:
	CODING_AGENT_MODEL=claude-haiku-4-5-20251001 python benchmark.py --iterations 2 --verbose

benchmark-sonnet:
	CODING_AGENT_MODEL=claude-sonnet-4-20250514 python benchmark.py --iterations 2 --verbose

# =============================================================================
# Quick commands
# =============================================================================

# Run a quick test of the coding agent
quick-test:
	python -c "import asyncio; from agents import create_coding_agent; \
	agent = create_coding_agent('test', 'test'); \
	print(asyncio.run(agent.send_message('What is 2+2?')))"

# Check all imports work
check-imports:
	@python -c "from agents import create_coding_agent, create_interview_agent, \
	create_evaluation_agent, create_question_evaluation_agent, create_supervisor; \
	from agents.coding_agent import graph; \
	from agents.evaluation_agent import evaluation_graph; \
	from agents.interview_agent import interview_graph; \
	from agents.question_evaluation_agent import question_evaluation_graph; \
	from agents.supervisor import supervisor_graph; \
	print('All agents and graphs imported successfully!')"

# LangGraph Agents Makefile
# Common commands for development, testing, and deployment

.PHONY: help install dev test benchmark lint format clean docker-up docker-down run

# Default target
help:
	@echo "LangGraph Agents - Available Commands"
	@echo "======================================"
	@echo ""
	@echo "Setup:"
	@echo "  make install      - Install dependencies"
	@echo "  make install-dev  - Install with dev dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make run          - Run FastAPI server (port 8080)"
	@echo "  make dev          - Run with auto-reload"
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

install-dev:
	pip install -r requirements.txt
	pip install ruff mypy

# =============================================================================
# Development
# =============================================================================

run:
	python api.py

dev:
	uvicorn api:app --host 0.0.0.0 --port 9001 --reload

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
	python -c "from agents import create_coding_agent, create_interview_agent, \
	create_evaluation_agent, create_question_evaluation_agent, create_supervisor; \
	print('All agents imported successfully!')"

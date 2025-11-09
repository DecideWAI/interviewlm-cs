#!/bin/bash

# Docker Test Helper Script
# This script manages the Docker test environment

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_msg() {
    echo -e "${BLUE}[InterviewLM Tests]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Commands
case "$1" in
    run)
        print_msg "Starting test environment..."
        docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test-runner
        EXIT_CODE=$?

        print_msg "Cleaning up test environment..."
        docker-compose -f docker-compose.test.yml down -v

        if [ $EXIT_CODE -eq 0 ]; then
            print_success "All tests passed!"
        else
            print_error "Tests failed with exit code $EXIT_CODE"
        fi

        exit $EXIT_CODE
        ;;

    start)
        print_msg "Starting test database..."
        docker-compose -f docker-compose.test.yml up -d postgres-test
        print_msg "Waiting for database to be ready..."
        sleep 5
        print_success "Test database is ready!"
        print_msg "Connection: postgresql://testuser:testpassword@localhost:5433/interviewlm_test"
        ;;

    stop)
        print_msg "Stopping test environment..."
        docker-compose -f docker-compose.test.yml down -v
        print_success "Test environment stopped!"
        ;;

    logs)
        docker-compose -f docker-compose.test.yml logs -f
        ;;

    shell)
        print_msg "Opening shell in test runner..."
        docker-compose -f docker-compose.test.yml run --rm test-runner sh
        ;;

    db)
        print_msg "Opening PostgreSQL shell..."
        docker-compose -f docker-compose.test.yml exec postgres-test psql -U testuser -d interviewlm_test
        ;;

    interactive)
        print_msg "Starting interactive test mode..."
        docker-compose -f docker-compose.test.yml up -d postgres-test
        print_msg "Waiting for database..."
        sleep 5
        print_msg "Running tests in watch mode..."
        docker-compose -f docker-compose.test.yml run --rm test-runner sh -c "
            apk add --no-cache openssl &&
            npm ci &&
            npx prisma generate &&
            npx prisma db push --skip-generate &&
            npm run test:integration:watch
        "
        docker-compose -f docker-compose.test.yml down -v
        ;;

    coverage)
        print_msg "Running tests with coverage..."
        docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test-runner
        EXIT_CODE=$?

        if [ $EXIT_CODE -eq 0 ]; then
            print_success "Tests completed! Copying coverage report..."
            docker cp interviewlm-test-runner:/app/coverage ./coverage
            print_success "Coverage report available at: ./coverage/lcov-report/index.html"
        fi

        docker-compose -f docker-compose.test.yml down -v
        exit $EXIT_CODE
        ;;

    clean)
        print_msg "Cleaning test environment..."
        docker-compose -f docker-compose.test.yml down -v --remove-orphans
        print_success "Test environment cleaned!"
        ;;

    *)
        echo "Docker Test Helper"
        echo ""
        echo "Usage: ./scripts/docker-test.sh [command]"
        echo ""
        echo "Commands:"
        echo "  run          Run all integration tests"
        echo "  start        Start test database only"
        echo "  stop         Stop test environment"
        echo "  logs         View test logs"
        echo "  shell        Open shell in test container"
        echo "  db           Open PostgreSQL shell"
        echo "  interactive  Run tests in watch mode"
        echo "  coverage     Run tests with coverage report"
        echo "  clean        Clean up test environment"
        echo ""
        echo "Examples:"
        echo "  ./scripts/docker-test.sh run"
        echo "  ./scripts/docker-test.sh interactive"
        echo "  ./scripts/docker-test.sh coverage"
        ;;
esac

#!/bin/bash

# Docker Development Helper Script
# This script manages the Docker development environment

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Detect docker-compose command (v1 vs v2)
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo -e "${RED}✗${NC} Docker Compose not found. Please install Docker Desktop."
    exit 1
fi

# Print colored message
print_msg() {
    echo -e "${BLUE}[InterviewLM]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Commands
case "$1" in
    start)
        print_msg "Starting development environment..."
        $DOCKER_COMPOSE -f docker-compose.dev.yml up -d
        print_success "Development environment started!"
        print_msg "App running at: http://localhost:3002"
        print_msg "Database running at: localhost:5433"
        print_msg ""
        print_msg "To view logs: ./scripts/docker-dev.sh logs"
        ;;

    stop)
        print_msg "Stopping development environment..."
        $DOCKER_COMPOSE -f docker-compose.dev.yml down
        print_success "Development environment stopped!"
        ;;

    restart)
        print_msg "Restarting development environment..."
        $DOCKER_COMPOSE -f docker-compose.dev.yml restart
        print_success "Development environment restarted!"
        ;;

    logs)
        $DOCKER_COMPOSE -f docker-compose.dev.yml logs -f app-dev
        ;;

    logs-db)
        $DOCKER_COMPOSE -f docker-compose.dev.yml logs -f postgres
        ;;

    shell)
        print_msg "Opening shell in app container..."
        $DOCKER_COMPOSE -f docker-compose.dev.yml exec app-dev sh
        ;;

    db)
        print_msg "Opening PostgreSQL shell..."
        print_msg "Note: Database is exposed on host port 5433"
        $DOCKER_COMPOSE -f docker-compose.dev.yml exec postgres psql -U postgres -d interviewlm
        ;;

    clean)
        print_warning "This will remove all containers, volumes, and data!"
        read -p "Are you sure? (yes/no): " -r
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            print_msg "Cleaning up..."
            $DOCKER_COMPOSE -f docker-compose.dev.yml down -v
            print_success "Cleanup complete!"
        else
            print_msg "Cleanup cancelled."
        fi
        ;;

    rebuild)
        print_msg "Rebuilding containers..."
        $DOCKER_COMPOSE -f docker-compose.dev.yml down
        $DOCKER_COMPOSE -f docker-compose.dev.yml build --no-cache
        $DOCKER_COMPOSE -f docker-compose.dev.yml up -d
        print_success "Rebuild complete!"
        ;;

    status)
        print_msg "Container status:"
        $DOCKER_COMPOSE -f docker-compose.dev.yml ps
        ;;

    migrate)
        print_msg "Running database migrations..."
        $DOCKER_COMPOSE -f docker-compose.dev.yml exec app-dev npx prisma migrate dev
        print_success "Migrations complete!"
        ;;

    seed)
        print_msg "Seeding database..."
        $DOCKER_COMPOSE -f docker-compose.dev.yml exec app-dev npx prisma db seed
        print_success "Database seeded!"
        ;;

    studio)
        print_msg "Opening Prisma Studio..."
        print_msg "Prisma Studio will be available at: http://localhost:5555"
        $DOCKER_COMPOSE -f docker-compose.dev.yml exec app-dev npx prisma studio
        ;;

    *)
        echo "Docker Development Helper"
        echo ""
        echo "Usage: ./scripts/docker-dev.sh [command]"
        echo ""
        echo "Commands:"
        echo "  start      Start development environment"
        echo "  stop       Stop development environment"
        echo "  restart    Restart development environment"
        echo "  logs       View app logs (follow mode)"
        echo "  logs-db    View database logs"
        echo "  shell      Open shell in app container"
        echo "  db         Open PostgreSQL shell"
        echo "  clean      Remove all containers and volumes"
        echo "  rebuild    Rebuild containers from scratch"
        echo "  status     Show container status"
        echo "  migrate    Run database migrations"
        echo "  seed       Seed database with sample data"
        echo "  studio     Open Prisma Studio"
        echo ""
        echo "Examples:"
        echo "  ./scripts/docker-dev.sh start"
        echo "  ./scripts/docker-dev.sh logs"
        echo "  ./scripts/docker-dev.sh shell"
        ;;
esac

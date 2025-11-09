# Docker Setup Guide

Complete guide for running InterviewLM with Docker and Docker Compose.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Development Mode](#development-mode)
5. [Production Mode](#production-mode)
6. [Testing with Docker](#testing-with-docker)
7. [Docker Commands Reference](#docker-commands-reference)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Overview

InterviewLM provides multiple Docker configurations:

| Configuration | Purpose | File | Use Case |
|--------------|---------|------|----------|
| **Production** | Production-ready build | `docker-compose.yml` | Deployment, staging |
| **Development** | Hot-reload development | `docker-compose.dev.yml` | Local development |
| **Testing** | Integration testing | `docker-compose.test.yml` | Running tests |

### Architecture

```
┌─────────────────────────────────────────┐
│          Next.js Application             │
│  Dev: 3002:3000 | Prod: 3000:3000        │
│  - Frontend + Backend API Routes         │
│  - Auth.js Authentication                │
│  - Prisma ORM                            │
└─────────────┬───────────────────────────┘
              │
              ├─────────────────────────────┐
              │                             │
┌─────────────▼────────────┐  ┌────────────▼─────────┐
│   PostgreSQL Database     │  │   pgAdmin (Optional)  │
│ Dev: 5433:5432            │  │   (Port 5050)         │
│ Prod: 5432:5432           │  │  - DB Management UI   │
│  - User data              │  └──────────────────────┘
│  - Organizations          │
│  - Assessments            │
│  - Candidates             │
└──────────────────────────┘

Port Format: HOST:CONTAINER
```

---

## Prerequisites

### Required

- **Docker Desktop** (v20.10+)
  - [Download for Mac](https://docs.docker.com/desktop/install/mac-install/)
  - [Download for Windows](https://docs.docker.com/desktop/install/windows-install/)
  - [Download for Linux](https://docs.docker.com/desktop/install/linux-install/)

- **Docker Compose** (v2.0+)
  - Included with Docker Desktop
  - Linux: `sudo apt-get install docker-compose-plugin`

### Verify Installation

```bash
docker --version
# Docker version 20.10.x

docker-compose --version
# Docker Compose version v2.x.x
```

---

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/your-org/interviewlm-cs.git
cd interviewlm-cs
```

### 2. Start Development Environment

```bash
# Option A: Using npm script
npm run docker:dev

# Option B: Using helper script
./scripts/docker-dev.sh start

# Option C: Using docker-compose directly
docker-compose -f docker-compose.dev.yml up -d
```

### 3. Access the Application

**Development Mode:**
- **App**: http://localhost:3002
- **Database**: localhost:5433 (host) → 5432 (container)
  - User: `postgres`
  - Password: `postgres`
  - Database: `interviewlm`

**Production Mode:**
- **App**: http://localhost:3000
- **Database**: localhost:5432
  - User: `postgres`
  - Password: `postgres`
  - Database: `interviewlm`

### 4. View Logs

```bash
npm run docker:dev:logs
# or
./scripts/docker-dev.sh logs
```

### 5. Stop Environment

```bash
npm run docker:dev:stop
# or
./scripts/docker-dev.sh stop
```

---

## Development Mode

### Features

- ✅ Hot-reload (code changes reflect immediately)
- ✅ Source code mounted as volume
- ✅ Auto-install dependencies
- ✅ Prisma schema auto-sync
- ✅ PostgreSQL database

### Start Development

```bash
./scripts/docker-dev.sh start
```

This will:
1. Start PostgreSQL container
2. Wait for database to be healthy
3. Install npm dependencies
4. Generate Prisma client
5. Push database schema
6. Start Next.js dev server

### Helper Commands

```bash
# View real-time logs
./scripts/docker-dev.sh logs

# Open shell in app container
./scripts/docker-dev.sh shell

# Open PostgreSQL shell
./scripts/docker-dev.sh db

# Run database migrations
./scripts/docker-dev.sh migrate

# Open Prisma Studio
./scripts/docker-dev.sh studio

# Restart containers
./scripts/docker-dev.sh restart

# View container status
./scripts/docker-dev.sh status

# Clean everything (removes volumes)
./scripts/docker-dev.sh clean
```

### Development Workflow

```bash
# 1. Start environment
./scripts/docker-dev.sh start

# 2. Make code changes (auto-reloads)
# Edit files in your editor

# 3. Run migrations when schema changes
./scripts/docker-dev.sh migrate

# 4. View logs if needed
./scripts/docker-dev.sh logs

# 5. Stop when done
./scripts/docker-dev.sh stop
```

### Environment Variables

Create `.env` file:

```env
# Database (container-to-container, always use internal port 5432)
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/interviewlm

# NextAuth (use host port for dev mode)
NEXTAUTH_SECRET=development-secret
NEXTAUTH_URL=http://localhost:3002

# OAuth (optional)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_secret
```

**Important Notes:**
- **DATABASE_URL** uses `postgres:5432` (internal container hostname and port) for container-to-container communication
- **NEXTAUTH_URL** uses `localhost:3002` (host port) for development mode
- When connecting from your **host machine** (e.g., using pgAdmin or Prisma Studio locally), use `localhost:5433`
- When connecting from **inside containers**, use `postgres:5432`

---

## Production Mode

### Build Production Image

```bash
# Build the Docker image
docker build -t interviewlm-app .

# Or use npm script
npm run docker:build
```

### Run Production Stack

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Production Features

- ✅ Multi-stage build (optimized size)
- ✅ Standalone Next.js output
- ✅ Non-root user for security
- ✅ Health checks
- ✅ Auto-restart on failure
- ✅ Automatic migrations on startup

### Deployment

**AWS App Runner:**
```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin xxx.dkr.ecr.us-east-1.amazonaws.com
docker build -t interviewlm-app .
docker tag interviewlm-app:latest xxx.dkr.ecr.us-east-1.amazonaws.com/interviewlm-app:latest
docker push xxx.dkr.ecr.us-east-1.amazonaws.com/interviewlm-app:latest
```

**GCP Cloud Run:**
```bash
# Build and deploy
gcloud builds submit --tag gcr.io/PROJECT_ID/interviewlm-app
gcloud run deploy interviewlm --image gcr.io/PROJECT_ID/interviewlm-app --platform managed
```

---

## Testing with Docker

### Real Database Integration Tests

Our integration tests run against a real PostgreSQL database in Docker, providing:
- ✅ Actual database queries (no mocks)
- ✅ Transaction testing
- ✅ Relationship validation
- ✅ Constraint enforcement
- ✅ Performance testing

### Run Integration Tests

```bash
# Option A: Using npm script
npm run docker:test

# Option B: Using helper script
./scripts/docker-test.sh run

# Option C: Watch mode (interactive)
./scripts/docker-test.sh interactive
```

### Test Commands

```bash
# Run all integration tests
./scripts/docker-test.sh run

# Run tests in watch mode
./scripts/docker-test.sh interactive

# Generate coverage report
./scripts/docker-test.sh coverage

# Start test database only
./scripts/docker-test.sh start

# Open PostgreSQL shell in test DB
./scripts/docker-test.sh db

# Clean test environment
./scripts/docker-test.sh clean
```

### Test Workflow

```bash
# 1. Run tests
npm run docker:test

# Output:
# Starting test environment...
# Building test-runner container...
# Running integration tests...
# ✓ User CRUD Operations
# ✓ Organization Relationships
# All tests passed!
# Cleaning up...
```

### Writing Integration Tests

Create tests in `__tests__/integration/database/`:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

describe('My Integration Test', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.user.deleteMany()
    await prisma.$disconnect()
  })

  it('should test real database operation', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        password: 'hashed_password',
      },
    })

    expect(user).toBeDefined()
    expect(user.email).toBe('test@example.com')
  })
})
```

### Test Database Configuration

The test database uses:
- **Port**: 5433 (avoids conflicts)
- **User**: testuser
- **Password**: testpassword
- **Database**: interviewlm_test
- **Storage**: tmpfs (in-memory, faster tests)

---

## Docker Commands Reference

### NPM Scripts

```bash
# Development
npm run docker:dev           # Start dev environment
npm run docker:dev:stop      # Stop dev environment
npm run docker:dev:logs      # View logs

# Testing
npm run docker:test          # Run integration tests
npm run docker:test:watch    # Watch mode

# Production
npm run docker:build         # Build production image
npm run docker:up            # Start production stack
npm run docker:down          # Stop production stack
```

### Helper Scripts

```bash
# Development Helper
./scripts/docker-dev.sh [command]
# Commands: start, stop, restart, logs, shell, db, clean, rebuild, status, migrate, studio

# Test Helper
./scripts/docker-test.sh [command]
# Commands: run, start, stop, logs, shell, db, interactive, coverage, clean
```

### Direct Docker Compose

```bash
# Development
docker-compose -f docker-compose.dev.yml up -d
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml logs -f

# Production
docker-compose up -d
docker-compose down
docker-compose logs -f

# Testing
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
docker-compose -f docker-compose.test.yml down -v
```

---

## Troubleshooting

### Port Already in Use

**Problem**: Port 3000 or 5432 is already in use

**Solution**:
```bash
# Find process using port
lsof -i :3000
lsof -i :5432

# Kill process
kill -9 <PID>

# Or change port in docker-compose file
```

### Database Connection Failed

**Problem**: App can't connect to database

**Solution**:
```bash
# Check database health
docker-compose ps

# View database logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres

# Wait for health check
docker-compose -f docker-compose.dev.yml up -d
# Wait 10 seconds for database to be ready
```

### Out of Memory

**Problem**: Docker runs out of memory

**Solution**:
```bash
# Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory
# Set to at least 4GB

# Or clean up
docker system prune -a
docker volume prune
```

### Prisma Client Not Generated

**Problem**: `@prisma/client` module not found

**Solution**:
```bash
# Regenerate Prisma client
docker-compose exec app-dev npx prisma generate

# Or rebuild container
./scripts/docker-dev.sh rebuild
```

### Hot Reload Not Working

**Problem**: Code changes don't reflect

**Solution**:
```bash
# Check WATCHPACK_POLLING is set
# In docker-compose.dev.yml:
environment:
  WATCHPACK_POLLING: 'true'

# Or restart container
./scripts/docker-dev.sh restart
```

### Permission Denied on Scripts

**Problem**: Cannot execute helper scripts

**Solution**:
```bash
# Make scripts executable
chmod +x scripts/docker-dev.sh
chmod +x scripts/docker-test.sh
```

### Test Database Issues

**Problem**: Tests fail with database errors

**Solution**:
```bash
# Clean test environment
./scripts/docker-test.sh clean

# Start fresh
./scripts/docker-test.sh run
```

---

## Best Practices

### Development

1. **Use helper scripts** for common tasks
   ```bash
   ./scripts/docker-dev.sh start
   ```

2. **Keep containers running** during development
   - Faster than starting/stopping repeatedly
   - Use `restart` instead of `stop/start`

3. **Use Prisma Studio** for database exploration
   ```bash
   ./scripts/docker-dev.sh studio
   ```

4. **Monitor logs** when debugging
   ```bash
   ./scripts/docker-dev.sh logs
   ```

### Testing

1. **Run tests before commits**
   ```bash
   npm run docker:test
   ```

2. **Use watch mode** when writing tests
   ```bash
   ./scripts/docker-test.sh interactive
   ```

3. **Clean test environment** periodically
   ```bash
   ./scripts/docker-test.sh clean
   ```

### Production

1. **Use multi-stage builds** (already configured)
2. **Set proper environment variables**
3. **Use Docker secrets** for sensitive data
4. **Enable health checks** (already configured)
5. **Use non-root user** (already configured)
6. **Set resource limits**
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1'
         memory: 512M
   ```

### Cleanup

```bash
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Nuclear option (removes everything)
docker system prune -a --volumes
```

---

## Advanced Configuration

### Custom Network

```bash
# Create custom network
docker network create interviewlm-net

# Use in docker-compose.yml
networks:
  default:
    external:
      name: interviewlm-net
```

### Persistent Data

Volumes are used for persistent data:
- `postgres_data`: Production database
- `postgres_dev_data`: Development database
- `pgadmin_data`: pgAdmin configuration

### pgAdmin (Database GUI)

Optional database management UI:

```bash
# Start with pgAdmin
docker-compose --profile tools up -d

# Access pgAdmin
# URL: http://localhost:5050
# Email: admin@interviewlm.com
# Password: admin

# Add server connection:
# Host: postgres
# Port: 5432
# Username: postgres
# Password: postgres
```

---

## Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Next.js Docker Documentation](https://nextjs.org/docs/deployment#docker-image)
- [Prisma Docker Guide](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-docker)

---

**Need help?** Open an issue or check the [main documentation](../README.md).

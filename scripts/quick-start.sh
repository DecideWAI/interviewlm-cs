#!/bin/bash

# Quick Start Script for InterviewLM
#
# This script helps developers get up and running quickly.
#
# Usage: ./scripts/quick-start.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════════════╗
║                                               ║
║         InterviewLM Quick Start               ║
║                                               ║
╚═══════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Check Node.js
echo -e "${YELLOW}Checking prerequisites...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be 18 or higher (found: $(node -v))${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ npm $(npm -v)${NC}"
echo ""

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Check for .env
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}📝 Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Please update .env with your actual credentials:${NC}"
    echo "   1. ANTHROPIC_API_KEY (required)"
    echo "   2. DATABASE_URL (required)"
    echo "   3. NEXTAUTH_SECRET (generate with: openssl rand -base64 32)"
    echo ""
    read -p "Press Enter when you've updated .env..."
else
    echo -e "${GREEN}✅ .env file exists${NC}"
fi
echo ""

# Check required env vars
echo -e "${YELLOW}🔍 Checking required environment variables...${NC}"

source .env

MISSING_VARS=()
[ -z "$ANTHROPIC_API_KEY" ] && MISSING_VARS+=("ANTHROPIC_API_KEY")
[ -z "$DATABASE_URL" ] && MISSING_VARS+=("DATABASE_URL")
[ -z "$NEXTAUTH_SECRET" ] && MISSING_VARS+=("NEXTAUTH_SECRET")

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}❌ Missing required environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Please update .env and run this script again"
    exit 1
fi

echo -e "${GREEN}✅ Required environment variables are set${NC}"
echo ""

# Check if Modal CLI is installed
echo -e "${YELLOW}🔍 Checking for Modal CLI...${NC}"
if ! command -v modal &> /dev/null; then
    echo -e "${YELLOW}⚠️  Modal CLI not found${NC}"
    echo ""
    echo "Modal is required for code execution. Install it with:"
    echo "  pip install modal"
    echo ""
    read -p "Do you want to skip Modal setup for now? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    SKIP_MODAL=true
else
    echo -e "${GREEN}✅ Modal CLI found${NC}"
    SKIP_MODAL=false
fi
echo ""

# Deploy Modal (if not skipped)
if [ "$SKIP_MODAL" = false ]; then
    echo -e "${YELLOW}🚀 Would you like to deploy Modal now? (y/n)${NC}"
    read -p "> " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -f "scripts/deploy-modal.sh" ]; then
            ./scripts/deploy-modal.sh
        else
            echo -e "${RED}❌ deploy-modal.sh not found${NC}"
            echo "Please deploy Modal manually: modal deploy modal_executor.py"
        fi
    else
        echo -e "${YELLOW}⚠️  Skipping Modal deployment${NC}"
        echo "You can deploy later with: ./scripts/deploy-modal.sh"
    fi
    echo ""
fi

# Database setup
echo -e "${YELLOW}🗄️  Setting up database...${NC}"

# Generate Prisma client
npx prisma generate

# Check if database is accessible
if npx prisma db execute --stdin <<< "SELECT 1" &> /dev/null; then
    echo -e "${GREEN}✅ Database connection successful${NC}"

    # Push schema
    echo -e "${YELLOW}Pushing database schema...${NC}"
    npx prisma db push --accept-data-loss

    echo -e "${GREEN}✅ Database schema updated${NC}"
else
    echo -e "${RED}❌ Could not connect to database${NC}"
    echo ""
    echo "Please check your DATABASE_URL in .env"
    echo ""
    echo "For local development, you can start a PostgreSQL database with Docker:"
    echo "  docker run --name postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=interviewlm -p 5432:5432 -d postgres:16"
    echo ""
    echo "Then update DATABASE_URL in .env:"
    echo "  DATABASE_URL=\"postgresql://postgres:password@localhost:5432/interviewlm\""
    echo ""
fi
echo ""

# Summary
echo -e "${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════════════╗
║                                               ║
║           ✅ Setup Complete!                   ║
║                                               ║
╚═══════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "  1. Start development server:"
echo -e "     ${GREEN}npm run dev${NC}"
echo ""
echo "  2. Open http://localhost:3000 in your browser"
echo ""
echo "  3. Create an account and start interviewing!"
echo ""

if [ "$SKIP_MODAL" = true ] || [ -z "$MODAL_EXECUTE_URL" ]; then
    echo -e "${YELLOW}⚠️  Note: Code execution won't work until you deploy Modal${NC}"
    echo "   Deploy with: ./scripts/deploy-modal.sh"
    echo ""
fi

echo -e "${BLUE}Useful commands:${NC}"
echo "  npm run dev          - Start development server"
echo "  npx prisma studio    - Open database GUI"
echo "  npm run build        - Build for production"
echo "  npm run lint         - Lint code"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  README.md                    - Project overview"
echo "  CLAUDE.md                    - Development guide"
echo "  PRODUCTION_REFACTOR.md       - Recent improvements"
echo "  docs/PRODUCTION_DEPLOYMENT.md - Deployment guide"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"
echo ""

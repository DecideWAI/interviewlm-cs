#!/bin/bash

# Deploy Modal Executor Script
#
# This script deploys the Modal code execution service and updates .env with the endpoints.
#
# Usage:
#   ./scripts/deploy-modal.sh [--env production|development]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default environment
ENV_FILE=".env"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      if [ "$2" = "production" ]; then
        ENV_FILE=".env.production"
      elif [ "$2" = "development" ]; then
        ENV_FILE=".env"
      else
        echo -e "${RED}Error: Invalid environment. Use 'production' or 'development'${NC}"
        exit 1
      fi
      shift 2
      ;;
    *)
      echo -e "${RED}Error: Unknown argument $1${NC}"
      echo "Usage: $0 [--env production|development]"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Modal Executor Deployment Script     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if modal is installed
if ! command -v modal &> /dev/null; then
    echo -e "${RED}❌ Modal CLI not found${NC}"
    echo ""
    echo "Please install Modal:"
    echo "  pip install modal"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Modal CLI found${NC}"
echo ""

# Check if modal_executor.py exists
if [ ! -f "modal_executor.py" ]; then
    echo -e "${RED}❌ modal_executor.py not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Check if user is authenticated with Modal
echo -e "${YELLOW}🔐 Checking Modal authentication...${NC}"
if ! modal token show &> /dev/null; then
    echo -e "${RED}❌ Not authenticated with Modal${NC}"
    echo ""
    echo "Please authenticate first:"
    echo "  modal token new"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Modal authentication OK${NC}"
echo ""

# Deploy to Modal
echo -e "${YELLOW}🚀 Deploying Modal executor...${NC}"
echo ""

# Capture deployment output
DEPLOY_OUTPUT=$(modal deploy modal_executor.py 2>&1)
DEPLOY_EXIT_CODE=$?

if [ $DEPLOY_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    echo ""
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

echo "$DEPLOY_OUTPUT"
echo ""

# Extract endpoint URLs from deployment output
echo -e "${YELLOW}📝 Extracting endpoint URLs...${NC}"

EXECUTE_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[^[:space:]]*execute\.modal\.run' | head -1)
WRITE_FILE_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[^[:space:]]*write-file\.modal\.run' | head -1)
READ_FILE_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[^[:space:]]*read-file\.modal\.run' | head -1)
LIST_FILES_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[^[:space:]]*list-files\.modal\.run' | head -1)
EXECUTE_COMMAND_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[^[:space:]]*execute-command\.modal\.run' | head -1)

# Check if we got all URLs
MISSING_URLS=()
[ -z "$EXECUTE_URL" ] && MISSING_URLS+=("MODAL_EXECUTE_URL")
[ -z "$WRITE_FILE_URL" ] && MISSING_URLS+=("MODAL_WRITE_FILE_URL")
[ -z "$READ_FILE_URL" ] && MISSING_URLS+=("MODAL_READ_FILE_URL")
[ -z "$LIST_FILES_URL" ] && MISSING_URLS+=("MODAL_LIST_FILES_URL")
[ -z "$EXECUTE_COMMAND_URL" ] && MISSING_URLS+=("MODAL_EXECUTE_COMMAND_URL")

if [ ${#MISSING_URLS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Could not extract all endpoint URLs automatically${NC}"
    echo ""
    echo "Missing: ${MISSING_URLS[*]}"
    echo ""
    echo "Please manually update $ENV_FILE with the endpoint URLs"
    echo "You can find them in the deployment output above"
    exit 0
fi

echo -e "${GREEN}✅ Extracted all endpoint URLs${NC}"
echo ""

# Update .env file
echo -e "${YELLOW}💾 Updating $ENV_FILE...${NC}"

# Create .env file if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  $ENV_FILE not found, creating from .env.example...${NC}"
    cp .env.example "$ENV_FILE"
fi

# Function to update or add env variable
update_env_var() {
    local KEY=$1
    local VALUE=$2
    local FILE=$3

    if grep -q "^${KEY}=" "$FILE"; then
        # Update existing
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|^${KEY}=.*|${KEY}=\"${VALUE}\"|" "$FILE"
        else
            # Linux
            sed -i "s|^${KEY}=.*|${KEY}=\"${VALUE}\"|" "$FILE"
        fi
    else
        # Add new
        echo "${KEY}=\"${VALUE}\"" >> "$FILE"
    fi
}

# Update all Modal URLs
update_env_var "MODAL_EXECUTE_URL" "$EXECUTE_URL" "$ENV_FILE"
update_env_var "MODAL_WRITE_FILE_URL" "$WRITE_FILE_URL" "$ENV_FILE"
update_env_var "MODAL_READ_FILE_URL" "$READ_FILE_URL" "$ENV_FILE"
update_env_var "MODAL_LIST_FILES_URL" "$LIST_FILES_URL" "$ENV_FILE"
update_env_var "MODAL_EXECUTE_COMMAND_URL" "$EXECUTE_COMMAND_URL" "$ENV_FILE"

echo -e "${GREEN}✅ Updated $ENV_FILE${NC}"
echo ""

# Test the endpoint
echo -e "${YELLOW}🧪 Testing code execution endpoint...${NC}"
echo ""

TEST_RESPONSE=$(curl -s -X POST "$EXECUTE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "def solution(x): return x * 2",
    "testCases": [{"name": "test_1", "input": {"x": 2}, "expected": 4}],
    "language": "python"
  }')

if echo "$TEST_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Code execution test passed${NC}"
else
    echo -e "${RED}❌ Code execution test failed${NC}"
    echo "Response: $TEST_RESPONSE"
    exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✅ Deployment Successful!           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Endpoint URLs:${NC}"
echo -e "  MODAL_EXECUTE_URL=${EXECUTE_URL}"
echo -e "  MODAL_WRITE_FILE_URL=${WRITE_FILE_URL}"
echo -e "  MODAL_READ_FILE_URL=${READ_FILE_URL}"
echo -e "  MODAL_LIST_FILES_URL=${LIST_FILES_URL}"
echo -e "  MODAL_EXECUTE_COMMAND_URL=${EXECUTE_COMMAND_URL}"
echo ""
echo -e "${BLUE}Updated file:${NC} $ENV_FILE"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Verify endpoints are in your $ENV_FILE"
echo "  2. Restart your development server: npm run dev"
echo "  3. Test interview flow with code execution"
echo ""

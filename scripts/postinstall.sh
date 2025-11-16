#!/bin/bash

echo "🔧 Running postinstall script..."

# Check if we should skip Prisma generation
if [ "$SKIP_PRISMA_GENERATE" = "true" ]; then
  echo "⏭️  Skipping Prisma generation (SKIP_PRISMA_GENERATE=true)"
  exit 0
fi

# Try to generate Prisma client with retries
MAX_RETRIES=3
RETRY_COUNT=0

echo "📦 Attempting to generate Prisma client..."

until PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
  RETRY_COUNT=$((RETRY_COUNT+1))
  echo "⚠️  Prisma generate failed, retrying ($RETRY_COUNT/$MAX_RETRIES)..."
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "❌ Warning: Prisma generate failed after $MAX_RETRIES attempts"
  echo "⚠️  Build will continue but database operations may fail at runtime"
  echo "💡 Consider using Prisma Accelerate or Data Proxy for serverless deployments"
  exit 0 # Don't fail the build - allow deployment to proceed
fi

echo "✅ Prisma client generated successfully"

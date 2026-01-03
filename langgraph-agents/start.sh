#!/bin/bash
set -e

echo "Running database migrations..."

# Run migrations
# If migration fails due to existing tables with wrong schema, clean up and retry
migration_output=$(alembic upgrade head 2>&1) || {
    echo "Migration encountered an issue: $migration_output"

    if echo "$migration_output" | grep -q "DuplicateTableError\|already exists"; then
        echo "Detected schema conflict - dropping Aegra tables to recreate..."

        # Drop Aegra-specific tables that conflict
        python3 -c "
import os
import asyncio
import asyncpg

async def drop_tables():
    url = os.environ.get('DATABASE_URL', '').replace('+asyncpg', '')
    conn = await asyncpg.connect(url)
    try:
        # Drop all Aegra tables that may have wrong schema (order matters for foreign keys)
        await conn.execute('DROP TABLE IF EXISTS assistant_versions CASCADE')
        await conn.execute('DROP TABLE IF EXISTS context CASCADE')
        await conn.execute('DROP TABLE IF EXISTS run CASCADE')
        await conn.execute('DROP TABLE IF EXISTS thread CASCADE')
        await conn.execute('DROP TABLE IF EXISTS assistant CASCADE')
        await conn.execute('DROP TABLE IF EXISTS alembic_version CASCADE')
        print('Dropped conflicting tables')
    finally:
        await conn.close()

asyncio.run(drop_tables())
"
        echo "Retrying migrations..."
        alembic upgrade head
    else
        echo "Migration failed with unexpected error"
        exit 1
    fi
}

echo "Migrations complete!"
echo "Starting Aegra server..."
exec uvicorn src.agent_server.main:app --host 0.0.0.0 --port 8000 --log-level info

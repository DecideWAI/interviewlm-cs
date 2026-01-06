-- Ensure AgentBackend enum and columns exist
-- Previous migration recorded as applied but SQL may have failed silently

-- Step 1: Create enum type if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AgentBackend') THEN
        CREATE TYPE "AgentBackend" AS ENUM ('CLAUDE_SDK', 'LANGGRAPH');
    END IF;
END
$$;

-- Step 2: Add columns to session_recordings if they don't exist
DO $$
BEGIN
    -- tracked_files column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'session_recordings' AND column_name = 'tracked_files') THEN
        ALTER TABLE "session_recordings" ADD COLUMN "tracked_files" JSONB DEFAULT '[]';
    END IF;

    -- agent_backend column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'session_recordings' AND column_name = 'agent_backend') THEN
        ALTER TABLE "session_recordings" ADD COLUMN "agent_backend" "AgentBackend";
    END IF;

    -- experiment_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'session_recordings' AND column_name = 'experiment_id') THEN
        ALTER TABLE "session_recordings" ADD COLUMN "experiment_id" TEXT;
    END IF;

    -- question_backend column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'session_recordings' AND column_name = 'question_backend') THEN
        ALTER TABLE "session_recordings" ADD COLUMN "question_backend" "AgentBackend";
    END IF;

    -- question_experiment_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'session_recordings' AND column_name = 'question_experiment_id') THEN
        ALTER TABLE "session_recordings" ADD COLUMN "question_experiment_id" TEXT;
    END IF;
END
$$;

-- Step 3: Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS "session_recordings_agent_backend_idx" ON "session_recordings"("agent_backend");

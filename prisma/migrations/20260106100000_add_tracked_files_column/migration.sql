-- Add missing columns to session_recordings table
-- These columns were added to the Prisma schema but migrations were never created

-- Create AgentBackend enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "AgentBackend" AS ENUM ('CLAUDE_SDK', 'LANGGRAPH');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add tracked_files - array of file paths created during session
ALTER TABLE "session_recordings" ADD COLUMN IF NOT EXISTS "tracked_files" JSONB DEFAULT '[]';

-- Add agent backend assignment columns
ALTER TABLE "session_recordings" ADD COLUMN IF NOT EXISTS "agent_backend" "AgentBackend";
ALTER TABLE "session_recordings" ADD COLUMN IF NOT EXISTS "experiment_id" TEXT;

-- Add question generation backend assignment columns
ALTER TABLE "session_recordings" ADD COLUMN IF NOT EXISTS "question_backend" "AgentBackend";
ALTER TABLE "session_recordings" ADD COLUMN IF NOT EXISTS "question_experiment_id" TEXT;

-- Add index for agent_backend queries
CREATE INDEX IF NOT EXISTS "session_recordings_agent_backend_idx" ON "session_recordings"("agent_backend");

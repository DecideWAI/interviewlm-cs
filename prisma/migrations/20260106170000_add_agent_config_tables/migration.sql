-- Add AgentConfig and experiment tables
-- These tables support A/B testing of different agent backends (LangGraph vs Claude SDK)

-- Step 1: Create ExperimentStatus enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExperimentStatus') THEN
        CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');
    END IF;
END
$$;

-- Step 2: Create agent_configs table
CREATE TABLE IF NOT EXISTS "agent_configs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "assessment_id" TEXT,
    "default_backend" "AgentBackend" NOT NULL DEFAULT 'LANGGRAPH',
    "enable_experiments" BOOLEAN NOT NULL DEFAULT false,
    "fallback_backend" "AgentBackend" NOT NULL DEFAULT 'LANGGRAPH',
    "langgraph_weight" INTEGER NOT NULL DEFAULT 100,
    "claude_sdk_weight" INTEGER NOT NULL DEFAULT 0,
    "question_default_backend" "AgentBackend" NOT NULL DEFAULT 'CLAUDE_SDK',
    "question_enable_experiments" BOOLEAN NOT NULL DEFAULT false,
    "question_langgraph_weight" INTEGER NOT NULL DEFAULT 0,
    "question_claude_sdk_weight" INTEGER NOT NULL DEFAULT 100,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create unique constraint and indexes for agent_configs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_configs_organization_id_assessment_id_key') THEN
        ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_organization_id_assessment_id_key" UNIQUE ("organization_id", "assessment_id");
    END IF;
END
$$;
CREATE INDEX IF NOT EXISTS "agent_configs_is_active_idx" ON "agent_configs"("is_active");

-- Step 3: Create agent_experiments table
CREATE TABLE IF NOT EXISTS "agent_experiments" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "control_backend" "AgentBackend" NOT NULL DEFAULT 'LANGGRAPH',
    "treatment_backend" "AgentBackend" NOT NULL DEFAULT 'CLAUDE_SDK',
    "control_percent" INTEGER NOT NULL DEFAULT 50,
    "treatment_percent" INTEGER NOT NULL DEFAULT 50,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "control_sessions" INTEGER NOT NULL DEFAULT 0,
    "treatment_sessions" INTEGER NOT NULL DEFAULT 0,
    "control_avg_score" DOUBLE PRECISION,
    "treatment_avg_score" DOUBLE PRECISION,
    "targeting_rules" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    CONSTRAINT "agent_experiments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_experiments_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "agent_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_experiments_config_id_status_idx" ON "agent_experiments"("config_id", "status");
CREATE INDEX IF NOT EXISTS "agent_experiments_status_idx" ON "agent_experiments"("status");

-- Step 4: Create agent_experiment_assignments table
CREATE TABLE IF NOT EXISTS "agent_experiment_assignments" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "assigned_backend" "AgentBackend" NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_completed" BOOLEAN NOT NULL DEFAULT false,
    "overall_score" DOUBLE PRECISION,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "agent_experiment_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_experiment_assignments_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "agent_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create unique constraint on session_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_experiment_assignments_session_id_key') THEN
        ALTER TABLE "agent_experiment_assignments" ADD CONSTRAINT "agent_experiment_assignments_session_id_key" UNIQUE ("session_id");
    END IF;
END
$$;
CREATE INDEX IF NOT EXISTS "agent_experiment_assignments_experiment_id_variant_idx" ON "agent_experiment_assignments"("experiment_id", "variant");
CREATE INDEX IF NOT EXISTS "agent_experiment_assignments_candidate_id_idx" ON "agent_experiment_assignments"("candidate_id");

-- Step 5: Create question_experiments table
CREATE TABLE IF NOT EXISTS "question_experiments" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "control_backend" "AgentBackend" NOT NULL DEFAULT 'CLAUDE_SDK',
    "treatment_backend" "AgentBackend" NOT NULL DEFAULT 'LANGGRAPH',
    "control_percent" INTEGER NOT NULL DEFAULT 50,
    "treatment_percent" INTEGER NOT NULL DEFAULT 50,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "control_sessions" INTEGER NOT NULL DEFAULT 0,
    "treatment_sessions" INTEGER NOT NULL DEFAULT 0,
    "control_avg_latency" DOUBLE PRECISION,
    "treatment_avg_latency" DOUBLE PRECISION,
    "targeting_rules" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    CONSTRAINT "question_experiments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "question_experiments_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "agent_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "question_experiments_config_id_status_idx" ON "question_experiments"("config_id", "status");
CREATE INDEX IF NOT EXISTS "question_experiments_status_idx" ON "question_experiments"("status");

-- Step 6: Create question_experiment_assignments table
CREATE TABLE IF NOT EXISTS "question_experiment_assignments" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "assigned_backend" "AgentBackend" NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generation_latency" DOUBLE PRECISION,
    "question_id" TEXT,
    CONSTRAINT "question_experiment_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "question_experiment_assignments_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "question_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create unique constraint on session_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_experiment_assignments_session_id_key') THEN
        ALTER TABLE "question_experiment_assignments" ADD CONSTRAINT "question_experiment_assignments_session_id_key" UNIQUE ("session_id");
    END IF;
END
$$;
CREATE INDEX IF NOT EXISTS "question_experiment_assignments_experiment_id_variant_idx" ON "question_experiment_assignments"("experiment_id", "variant");
CREATE INDEX IF NOT EXISTS "question_experiment_assignments_candidate_id_idx" ON "question_experiment_assignments"("candidate_id");

-- Step 7: Insert default global AgentConfig (if it doesn't exist)
INSERT INTO "agent_configs" (
    "id",
    "organization_id",
    "assessment_id",
    "default_backend",
    "enable_experiments",
    "fallback_backend",
    "langgraph_weight",
    "claude_sdk_weight",
    "question_default_backend",
    "question_enable_experiments",
    "question_langgraph_weight",
    "question_claude_sdk_weight",
    "description",
    "is_active",
    "created_at",
    "updated_at"
)
SELECT
    'default-global-config',
    NULL,
    NULL,
    'LANGGRAPH',
    false,
    'LANGGRAPH',
    100,
    0,
    'CLAUDE_SDK',
    false,
    0,
    100,
    'Default global configuration for all sessions',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "agent_configs" WHERE "id" = 'default-global-config'
);

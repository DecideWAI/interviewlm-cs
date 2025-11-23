/*
  Warnings:

  - A unique constraint covering the columns `[paddle_subscription_id]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "billing_interval" TEXT,
ADD COLUMN     "paddle_subscription_id" TEXT,
ADD COLUMN     "subscription_ends_at" TIMESTAMP(3),
ADD COLUMN     "subscription_status" TEXT;

-- CreateTable
CREATE TABLE "failed_jobs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "queue_name" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "job_data" JSONB NOT NULL,
    "error" JSONB NOT NULL,
    "error_message" TEXT,
    "error_stack" TEXT,
    "attempts_made" INTEGER NOT NULL,
    "failed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technologies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "color" TEXT,
    "detectionPatterns" JSONB DEFAULT '[]',
    "pairedWithIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technologies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "code_quality_score" INTEGER NOT NULL,
    "code_quality_evidence" JSONB NOT NULL,
    "code_quality_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "problem_solving_score" INTEGER NOT NULL,
    "problem_solving_evidence" JSONB NOT NULL,
    "problem_solving_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "ai_collaboration_score" INTEGER NOT NULL,
    "ai_collaboration_evidence" JSONB NOT NULL,
    "ai_collaboration_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "communication_score" INTEGER NOT NULL,
    "communication_evidence" JSONB NOT NULL,
    "communication_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "overall_score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "progressive_score_result" JSONB,
    "expertise_level" TEXT,
    "expertise_growth" DOUBLE PRECISION,
    "expertise_growth_trend" TEXT,
    "biasFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence_metrics" JSONB,
    "bias_detection" JSONB,
    "fairness_report" TEXT,
    "hiring_recommendation" TEXT,
    "hiring_confidence" DOUBLE PRECISION,
    "hiring_reasoning" JSONB,
    "actionable_report" JSONB,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_commands" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "command" TEXT NOT NULL,
    "output" TEXT,
    "exit_code" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "category" TEXT,

    CONSTRAINT "terminal_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "failed_jobs_queue_name_idx" ON "failed_jobs"("queue_name");

-- CreateIndex
CREATE INDEX "failed_jobs_job_name_idx" ON "failed_jobs"("job_name");

-- CreateIndex
CREATE INDEX "failed_jobs_failed_at_idx" ON "failed_jobs"("failed_at");

-- CreateIndex
CREATE UNIQUE INDEX "technologies_slug_key" ON "technologies"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_candidate_id_key" ON "evaluations"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_session_id_key" ON "evaluations"("session_id");

-- CreateIndex
CREATE INDEX "evaluations_candidate_id_idx" ON "evaluations"("candidate_id");

-- CreateIndex
CREATE INDEX "evaluations_session_id_idx" ON "evaluations"("session_id");

-- CreateIndex
CREATE INDEX "evaluations_overall_score_idx" ON "evaluations"("overall_score");

-- CreateIndex
CREATE INDEX "evaluations_evaluated_at_idx" ON "evaluations"("evaluated_at");

-- CreateIndex
CREATE INDEX "terminal_commands_session_id_timestamp_idx" ON "terminal_commands"("session_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_paddle_subscription_id_key" ON "organizations"("paddle_subscription_id");

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_commands" ADD CONSTRAINT "terminal_commands_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

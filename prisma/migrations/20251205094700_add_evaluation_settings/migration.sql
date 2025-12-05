-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "evaluation_threshold" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "require_evaluation" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "claude_interactions" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "generated_questions" ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "iteration_number" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parent_question_id" TEXT,
ADD COLUMN     "reuse_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "question_pool_stats" (
    "id" TEXT NOT NULL,
    "seed_id" TEXT NOT NULL,
    "total_generated" INTEGER NOT NULL DEFAULT 0,
    "unique_questions" INTEGER NOT NULL DEFAULT 0,
    "avg_reuse_count" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_generated_at" TIMESTAMP(3),
    "threshold" INTEGER NOT NULL DEFAULT 100,
    "total_candidates_served" INTEGER NOT NULL DEFAULT 0,
    "avg_uniqueness_score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_pool_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bias_audit_logs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "evaluation_id" TEXT,
    "check_type" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "risk_level" TEXT NOT NULL,
    "biases_detected" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "human_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewer_id" TEXT,
    "review_notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_outcome" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bias_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_pool_stats_seed_id_key" ON "question_pool_stats"("seed_id");

-- CreateIndex
CREATE INDEX "bias_audit_logs_candidate_id_idx" ON "bias_audit_logs"("candidate_id");

-- CreateIndex
CREATE INDEX "bias_audit_logs_risk_level_idx" ON "bias_audit_logs"("risk_level");

-- CreateIndex
CREATE INDEX "bias_audit_logs_created_at_idx" ON "bias_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "bias_audit_logs_human_reviewed_risk_level_idx" ON "bias_audit_logs"("human_reviewed", "risk_level");

-- CreateIndex
CREATE INDEX "generated_questions_question_seed_id_fingerprint_idx" ON "generated_questions"("question_seed_id", "fingerprint");

-- AddForeignKey
ALTER TABLE "generated_questions" ADD CONSTRAINT "generated_questions_parent_question_id_fkey" FOREIGN KEY ("parent_question_id") REFERENCES "generated_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_pool_stats" ADD CONSTRAINT "question_pool_stats_seed_id_fkey" FOREIGN KEY ("seed_id") REFERENCES "problem_seeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('REAL_WORLD', 'SYSTEM_DESIGN');

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "assessment_type" "AssessmentType" NOT NULL DEFAULT 'REAL_WORLD',
ADD COLUMN     "selected_seed_id" TEXT;

-- AlterTable
ALTER TABLE "problem_seeds" ADD COLUMN     "architecture_hints" JSONB,
ADD COLUMN     "assessment_type" "AssessmentType",
ADD COLUMN     "design_doc_template" JSONB,
ADD COLUMN     "evaluation_rubric" JSONB,
ADD COLUMN     "implementation_scope" TEXT,
ADD COLUMN     "is_default_seed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "target_role" TEXT,
ADD COLUMN     "target_seniority" TEXT;

-- CreateIndex
CREATE INDEX "problem_seeds_target_role_target_seniority_idx" ON "problem_seeds"("target_role", "target_seniority");

-- CreateIndex
CREATE INDEX "problem_seeds_assessment_type_idx" ON "problem_seeds"("assessment_type");

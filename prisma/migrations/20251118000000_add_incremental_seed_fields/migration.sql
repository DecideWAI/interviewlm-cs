-- AlterTable: Add new fields for incremental seed support
ALTER TABLE "problem_seeds" ADD COLUMN "seed_type" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "problem_seeds" ADD COLUMN "domain" TEXT;
ALTER TABLE "problem_seeds" ADD COLUMN "required_tech" JSONB;
ALTER TABLE "problem_seeds" ADD COLUMN "base_problem" JSONB;
ALTER TABLE "problem_seeds" ADD COLUMN "progression_hints" JSONB;
ALTER TABLE "problem_seeds" ADD COLUMN "seniority_expectations" JSONB;

-- Add comment for documentation
COMMENT ON COLUMN "problem_seeds"."seed_type" IS 'Type of seed: legacy (complete problem) or incremental (scenario-based)';
COMMENT ON COLUMN "problem_seeds"."domain" IS 'Problem domain (e.g., e-commerce, social-media, fintech)';
COMMENT ON COLUMN "problem_seeds"."required_tech" IS 'Required technology stack: {languages, frameworks, databases, tools}';
COMMENT ON COLUMN "problem_seeds"."base_problem" IS 'Starting problem for incremental assessments: {title, description, starterCode, estimatedTime}';
COMMENT ON COLUMN "problem_seeds"."progression_hints" IS 'Progression strategy: {extensionTopics, simplificationTopics}';
COMMENT ON COLUMN "problem_seeds"."seniority_expectations" IS 'Seniority-specific expectations: {junior, mid, senior, staff, principal}';

-- Make organizationId optional for ProblemSeed to support system-wide seeds
-- System seeds (organizationId IS NULL) are shared across all organizations
-- Organization-specific seeds (organizationId IS NOT NULL) are scoped to that org

-- Step 1: Drop the foreign key constraint
ALTER TABLE "problem_seeds" DROP CONSTRAINT IF EXISTS "problem_seeds_organization_id_fkey";

-- Step 2: Make the column nullable
ALTER TABLE "problem_seeds" ALTER COLUMN "organization_id" DROP NOT NULL;

-- Step 3: Re-add the foreign key constraint (with ON DELETE CASCADE for org-specific seeds)
ALTER TABLE "problem_seeds"
ADD CONSTRAINT "problem_seeds_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 4: Create index for efficient queries that include system seeds
CREATE INDEX IF NOT EXISTS "problem_seeds_organization_id_idx" ON "problem_seeds"("organization_id");

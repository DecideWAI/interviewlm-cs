-- AlterTable
ALTER TABLE "problem_seeds" ADD COLUMN "created_by" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "instructions" TEXT,
ADD COLUMN "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "estimated_time" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "usage_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "avg_candidate_score" DOUBLE PRECISION,
ADD COLUMN "parent_seed_id" TEXT,
ADD COLUMN "is_system_seed" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "problem_seeds" ADD CONSTRAINT "problem_seeds_parent_seed_id_fkey" FOREIGN KEY ("parent_seed_id") REFERENCES "problem_seeds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

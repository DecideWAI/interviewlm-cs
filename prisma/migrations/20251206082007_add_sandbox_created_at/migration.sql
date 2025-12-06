-- AlterTable
ALTER TABLE "assessments" ALTER COLUMN "preview_limit" SET DEFAULT 10;

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "sandbox_created_at" TIMESTAMP(3);

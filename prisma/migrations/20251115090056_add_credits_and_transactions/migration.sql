-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PURCHASE', 'DEDUCTION', 'REFUND', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "preview_limit" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "preview_sessions_used" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "is_preview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "paddle_order_id" TEXT,
    "paddle_payment_id" TEXT,
    "amount_paid" DECIMAL(10,2),
    "currency" TEXT,
    "assessment_id" TEXT,
    "candidate_id" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_transactions_organization_id_idx" ON "credit_transactions"("organization_id");

-- CreateIndex
CREATE INDEX "credit_transactions_paddle_order_id_idx" ON "credit_transactions"("paddle_order_id");

-- CreateIndex
CREATE INDEX "credit_transactions_assessment_id_idx" ON "credit_transactions"("assessment_id");

-- CreateIndex
CREATE INDEX "candidates_is_preview_idx" ON "candidates"("is_preview");

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

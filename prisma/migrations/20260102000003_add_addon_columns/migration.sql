-- Add missing columns to assessment_addons table
ALTER TABLE "assessment_addons" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'USD';
ALTER TABLE "assessment_addons" ADD COLUMN IF NOT EXISTS "paddle_product_id" TEXT;
CREATE INDEX IF NOT EXISTS "assessment_addons_is_active_sort_order_idx" ON "assessment_addons"("is_active", "sort_order");

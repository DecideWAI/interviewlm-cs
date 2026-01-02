-- Add missing columns to assessment_addons table
ALTER TABLE "assessment_addons" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'USD';
ALTER TABLE "assessment_addons" ADD COLUMN IF NOT EXISTS "paddle_product_id" TEXT;
CREATE INDEX IF NOT EXISTS "assessment_addons_is_active_sort_order_idx" ON "assessment_addons"("is_active", "sort_order");

-- Add missing columns to technologies table
ALTER TABLE "technologies" ADD COLUMN IF NOT EXISTS "detection_patterns" JSONB DEFAULT '[]';
ALTER TABLE "technologies" ADD COLUMN IF NOT EXISTS "file_extensions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "technologies" ADD COLUMN IF NOT EXISTS "import_patterns" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "technologies" ADD COLUMN IF NOT EXISTS "content_patterns" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "technologies" ADD COLUMN IF NOT EXISTS "paired_with_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "technologies" ADD COLUMN IF NOT EXISTS "suggested_for_roles" JSONB;
ALTER TABLE "technologies" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN DEFAULT true;
ALTER TABLE "technologies" ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN DEFAULT true;
ALTER TABLE "technologies" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

-- Add foreign key if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'technologies_organization_id_fkey') THEN
        ALTER TABLE "technologies" ADD CONSTRAINT "technologies_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS "technologies_category_idx" ON "technologies"("category");
CREATE INDEX IF NOT EXISTS "technologies_is_system_idx" ON "technologies"("is_system");
CREATE UNIQUE INDEX IF NOT EXISTS "technologies_slug_organization_id_key" ON "technologies"("slug", "organization_id");

-- Drop old unique constraint if exists
DROP INDEX IF EXISTS "technologies_slug_key";

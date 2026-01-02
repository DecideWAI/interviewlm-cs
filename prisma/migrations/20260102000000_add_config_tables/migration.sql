-- Add all configuration tables
-- These tables support the centralized configuration system

-- Enums
DO $$ BEGIN
    CREATE TYPE "OverridePolicy" AS ENUM ('SYSTEM_ONLY', 'BOUNDED', 'FULLY_CUSTOMIZABLE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PlanType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ConfigCategory table
CREATE TABLE IF NOT EXISTS "config_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "overridePolicy" "OverridePolicy" NOT NULL DEFAULT 'SYSTEM_ONLY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "config_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "config_categories_name_key" ON "config_categories"("name");

-- ConfigItem table
CREATE TABLE IF NOT EXISTS "config_items" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "valueType" TEXT NOT NULL,
    "min_value" DOUBLE PRECISION,
    "max_value" DOUBLE PRECISION,
    "allowed_values" JSONB,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "config_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "config_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "config_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "config_items_category_id_key_key" ON "config_items"("category_id", "key");

-- ConfigOverride table
CREATE TABLE IF NOT EXISTS "config_overrides" (
    "id" TEXT NOT NULL,
    "config_item_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_by" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "config_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "config_overrides_config_item_id_fkey" FOREIGN KEY ("config_item_id") REFERENCES "config_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "config_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "config_overrides_config_item_id_organization_id_key" ON "config_overrides"("config_item_id", "organization_id");

-- SecurityConfig table
CREATE TABLE IF NOT EXISTS "security_configs" (
    "id" TEXT NOT NULL,
    "config_type" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "security_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "security_configs_config_type_key" ON "security_configs"("config_type");

-- ModelConfig table
CREATE TABLE IF NOT EXISTS "model_configs" (
    "id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "input_price_per_m_token" DOUBLE PRECISION NOT NULL,
    "output_price_per_m_token" DOUBLE PRECISION NOT NULL,
    "max_tokens" INTEGER NOT NULL,
    "context_window" INTEGER NOT NULL,
    "description" TEXT,
    "use_case" TEXT,
    "recommended_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "model_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "model_configs_model_id_key" ON "model_configs"("model_id");

-- SandboxConfig table
CREATE TABLE IF NOT EXISTS "sandbox_configs" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "docker_image" TEXT NOT NULL,
    "cpu" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "memory_mb" INTEGER NOT NULL DEFAULT 2048,
    "timeout_seconds" INTEGER NOT NULL DEFAULT 3600,
    "max_cpu" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    "max_memory_mb" INTEGER NOT NULL DEFAULT 4096,
    "max_timeout_seconds" INTEGER NOT NULL DEFAULT 7200,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sandbox_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sandbox_configs_language_key" ON "sandbox_configs"("language");

-- RoleConfig table
CREATE TABLE IF NOT EXISTS "role_configs" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "default_duration" INTEGER NOT NULL DEFAULT 60,
    "available_in_tiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "organization_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "role_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "role_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "role_configs_role_id_organization_id_key" ON "role_configs"("role_id", "organization_id");
CREATE INDEX IF NOT EXISTS "role_configs_is_system_idx" ON "role_configs"("is_system");

-- SeniorityConfig table
CREATE TABLE IF NOT EXISTS "seniority_configs" (
    "id" TEXT NOT NULL,
    "seniority_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "experience_years" TEXT,
    "default_duration" INTEGER NOT NULL DEFAULT 60,
    "difficulty_mix" JSONB NOT NULL,
    "scoring_weights" JSONB,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "organization_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seniority_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seniority_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "seniority_configs_seniority_id_organization_id_key" ON "seniority_configs"("seniority_id", "organization_id");
CREATE INDEX IF NOT EXISTS "seniority_configs_is_system_idx" ON "seniority_configs"("is_system");

-- TierConfig table
CREATE TABLE IF NOT EXISTS "tier_configs" (
    "id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "max_custom_questions" INTEGER,
    "max_team_members" INTEGER,
    "custom_roles_allowed" BOOLEAN NOT NULL DEFAULT false,
    "custom_instructions_allowed" BOOLEAN NOT NULL DEFAULT false,
    "advanced_analytics" BOOLEAN NOT NULL DEFAULT false,
    "preview_test_runs" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tier_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tier_configs_tier_id_key" ON "tier_configs"("tier_id");

-- PricingPlan table
CREATE TABLE IF NOT EXISTS "pricing_plans" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "paddle_product_id" TEXT NOT NULL,
    "paddle_price_id" TEXT,
    "credits" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "price_per_credit" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_popular" BOOLEAN NOT NULL DEFAULT false,
    "badge" TEXT,
    "features" JSONB NOT NULL DEFAULT '[]',
    "plan_type" "PlanType" NOT NULL DEFAULT 'ONE_TIME',
    "billing_interval" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "available_from" TIMESTAMP(3),
    "available_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_plans_slug_key" ON "pricing_plans"("slug");
CREATE INDEX IF NOT EXISTS "pricing_plans_is_active_sort_order_idx" ON "pricing_plans"("is_active", "sort_order");
CREATE INDEX IF NOT EXISTS "pricing_plans_plan_type_idx" ON "pricing_plans"("plan_type");

-- AssessmentAddOn table
CREATE TABLE IF NOT EXISTS "assessment_addons" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assessment_addons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_addons_slug_key" ON "assessment_addons"("slug");

-- AssessmentTemplateConfig table
CREATE TABLE IF NOT EXISTS "assessment_template_configs" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "seniority" TEXT NOT NULL,
    "assessment_type" "AssessmentType" NOT NULL DEFAULT 'REAL_WORLD',
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "description" TEXT,
    "recommended_skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assessment_template_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_template_configs_template_id_key" ON "assessment_template_configs"("template_id");

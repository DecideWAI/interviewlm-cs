-- Fix assessment_template_configs table schema
DROP TABLE IF EXISTS "assessment_template_configs";

CREATE TABLE "assessment_template_configs" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "seniority" TEXT NOT NULL,
    "description" TEXT,
    "estimated_duration" INTEGER NOT NULL,
    "problem_count" INTEGER NOT NULL,
    "min_tier" TEXT NOT NULL,
    "question_seeds" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "organization_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assessment_template_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_template_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "assessment_template_configs_template_id_key" ON "assessment_template_configs"("template_id");
CREATE INDEX "assessment_template_configs_role_seniority_idx" ON "assessment_template_configs"("role", "seniority");

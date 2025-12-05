-- CreateTable
CREATE TABLE "complexity_profiles" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "seniority" TEXT NOT NULL,
    "assessmentType" "AssessmentType" NOT NULL,
    "entity_count_min" INTEGER NOT NULL DEFAULT 1,
    "entity_count_max" INTEGER NOT NULL DEFAULT 2,
    "integration_points" INTEGER NOT NULL DEFAULT 0,
    "business_logic" TEXT NOT NULL DEFAULT 'simple',
    "ambiguity_level" TEXT NOT NULL DEFAULT 'clear',
    "time_minutes" INTEGER NOT NULL DEFAULT 45,
    "required_skills" JSONB NOT NULL,
    "optional_skill_pool" JSONB NOT NULL,
    "avoid_skills" JSONB NOT NULL,
    "pick_optional_count" INTEGER NOT NULL DEFAULT 2,
    "domain_pool" JSONB NOT NULL,
    "constraints" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "organization_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complexity_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "complexity_profiles_role_seniority_assessmentType_idx" ON "complexity_profiles"("role", "seniority", "assessmentType");

-- CreateIndex
CREATE UNIQUE INDEX "complexity_profiles_role_seniority_assessmentType_organizat_key" ON "complexity_profiles"("role", "seniority", "assessmentType", "organization_id");

-- AddForeignKey
ALTER TABLE "complexity_profiles" ADD CONSTRAINT "complexity_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

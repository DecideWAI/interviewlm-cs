-- Add B2B domain fields to organizations table
ALTER TABLE "organizations" ADD COLUMN "domain" TEXT;
ALTER TABLE "organizations" ADD COLUMN "domain_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "domain_verification_token" TEXT;
ALTER TABLE "organizations" ADD COLUMN "domain_verification_expires_at" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN "auto_join_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Add unique constraints
CREATE UNIQUE INDEX "organizations_domain_key" ON "organizations"("domain");
CREATE UNIQUE INDEX "organizations_domain_verification_token_key" ON "organizations"("domain_verification_token");

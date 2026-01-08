-- CreateTable: EvidenceEventLink
-- Links evaluation evidence to timeline events for Sentry-like replay
CREATE TABLE "evidence_event_links" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "dimension" VARCHAR(30) NOT NULL,
    "evidence_index" INTEGER NOT NULL,
    "evidence_type" VARCHAR(30) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "importance" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_event_links_pkey" PRIMARY KEY ("id")
);

-- Add session summary fields to Evaluation
ALTER TABLE "evaluations" ADD COLUMN "session_summary" TEXT;
ALTER TABLE "evaluations" ADD COLUMN "session_summary_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "evidence_event_links_evaluation_id_idx" ON "evidence_event_links"("evaluation_id");

-- CreateIndex
CREATE INDEX "evidence_event_links_event_id_idx" ON "evidence_event_links"("event_id");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "evidence_event_links_evaluation_id_event_id_dimension_eviden_key" ON "evidence_event_links"("evaluation_id", "event_id", "dimension", "evidence_index");

-- AddForeignKey
ALTER TABLE "evidence_event_links" ADD CONSTRAINT "evidence_event_links_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_event_links" ADD CONSTRAINT "evidence_event_links_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "session_event_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

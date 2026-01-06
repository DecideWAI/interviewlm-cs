-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventOrigin') THEN
        CREATE TYPE "EventOrigin" AS ENUM ('USER', 'AI', 'SYSTEM');
    END IF;
END$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "session_event_log" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "sequence_number" BIGINT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "origin" "EventOrigin" NOT NULL DEFAULT 'SYSTEM',
    "data" JSONB NOT NULL,
    "question_index" INTEGER,
    "file_path" VARCHAR(500),
    "checkpoint" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "session_event_log_session_id_sequence_number_key" ON "session_event_log"("session_id", "sequence_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "session_event_log_session_id_timestamp_idx" ON "session_event_log"("session_id", "timestamp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "session_event_log_session_id_sequence_number_idx" ON "session_event_log"("session_id", "sequence_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "session_event_log_event_type_idx" ON "session_event_log"("event_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "session_event_log_category_idx" ON "session_event_log"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "session_event_log_origin_idx" ON "session_event_log"("origin");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "session_event_log_session_id_question_index_idx" ON "session_event_log"("session_id", "question_index");

-- AddForeignKey
ALTER TABLE "session_event_log" ADD CONSTRAINT "session_event_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

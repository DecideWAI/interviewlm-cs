-- CreateTable: question_templates
-- Stores shared question definitions that can be reused across candidates
CREATE TABLE "question_templates" (
    "id" TEXT NOT NULL,
    "question_seed_id" TEXT,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'typescript',
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_time" INTEGER NOT NULL,
    "starter_code" JSONB NOT NULL,
    "test_cases" JSONB NOT NULL,
    "difficulty_assessment" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parent_template_id" TEXT,
    "iteration_number" INTEGER NOT NULL DEFAULT 0,
    "usage_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "question_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: candidate_questions
-- Stores candidate-specific question attempts and results
CREATE TABLE "candidate_questions" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "question_template_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "evaluation_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique fingerprint for deduplication
CREATE UNIQUE INDEX "question_templates_fingerprint_key" ON "question_templates"("fingerprint");

-- CreateIndex: question_seed_id for lookup
CREATE INDEX "question_templates_question_seed_id_idx" ON "question_templates"("question_seed_id");

-- CreateIndex: difficulty for filtering
CREATE INDEX "question_templates_difficulty_idx" ON "question_templates"("difficulty");

-- CreateIndex: unique candidate+template combination
CREATE UNIQUE INDEX "candidate_questions_candidate_id_question_template_id_key" ON "candidate_questions"("candidate_id", "question_template_id");

-- CreateIndex: candidate_id and order for sorting
CREATE INDEX "candidate_questions_candidate_id_order_idx" ON "candidate_questions"("candidate_id", "order");

-- CreateIndex: question_template_id for joins
CREATE INDEX "candidate_questions_question_template_id_idx" ON "candidate_questions"("question_template_id");

-- AddForeignKey: parent template self-reference
ALTER TABLE "question_templates" ADD CONSTRAINT "question_templates_parent_template_id_fkey" FOREIGN KEY ("parent_template_id") REFERENCES "question_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: candidate_questions -> candidates
ALTER TABLE "candidate_questions" ADD CONSTRAINT "candidate_questions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: candidate_questions -> question_templates
ALTER TABLE "candidate_questions" ADD CONSTRAINT "candidate_questions_question_template_id_fkey" FOREIGN KEY ("question_template_id") REFERENCES "question_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate data from generated_questions to new tables
-- Step 1: Insert unique questions into question_templates
INSERT INTO "question_templates" (
    "id",
    "question_seed_id",
    "fingerprint",
    "title",
    "description",
    "difficulty",
    "language",
    "requirements",
    "estimated_time",
    "starter_code",
    "test_cases",
    "difficulty_assessment",
    "created_at",
    "parent_template_id",
    "iteration_number",
    "usage_count"
)
SELECT DISTINCT ON (COALESCE(gq.fingerprint, gq.id))
    -- Use existing ID if fingerprint is null, otherwise generate new ID based on fingerprint
    CASE
        WHEN gq.fingerprint IS NULL THEN gq.id
        ELSE 'qt_' || md5(gq.fingerprint)
    END as id,
    gq.question_seed_id,
    COALESCE(gq.fingerprint, gq.id) as fingerprint, -- Use ID as fingerprint if null
    gq.title,
    gq.description,
    gq.difficulty,
    gq.language,
    gq.requirements,
    gq.estimated_time,
    gq.starter_code,
    gq.test_cases,
    gq.difficulty_assessment,
    MIN(gq.created_at) as created_at,
    NULL as parent_template_id, -- Will be updated in a separate step if needed
    gq.iteration_number,
    COUNT(*) OVER (PARTITION BY COALESCE(gq.fingerprint, gq.id)) as usage_count
FROM "generated_questions" gq
ORDER BY COALESCE(gq.fingerprint, gq.id), gq.created_at ASC;

-- Step 2: Insert candidate-specific data into candidate_questions
INSERT INTO "candidate_questions" (
    "id",
    "candidate_id",
    "question_template_id",
    "order",
    "status",
    "started_at",
    "completed_at",
    "score",
    "evaluation_result",
    "created_at"
)
SELECT
    'cq_' || gq.id as id,
    gq.candidate_id,
    CASE
        WHEN gq.fingerprint IS NULL THEN gq.id
        ELSE 'qt_' || md5(gq.fingerprint)
    END as question_template_id,
    gq."order",
    gq.status,
    gq.started_at,
    gq.completed_at,
    gq.score,
    gq.evaluation_result,
    gq.created_at
FROM "generated_questions" gq;

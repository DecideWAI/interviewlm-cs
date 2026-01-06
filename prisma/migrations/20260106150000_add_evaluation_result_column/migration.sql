-- Add evaluation_result column to generated_questions
-- This column stores fast evaluation results for page reload recovery

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'generated_questions' AND column_name = 'evaluation_result') THEN
        ALTER TABLE "generated_questions" ADD COLUMN "evaluation_result" JSONB;
    END IF;
END
$$;

COMMENT ON COLUMN "generated_questions"."evaluation_result" IS 'Fast evaluation result persisted for page reload recovery';

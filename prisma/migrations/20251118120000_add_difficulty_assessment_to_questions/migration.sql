-- Add difficulty assessment field to generated_questions
-- This enables LLM-based difficulty calibration for fair scoring

-- Add difficultyAssessment JSON field
ALTER TABLE "generated_questions" ADD COLUMN "difficulty_assessment" JSONB;

-- Comment explaining the new field
COMMENT ON COLUMN "generated_questions"."difficulty_assessment" IS 'LLM-generated difficulty assessment including score, complexity factors, and justification for dynamic weight calibration';

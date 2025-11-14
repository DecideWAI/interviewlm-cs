/**
 * Dynamic Question Generation Service
 *
 * Generates adaptive coding questions using Claude AI based on candidate
 * performance, difficulty level, and problem seeds. Creates personalized
 * interview experiences with progressive difficulty adjustment.
 */

import prisma from "@/lib/prisma";
import { z } from "zod";
import { getChatCompletion } from "./claude";
import { getCachedQuestion, cacheQuestion } from "./question-cache";
import type { Difficulty, QuestionStatus, GeneratedQuestion } from "@/lib/prisma-types";

// Configuration
const DEFAULT_ESTIMATED_TIME = 30; // minutes
const MIN_DIFFICULTY_SCORE = 0.3;
const MAX_DIFFICULTY_SCORE = 1.0;

// Validation schemas
const generateQuestionParamsSchema = z.object({
  candidateId: z.string(),
  seed: z.string().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  language: z.string().default("typescript"),
  previousPerformance: z.number().min(0).max(1).optional(),
});

type GenerateQuestionParams = z.infer<typeof generateQuestionParamsSchema>;

/**
 * Question generation result
 */
export interface QuestionGenerationResult {
  question: GeneratedQuestion;
  generationTime: number; // milliseconds
  tokensUsed: number;
  adaptedDifficulty: Difficulty;
}

/**
 * Starter code file structure
 */
interface StarterCodeFile {
  fileName: string;
  content: string;
  language: string;
}

/**
 * Test case structure
 */
interface TestCase {
  name: string;
  input: any;
  expected: any;
  hidden: boolean;
  description?: string;
}

/**
 * Build system prompt for question generation
 */
function buildQuestionGenerationPrompt(
  difficulty: Difficulty,
  language: string,
  previousPerformance?: number,
  seedProblem?: any
): string {
  const difficultyGuidance = {
    EASY: "Focus on basic concepts, simple algorithms (e.g., array manipulation, string processing), and fundamental data structures.",
    MEDIUM: "Include algorithmic thinking, efficient solutions, multiple edge cases, and common data structures (hashmaps, stacks, queues).",
    HARD: "Require advanced algorithms, complex problem-solving, optimization techniques, and sophisticated data structures (trees, graphs, dynamic programming).",
  };

  let prompt = `You are an expert technical interviewer creating a coding question for a candidate assessment.

**Requirements:**
- Difficulty Level: ${difficulty}
- Programming Language: ${language}
- ${difficultyGuidance[difficulty]}

**Question Structure:**
Generate a JSON object with the following structure:

\`\`\`json
{
  "title": "Brief, descriptive title (e.g., 'Two Sum', 'Binary Tree Traversal')",
  "description": "Clear problem statement with:\n- Problem overview\n- Input/output specifications\n- Constraints\n- Examples with explanations",
  "requirements": [
    "Specific requirement 1",
    "Specific requirement 2",
    "Performance/complexity requirements"
  ],
  "estimatedTime": 30,
  "starterCode": [
    {
      "fileName": "solution.${language === "typescript" ? "ts" : language === "python" ? "py" : "js"}",
      "content": "// Function signature or class structure with TODO comments",
      "language": "${language}"
    }
  ],
  "testCases": [
    {
      "name": "test_basic",
      "input": {"param1": "value1"},
      "expected": "expected_output",
      "hidden": false,
      "description": "Basic test case"
    },
    {
      "name": "test_edge_case",
      "input": {"param1": "edge_value"},
      "expected": "expected_output",
      "hidden": true,
      "description": "Edge case test"
    }
  ]
}
\`\`\`

**Important Guidelines:**
1. The problem should be realistic and interview-appropriate
2. Include at least 5 test cases (mix of visible and hidden)
3. Starter code should provide clear structure but not the solution
4. Requirements should be specific and testable
5. Problem should be solvable within the estimated time
6. Include edge cases in test suite
${previousPerformance !== undefined ? `\n**Adaptive Difficulty:**\nCandidate's previous performance: ${(previousPerformance * 100).toFixed(0)}%\nAdjust complexity accordingly - ${previousPerformance < 0.5 ? "make it slightly easier" : previousPerformance > 0.8 ? "make it more challenging" : "maintain current difficulty level"}.` : ""}
${seedProblem ? `\n**Base Problem Seed:**\nUse this as inspiration but create a unique variant:\nTitle: ${seedProblem.title}\nCategory: ${seedProblem.category}\nTags: ${seedProblem.tags.join(", ")}` : ""}

Return ONLY the JSON object, no additional text.`;

  return prompt;
}

/**
 * Calculate adaptive difficulty based on previous performance
 */
function calculateAdaptiveDifficulty(
  requestedDifficulty: Difficulty,
  previousPerformance?: number
): Difficulty {
  if (previousPerformance === undefined) {
    return requestedDifficulty;
  }

  // Adjust difficulty based on performance
  if (previousPerformance < 0.4 && requestedDifficulty !== "EASY") {
    // Poor performance - reduce difficulty
    return requestedDifficulty === "HARD" ? "MEDIUM" : "EASY";
  } else if (previousPerformance > 0.85 && requestedDifficulty !== "HARD") {
    // Excellent performance - increase difficulty
    return requestedDifficulty === "EASY" ? "MEDIUM" : "HARD";
  }

  return requestedDifficulty;
}

/**
 * Parse Claude's JSON response safely
 */
function parseQuestionResponse(response: string): any {
  try {
    // Extract JSON from response (in case Claude adds surrounding text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Failed to parse question response:", error);
    throw new Error("Invalid question format generated");
  }
}

/**
 * Generate a new coding question using Claude AI
 *
 * @param params - Question generation parameters
 * @returns Generated question with metadata
 *
 * @example
 * ```typescript
 * const result = await generateQuestion({
 *   candidateId: "cand_123",
 *   difficulty: "MEDIUM",
 *   language: "typescript",
 *   previousPerformance: 0.75
 * });
 * console.log("Generated:", result.question.title);
 * ```
 */
export async function generateQuestion(
  params: GenerateQuestionParams
): Promise<QuestionGenerationResult> {
  const startTime = Date.now();

  try {
    // Validate parameters
    generateQuestionParamsSchema.parse(params);

    // Calculate adaptive difficulty
    const adaptedDifficulty = calculateAdaptiveDifficulty(
      params.difficulty,
      params.previousPerformance
    );

    // Get problem seed if provided
    let seedProblem = null;
    let seedTopic: string | undefined;
    if (params.seed) {
      seedProblem = await prisma.problemSeed.findUnique({
        where: { id: params.seed },
      });
      seedTopic = seedProblem?.category || seedProblem?.tags?.join(",");
    }

    // Try to get from cache first (unless seed is provided - those should be unique)
    let questionData: any = null;
    let tokensUsed = 0;
    let cacheHit = false;

    if (!params.seed) {
      const cachedQuestion = await getCachedQuestion(
        adaptedDifficulty,
        params.language,
        seedTopic
      );

      if (cachedQuestion) {
        questionData = cachedQuestion;
        cacheHit = true;
        console.log(
          `[Question Cache] Using cached question for ${adaptedDifficulty}/${params.language}`
        );
      }
    }

    // If no cache hit, generate new question
    if (!questionData) {
      // Build generation prompt
      const systemPrompt = buildQuestionGenerationPrompt(
        adaptedDifficulty,
        params.language,
        params.previousPerformance,
        seedProblem
      );

      // Call Claude to generate question
      const response = await getChatCompletion(
        [
          {
            role: "user",
            content: "Generate a coding interview question based on the requirements.",
          },
        ],
        {
          problemTitle: "Question Generation",
          problemDescription: systemPrompt,
          language: params.language,
        }
      );

      // Parse generated question
      questionData = parseQuestionResponse(response.content);
      tokensUsed = response.usage.totalTokens;

      // Cache the question for future use (unless seed-based)
      if (!params.seed) {
        await cacheQuestion(
          adaptedDifficulty,
          params.language,
          questionData,
          seedTopic
        );
      }
    }

    // Get candidate's current question order
    const existingQuestions = await prisma.generatedQuestion.count({
      where: { candidateId: params.candidateId },
    });

    // Create question in database
    const question = await prisma.generatedQuestion.create({
      data: {
        candidateId: params.candidateId,
        questionSeedId: params.seed,
        order: existingQuestions + 1,
        title: questionData.title,
        description: questionData.description,
        difficulty: adaptedDifficulty,
        language: params.language,
        requirements: questionData.requirements,
        estimatedTime: questionData.estimatedTime || DEFAULT_ESTIMATED_TIME,
        starterCode: questionData.starterCode,
        testCases: questionData.testCases,
        status: "PENDING",
      },
    });

    const generationTime = Date.now() - startTime;

    console.log(
      `Generated question "${question.title}" (${adaptedDifficulty}) for candidate ${params.candidateId}`
    );

    return {
      question,
      generationTime,
      tokensUsed: response.usage.totalTokens,
      adaptedDifficulty,
    };

  } catch (error) {
    console.error("Error generating question:", error);
    throw new Error(
      `Question generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get the next question for a candidate based on their progress
 *
 * @param candidateId - Candidate identifier
 * @param autoGenerate - Whether to generate a new question if none pending
 * @returns Next question or null if assessment is complete
 *
 * @example
 * ```typescript
 * const nextQuestion = await getNextQuestion(candidateId, true);
 * if (nextQuestion) {
 *   console.log("Next:", nextQuestion.title);
 * } else {
 *   console.log("Assessment complete!");
 * }
 * ```
 */
export async function getNextQuestion(
  candidateId: string,
  autoGenerate: boolean = true
): Promise<GeneratedQuestion | null> {
  try {
    // Find next pending question
    const pendingQuestion = await prisma.generatedQuestion.findFirst({
      where: {
        candidateId,
        status: "PENDING",
      },
      orderBy: {
        order: "asc",
      },
    });

    if (pendingQuestion) {
      return pendingQuestion;
    }

    // No pending questions - check if we should generate a new one
    if (!autoGenerate) {
      return null;
    }

    // Get candidate's assessment configuration
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        assessment: {
          include: {
            questions: true,
          },
        },
      },
    });

    if (!candidate) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    // Calculate previous performance
    const completedQuestions = await prisma.generatedQuestion.findMany({
      where: {
        candidateId,
        status: "COMPLETED",
      },
    });

    let previousPerformance: number | undefined;
    if (completedQuestions.length > 0) {
      const avgScore =
        completedQuestions.reduce((sum: number, q: any) => sum + (q.score || 0), 0) /
        completedQuestions.length;
      previousPerformance = avgScore;
    }

    // Determine difficulty for next question
    const totalGenerated = await prisma.generatedQuestion.count({
      where: { candidateId },
    });

    let difficulty: Difficulty;
    if (totalGenerated === 0) {
      difficulty = "EASY"; // Start with easy
    } else if (totalGenerated === 1) {
      difficulty = "MEDIUM";
    } else {
      difficulty = "HARD";
    }

    // Find a problem seed from the assessment
    const unusedSeeds = candidate.assessment.questions.filter((q: any) => {
      return !completedQuestions.some((cq: any) => cq.questionSeedId === q.problemSeedId);
    });

    const seed = unusedSeeds.length > 0 ? unusedSeeds[0].problemSeedId : undefined;

    // Generate new question
    const result = await generateQuestion({
      candidateId,
      seed: seed || undefined,
      difficulty,
      language: "typescript", // Default, could be from assessment config
      previousPerformance,
    });

    return result.question;

  } catch (error) {
    console.error("Error getting next question:", error);
    throw new Error(
      `Failed to get next question: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Start a question (mark as in progress)
 *
 * @param questionId - Question identifier
 * @returns Updated question
 */
export async function startQuestion(questionId: string): Promise<GeneratedQuestion> {
  try {
    return await prisma.generatedQuestion.update({
      where: { id: questionId },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Error starting question:", error);
    throw new Error(
      `Failed to start question: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Complete a question and record score
 *
 * @param questionId - Question identifier
 * @param score - Question score (0-1)
 * @returns Updated question
 */
export async function completeQuestion(
  questionId: string,
  score: number
): Promise<GeneratedQuestion> {
  try {
    // Validate score
    if (score < 0 || score > 1) {
      throw new Error("Score must be between 0 and 1");
    }

    return await prisma.generatedQuestion.update({
      where: { id: questionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        score,
      },
    });
  } catch (error) {
    console.error("Error completing question:", error);
    throw new Error(
      `Failed to complete question: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Skip a question
 *
 * @param questionId - Question identifier
 * @returns Updated question
 */
export async function skipQuestion(questionId: string): Promise<GeneratedQuestion> {
  try {
    return await prisma.generatedQuestion.update({
      where: { id: questionId },
      data: {
        status: "SKIPPED",
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Error skipping question:", error);
    throw new Error(
      `Failed to skip question: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get all questions for a candidate
 *
 * @param candidateId - Candidate identifier
 * @returns Array of generated questions
 */
export async function getCandidateQuestions(
  candidateId: string
): Promise<GeneratedQuestion[]> {
  try {
    return await prisma.generatedQuestion.findMany({
      where: { candidateId },
      orderBy: { order: "asc" },
    });
  } catch (error) {
    console.error("Error fetching candidate questions:", error);
    throw new Error(
      `Failed to fetch questions: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Calculate candidate's overall performance across all questions
 *
 * @param candidateId - Candidate identifier
 * @returns Performance metrics
 */
export async function calculatePerformance(candidateId: string): Promise<{
  totalQuestions: number;
  completedQuestions: number;
  averageScore: number;
  timeSpent: number; // total minutes
  progressPercentage: number;
}> {
  try {
    const questions = await prisma.generatedQuestion.findMany({
      where: { candidateId },
    });

    const completedQuestions = questions.filter((q: any) => q.status === "COMPLETED");

    const averageScore =
      completedQuestions.length > 0
        ? completedQuestions.reduce((sum: number, q: any) => sum + (q.score || 0), 0) /
          completedQuestions.length
        : 0;

    const timeSpent = questions.reduce((total: number, q: any) => {
      if (q.startedAt && q.completedAt) {
        const duration =
          (q.completedAt.getTime() - q.startedAt.getTime()) / (1000 * 60);
        return total + duration;
      }
      return total;
    }, 0);

    return {
      totalQuestions: questions.length,
      completedQuestions: completedQuestions.length,
      averageScore,
      timeSpent,
      progressPercentage:
        questions.length > 0 ? (completedQuestions.length / questions.length) * 100 : 0,
    };

  } catch (error) {
    console.error("Error calculating performance:", error);
    throw new Error(
      `Failed to calculate performance: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Regenerate a question (useful if the generated question has issues)
 *
 * @param questionId - Question identifier to regenerate
 * @returns New generated question
 */
export async function regenerateQuestion(
  questionId: string
): Promise<QuestionGenerationResult> {
  try {
    // Get original question
    const originalQuestion = await prisma.generatedQuestion.findUnique({
      where: { id: questionId },
    });

    if (!originalQuestion) {
      throw new Error(`Question ${questionId} not found`);
    }

    // Generate new question with same parameters
    const result = await generateQuestion({
      candidateId: originalQuestion.candidateId,
      seed: originalQuestion.questionSeedId || undefined,
      difficulty: originalQuestion.difficulty,
      language: originalQuestion.language,
    });

    // Delete or archive old question
    await prisma.generatedQuestion.delete({
      where: { id: questionId },
    });

    return result;

  } catch (error) {
    console.error("Error regenerating question:", error);
    throw new Error(
      `Question regeneration failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

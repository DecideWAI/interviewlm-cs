/**
 * Smart Question Service
 *
 * Implements intelligent question selection with threshold-based reuse.
 * Strategy:
 * - Generate questions dynamically via Claude for fresh assessments
 * - Cache and reuse once thresholds met: 5,000 total OR 100 per seed
 * - Add iteration capability to create variations of existing questions
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { incrementalQuestionGenerator, QuestionGenerationContext } from "./incremental-questions";
import { generateFingerprint, checkUniqueness } from "./question-fingerprint";
import type { GeneratedQuestion, Difficulty } from "@/lib/prisma-types";

// Global threshold for switching to reuse mode
const GLOBAL_QUESTION_THRESHOLD = 5000;
// Per-seed threshold for reuse mode
const SEED_QUESTION_THRESHOLD = 100;
// Percentage of questions to reuse (vs generate new iterations)
const REUSE_PERCENTAGE = 0.8;

/**
 * Question selection strategy
 */
export interface QuestionSelectionStrategy {
  type: 'generate' | 'reuse' | 'iterate';
  reason: string;
  sourceQuestionId?: string;
}

/**
 * Pool statistics for a seed
 */
export interface PoolStats {
  seedId: string;
  totalGenerated: number;
  uniqueQuestions: number;
  avgReuseCount: number;
  threshold: number;
  isAboveThreshold: boolean;
  totalCandidatesServed: number;
}

/**
 * Global pool statistics for marketing
 */
export interface GlobalPoolStats {
  totalQuestionsGenerated: number;
  uniqueVariations: number;
  avgUniquenessScore: number;
  seedCount: number;
  generationRate: string;
  isAboveGlobalThreshold: boolean;
}

/**
 * Smart Question Service
 * Core service for intelligent question selection and reuse
 */
export class SmartQuestionService {
  /**
   * Get the next question for a candidate with smart selection
   */
  async getNextQuestion(
    context: QuestionGenerationContext
  ): Promise<{ question: GeneratedQuestion; strategy: QuestionSelectionStrategy }> {
    // Determine selection strategy
    const strategy = await this.selectStrategy(context.seedId, context.candidateId);

    let question: GeneratedQuestion;

    switch (strategy.type) {
      case 'reuse':
        question = await this.reuseQuestion(
          context.seedId,
          context.candidateId,
          context.previousQuestions.length + 1,
          strategy.sourceQuestionId!
        );
        break;

      case 'iterate':
        question = await this.generateIteration(
          context.seedId,
          context.candidateId,
          context.previousQuestions.length + 1,
          strategy.sourceQuestionId!
        );
        break;

      case 'generate':
      default:
        // Use the existing incremental question generator
        question = await incrementalQuestionGenerator.generateNextQuestion(context);

        // Generate and store fingerprint for the new question
        const fingerprint = generateFingerprint(question);
        await prisma.generatedQuestion.update({
          where: { id: question.id },
          data: { fingerprint },
        });

        // Update pool stats
        await this.updatePoolStats(context.seedId);
        break;
    }

    return { question, strategy };
  }

  /**
   * Determine the selection strategy based on pool state
   */
  async selectStrategy(
    seedId: string,
    candidateId: string
  ): Promise<QuestionSelectionStrategy> {
    // Get pool stats for this seed
    const poolStats = await this.getPoolStats(seedId);

    // Get global stats
    const globalStats = await this.getGlobalPoolStats();

    // If below thresholds, always generate fresh
    if (!poolStats.isAboveThreshold && !globalStats.isAboveGlobalThreshold) {
      return {
        type: 'generate',
        reason: `Pool size (${poolStats.totalGenerated}/${poolStats.threshold}) below threshold. Generating fresh question.`,
      };
    }

    // Above threshold: decide between reuse and iterate
    const shouldReuse = Math.random() < REUSE_PERCENTAGE;

    if (shouldReuse) {
      // Find a question to reuse (one that hasn't been shown to this candidate)
      const reuseCandidate = await this.findQuestionToReuse(seedId, candidateId);

      if (reuseCandidate) {
        return {
          type: 'reuse',
          reason: `Pool above threshold (${poolStats.totalGenerated}/${poolStats.threshold}). Reusing existing question.`,
          sourceQuestionId: reuseCandidate.id,
        };
      }
    }

    // Find a question to iterate on
    const iterateCandidate = await this.findQuestionToIterate(seedId, candidateId);

    if (iterateCandidate) {
      return {
        type: 'iterate',
        reason: `Pool above threshold. Creating variation of existing question.`,
        sourceQuestionId: iterateCandidate.id,
      };
    }

    // Fallback: generate fresh
    return {
      type: 'generate',
      reason: `No suitable questions found for reuse or iteration. Generating fresh.`,
    };
  }

  /**
   * Reuse an existing question for a new candidate
   */
  private async reuseQuestion(
    seedId: string,
    candidateId: string,
    order: number,
    sourceQuestionId: string
  ): Promise<GeneratedQuestion> {
    // Get the source question
    const sourceQuestion = await prisma.generatedQuestion.findUnique({
      where: { id: sourceQuestionId },
    });

    if (!sourceQuestion) {
      throw new Error(`Source question ${sourceQuestionId} not found`);
    }

    // Create a copy for this candidate
    const newQuestion = await prisma.generatedQuestion.create({
      data: {
        candidateId,
        questionSeedId: seedId,
        order,
        title: sourceQuestion.title,
        description: sourceQuestion.description,
        difficulty: sourceQuestion.difficulty,
        language: sourceQuestion.language,
        requirements: sourceQuestion.requirements,
        estimatedTime: sourceQuestion.estimatedTime,
        starterCode: sourceQuestion.starterCode as Prisma.InputJsonValue,
        testCases: sourceQuestion.testCases as Prisma.InputJsonValue,
        status: 'PENDING',
        difficultyAssessment: sourceQuestion.difficultyAssessment as Prisma.InputJsonValue,
        fingerprint: sourceQuestion.fingerprint,
        reuseCount: 0,
        parentQuestionId: sourceQuestionId,
        iterationNumber: 0, // Not an iteration, just a reuse
      },
    });

    // Increment reuse count on source question
    await prisma.generatedQuestion.update({
      where: { id: sourceQuestionId },
      data: { reuseCount: { increment: 1 } },
    });

    console.log(
      `Reused question "${sourceQuestion.title}" (Q${order}) for candidate ${candidateId}`
    );

    return newQuestion;
  }

  /**
   * Generate an iteration (variation) of an existing question
   */
  async generateIteration(
    seedId: string,
    candidateId: string,
    order: number,
    sourceQuestionId: string
  ): Promise<GeneratedQuestion> {
    // Get the source question
    const sourceQuestion = await prisma.generatedQuestion.findUnique({
      where: { id: sourceQuestionId },
    });

    if (!sourceQuestion) {
      throw new Error(`Source question ${sourceQuestionId} not found`);
    }

    // Get the seed for context
    const seed = await prisma.problemSeed.findUnique({
      where: { id: seedId },
    });

    if (!seed) {
      throw new Error(`Seed ${seedId} not found`);
    }

    // Generate a variation using Claude
    const { getChatCompletion } = await import("./claude");

    const iterationPrompt = this.buildIterationPrompt(sourceQuestion, seed);

    const response = await getChatCompletion(
      [
        {
          role: "user",
          content: iterationPrompt,
        },
      ],
      {
        problemTitle: seed.title,
        problemDescription: `Generate a variation of: ${sourceQuestion.title}`,
        language: sourceQuestion.language,
      }
    );

    // Parse the response
    const questionData = this.parseIterationResponse(response.content);

    // Calculate iteration number
    const maxIteration = await prisma.generatedQuestion.aggregate({
      where: { parentQuestionId: sourceQuestionId },
      _max: { iterationNumber: true },
    });
    const nextIterationNumber = (maxIteration._max.iterationNumber || 0) + 1;

    // Create the new question
    const newQuestion = await prisma.generatedQuestion.create({
      data: {
        candidateId,
        questionSeedId: seedId,
        order,
        title: questionData.title,
        description: questionData.description,
        difficulty: sourceQuestion.difficulty,
        language: sourceQuestion.language,
        requirements: questionData.requirements || sourceQuestion.requirements,
        estimatedTime: questionData.estimatedTime || sourceQuestion.estimatedTime,
        starterCode: (questionData.starterCode || sourceQuestion.starterCode) as Prisma.InputJsonValue,
        testCases: (questionData.testCases || sourceQuestion.testCases) as Prisma.InputJsonValue,
        status: 'PENDING',
        difficultyAssessment: (questionData.difficultyAssessment || sourceQuestion.difficultyAssessment) as Prisma.InputJsonValue,
        fingerprint: null, // Will be generated after creation
        reuseCount: 0,
        parentQuestionId: sourceQuestionId,
        iterationNumber: nextIterationNumber,
      },
    });

    // Generate fingerprint for uniqueness tracking
    const fingerprint = generateFingerprint(newQuestion);
    await prisma.generatedQuestion.update({
      where: { id: newQuestion.id },
      data: { fingerprint },
    });

    // Check uniqueness
    const isUnique = await checkUniqueness(fingerprint, seedId);
    if (!isUnique) {
      console.warn(`Generated iteration may be too similar to existing questions`);
    }

    // Update pool stats
    await this.updatePoolStats(seedId);

    console.log(
      `Generated iteration "${newQuestion.title}" (iter #${nextIterationNumber}) for candidate ${candidateId}`
    );

    return newQuestion;
  }

  /**
   * Build prompt for generating question iteration
   */
  private buildIterationPrompt(sourceQuestion: GeneratedQuestion, seed: any): string {
    return `You are creating a VARIATION of an existing coding question. The variation should test the same concepts but with different specifics.

**Original Question:**
Title: ${sourceQuestion.title}
Description: ${sourceQuestion.description}
Difficulty: ${sourceQuestion.difficulty}
Requirements: ${(sourceQuestion.requirements as string[]).join(', ')}
Estimated Time: ${sourceQuestion.estimatedTime} minutes

**Assessment Context:**
${seed.title}: ${seed.description}

**Create a variation that:**
1. Tests the SAME core concepts and skills
2. Has DIFFERENT specific requirements (e.g., different data, different edge cases)
3. Maintains the SAME difficulty level
4. Changes the context/scenario slightly (e.g., different domain example)
5. Updates test cases to match the new requirements

**Variation Techniques to Use:**
- Change the data structures involved (e.g., array → object, list → tree)
- Modify the edge cases to test
- Adjust the context/scenario (e.g., users → products, orders → bookings)
- Change numeric constraints (e.g., different limits, thresholds)

**Response Format (JSON only):**
{
  "title": "Varied title that reflects the change",
  "description": "Modified problem description with new specifics",
  "requirements": ["Updated requirement 1", "Updated requirement 2"],
  "estimatedTime": ${sourceQuestion.estimatedTime},
  "starterCode": ${JSON.stringify(sourceQuestion.starterCode)},
  "testCases": [
    {
      "name": "Updated test case",
      "input": {"param": "new_value"},
      "expectedOutput": "new expected result",
      "hidden": false,
      "description": "What this test validates"
    }
  ],
  "difficultyAssessment": {
    "difficultyScore": 5.5,
    "complexityFactors": {
      "linesOfCodeExpected": 50,
      "conceptsRequired": ["same concepts as original"],
      "techStackComplexity": 3
    },
    "justification": "This is a variation of the original question, testing the same concepts with different specifics.",
    "relativeToBaseline": 1.0
  }
}

Return ONLY the JSON object.`;
  }

  /**
   * Parse iteration response from Claude
   */
  private parseIterationResponse(response: string): any {
    try {
      let jsonText = response.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\s*|\s*```/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\s*|\s*```/g, '');
      }

      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Failed to parse iteration response:', error);
      throw new Error('Invalid iteration format generated by AI');
    }
  }

  /**
   * Find a question suitable for reuse (not shown to this candidate before)
   */
  private async findQuestionToReuse(
    seedId: string,
    candidateId: string
  ): Promise<GeneratedQuestion | null> {
    // Get questions already shown to this candidate
    const candidateQuestions = await prisma.generatedQuestion.findMany({
      where: { candidateId },
      select: { fingerprint: true },
    });
    const candidateFingerprints = candidateQuestions
      .map(q => q.fingerprint)
      .filter(Boolean);

    // Find a question from the pool that hasn't been shown
    const availableQuestion = await prisma.generatedQuestion.findFirst({
      where: {
        questionSeedId: seedId,
        fingerprint: {
          notIn: candidateFingerprints as string[],
        },
        iterationNumber: 0, // Only reuse original questions, not iterations
      },
      orderBy: [
        { reuseCount: 'asc' }, // Prefer less reused questions
        { createdAt: 'desc' }, // Prefer newer questions
      ],
    });

    return availableQuestion;
  }

  /**
   * Find a question suitable for iteration
   */
  private async findQuestionToIterate(
    seedId: string,
    candidateId: string
  ): Promise<GeneratedQuestion | null> {
    // Get questions already shown to this candidate
    const candidateQuestions = await prisma.generatedQuestion.findMany({
      where: { candidateId },
      select: { parentQuestionId: true, fingerprint: true },
    });
    const usedParentIds = candidateQuestions
      .map(q => q.parentQuestionId)
      .filter(Boolean);

    // Find a question that hasn't been iterated for this candidate
    const availableQuestion = await prisma.generatedQuestion.findFirst({
      where: {
        questionSeedId: seedId,
        id: {
          notIn: usedParentIds as string[],
        },
        iterationNumber: 0, // Only iterate from original questions
      },
      orderBy: [
        { reuseCount: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return availableQuestion;
  }

  /**
   * Get pool statistics for a seed
   */
  async getPoolStats(seedId: string): Promise<PoolStats> {
    // Try to get existing stats
    let stats = await prisma.questionPoolStats.findUnique({
      where: { seedId },
    });

    // If no stats exist, create them
    if (!stats) {
      // Count existing questions
      const totalGenerated = await prisma.generatedQuestion.count({
        where: { questionSeedId: seedId },
      });

      const uniqueQuestions = await prisma.generatedQuestion.count({
        where: {
          questionSeedId: seedId,
          iterationNumber: 0,
        },
      });

      stats = await prisma.questionPoolStats.create({
        data: {
          seedId,
          totalGenerated,
          uniqueQuestions,
          avgReuseCount: 0,
          threshold: SEED_QUESTION_THRESHOLD,
          totalCandidatesServed: 0,
          avgUniquenessScore: 1.0,
        },
      });
    }

    return {
      seedId: stats.seedId,
      totalGenerated: stats.totalGenerated,
      uniqueQuestions: stats.uniqueQuestions,
      avgReuseCount: stats.avgReuseCount,
      threshold: stats.threshold,
      isAboveThreshold: stats.totalGenerated >= stats.threshold,
      totalCandidatesServed: stats.totalCandidatesServed,
    };
  }

  /**
   * Update pool statistics after generating a question
   */
  async updatePoolStats(seedId: string): Promise<void> {
    // Count questions
    const totalGenerated = await prisma.generatedQuestion.count({
      where: { questionSeedId: seedId },
    });

    const uniqueQuestions = await prisma.generatedQuestion.count({
      where: {
        questionSeedId: seedId,
        iterationNumber: 0,
      },
    });

    // Calculate average reuse count
    const reuseStats = await prisma.generatedQuestion.aggregate({
      where: { questionSeedId: seedId },
      _avg: { reuseCount: true },
    });

    // Count unique candidates served
    const candidatesServed = await prisma.generatedQuestion.groupBy({
      by: ['candidateId'],
      where: { questionSeedId: seedId },
    });

    await prisma.questionPoolStats.upsert({
      where: { seedId },
      update: {
        totalGenerated,
        uniqueQuestions,
        avgReuseCount: reuseStats._avg.reuseCount || 0,
        lastGeneratedAt: new Date(),
        totalCandidatesServed: candidatesServed.length,
        avgUniquenessScore: uniqueQuestions / Math.max(totalGenerated, 1),
      },
      create: {
        seedId,
        totalGenerated,
        uniqueQuestions,
        avgReuseCount: reuseStats._avg.reuseCount || 0,
        threshold: SEED_QUESTION_THRESHOLD,
        totalCandidatesServed: candidatesServed.length,
        avgUniquenessScore: 1.0,
      },
    });
  }

  /**
   * Get global pool statistics for marketing/stats API
   */
  async getGlobalPoolStats(): Promise<GlobalPoolStats> {
    // Total questions across all seeds
    const totalQuestions = await prisma.generatedQuestion.count();

    // Unique questions (non-iterations)
    const uniqueQuestions = await prisma.generatedQuestion.count({
      where: { iterationNumber: 0 },
    });

    // Active seeds
    const seedCount = await prisma.problemSeed.count({
      where: { status: 'active' },
    });

    // Questions generated in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentQuestions = await prisma.generatedQuestion.count({
      where: { createdAt: { gte: yesterday } },
    });

    return {
      totalQuestionsGenerated: totalQuestions,
      uniqueVariations: uniqueQuestions,
      avgUniquenessScore: uniqueQuestions / Math.max(totalQuestions, 1),
      seedCount,
      generationRate: `${recentQuestions}/day`,
      isAboveGlobalThreshold: totalQuestions >= GLOBAL_QUESTION_THRESHOLD,
    };
  }
}

// Export singleton instance
export const smartQuestionService = new SmartQuestionService();

/**
 * Incremental Question Generation Service
 *
 * Generates adaptive, context-aware coding questions that build on candidate's
 * previous work. Implements the core logic for incremental assessments where
 * questions progressively extend or simplify based on performance.
 */

import prisma from "@/lib/prisma";
import { getChatCompletion } from "./claude";
import type { Difficulty, QuestionStatus, GeneratedQuestion } from "@/lib/prisma-types";
import type { RequiredTechStack, BaseProblem, ProgressionHints, SeniorityExpectations } from "@/types/seed";
import type { SeniorityLevel } from "@/types/assessment";

/**
 * Performance metrics for a completed question
 */
export interface PerformanceMetrics {
  questionId: string;
  score: number; // 0-1
  timeSpent: number; // minutes
  testsPassedRatio: number; // 0-1
  codeQuality?: number; // 0-1 (optional, from code analysis)
}

/**
 * Context for incremental question generation
 */
export interface QuestionGenerationContext {
  candidateId: string;
  seedId: string;
  seniority: SeniorityLevel;
  previousQuestions: GeneratedQuestion[];
  previousPerformance: PerformanceMetrics[];
  timeRemaining: number; // seconds
  currentCodeSnapshot?: string;
}

/**
 * Progress analysis result
 */
interface ProgressAnalysis {
  averageScore: number;
  trend: 'improving' | 'declining' | 'stable';
  codeQuality: 'poor' | 'fair' | 'good' | 'excellent';
  techCompliance: boolean;
  recommendedAction: 'extend' | 'maintain' | 'simplify';
}

/**
 * Incremental Question Generator
 * Core service for adaptive question generation
 */
export class IncrementalQuestionGenerator {
  /**
   * Generate next question based on candidate's progress
   */
  async generateNextQuestion(
    context: QuestionGenerationContext
  ): Promise<GeneratedQuestion> {
    // Get seed data
    const seed = await prisma.problemSeed.findUnique({
      where: { id: context.seedId },
    });

    if (!seed) {
      throw new Error(`Seed ${context.seedId} not found`);
    }

    // Validate seed type
    if (seed.seedType !== 'incremental') {
      throw new Error('Seed must be of type "incremental" for dynamic generation');
    }

    // Parse JSON fields
    const requiredTech = seed.requiredTech as RequiredTechStack | null;
    const baseProblem = seed.baseProblem as BaseProblem | null;
    const progressionHints = seed.progressionHints as ProgressionHints | null;
    const seniorityExpectations = seed.seniorityExpectations as SeniorityExpectations | null;

    if (!requiredTech || !baseProblem || !progressionHints) {
      throw new Error('Incremental seed missing required fields');
    }

    // If this is the first question, use base problem
    if (context.previousQuestions.length === 0) {
      return await this.generateFirstQuestion({
        candidateId: context.candidateId,
        seedId: context.seedId,
        baseProblem,
        requiredTech,
        seniority: context.seniority,
      });
    }

    // Check if we should generate another question
    const shouldContinue = this.shouldGenerateNextQuestion(
      context.previousQuestions.length,
      context.previousPerformance
    );

    if (!shouldContinue.continue) {
      throw new Error(shouldContinue.reason);
    }

    // Analyze candidate's progress
    const progressAnalysis = this.analyzeProgress(
      context.previousPerformance,
      context.previousQuestions.length
    );

    // Build contextual prompt for Claude
    const prompt = this.buildIncrementalPrompt({
      seed,
      seniority: context.seniority,
      previousQuestions: context.previousQuestions,
      previousPerformance: context.previousPerformance,
      progressAnalysis,
      requiredTech,
      progressionHints,
      seniorityExpectations,
      timeRemaining: Math.floor(context.timeRemaining / 60), // Convert to minutes
    });

    // Generate question using Claude
    const response = await getChatCompletion(
      [
        {
          role: "user",
          content: "Generate the next incremental question based on the context provided.",
        },
      ],
      {
        problemTitle: seed.title,
        problemDescription: prompt,
        language: requiredTech.languages[0] || 'typescript',
      }
    );

    // Parse Claude's response
    const questionData = this.parseQuestionResponse(response.content);

    // Validate tech stack in generated question
    this.validateTechStackInQuestion(questionData, requiredTech);

    // Create question in database
    const nextQuestionOrder = context.previousQuestions.length + 1;
    const question = await prisma.generatedQuestion.create({
      data: {
        candidateId: context.candidateId,
        questionSeedId: context.seedId,
        order: nextQuestionOrder,
        title: questionData.title,
        description: questionData.description,
        difficulty: this.determineDifficulty(progressAnalysis, nextQuestionOrder),
        language: requiredTech.languages[0] || 'typescript',
        requirements: questionData.requirements || [],
        estimatedTime: questionData.estimatedTime || 20,
        starterCode: questionData.starterCode || { files: [] },
        testCases: questionData.testCases || [],
        status: "PENDING",
      },
    });

    console.log(
      `Generated incremental question "${question.title}" (Q${nextQuestionOrder}) for candidate ${context.candidateId}`
    );

    return question;
  }

  /**
   * Generate the first question from base problem
   */
  private async generateFirstQuestion(params: {
    candidateId: string;
    seedId: string;
    baseProblem: BaseProblem;
    requiredTech: RequiredTechStack;
    seniority: SeniorityLevel;
  }): Promise<GeneratedQuestion> {
    const { candidateId, seedId, baseProblem, requiredTech, seniority } = params;

    // Create first question directly from base problem
    const question = await prisma.generatedQuestion.create({
      data: {
        candidateId,
        questionSeedId: seedId,
        order: 1,
        title: baseProblem.title,
        description: baseProblem.description,
        difficulty: this.getInitialDifficulty(seniority),
        language: requiredTech.languages[0]?.name || 'typescript',
        requirements: [
          `Use ${requiredTech.languages.map(l => l.name).join(' or ')}`,
          `Implement with ${requiredTech.frameworks.map(f => f.name).join(', ')}`,
          ...requiredTech.databases.length > 0
            ? [`Use ${requiredTech.databases.map(d => d.name).join(' and/or ')} for data storage`]
            : [],
        ],
        estimatedTime: baseProblem.estimatedTime,
        starterCode: {
          files: [
            {
              fileName: this.getMainFileName(requiredTech.languages[0]?.name || 'typescript'),
              content: baseProblem.starterCode,
              language: requiredTech.languages[0]?.name || 'typescript',
            },
          ],
        },
        testCases: [], // Will be populated by Claude in first question
        status: "PENDING",
      },
    });

    console.log(`Generated first question "${question.title}" for candidate ${candidateId}`);
    return question;
  }

  /**
   * Analyze candidate's progress across questions
   */
  private analyzeProgress(
    performanceHistory: PerformanceMetrics[],
    questionCount: number
  ): ProgressAnalysis {
    if (performanceHistory.length === 0) {
      return {
        averageScore: 0.5,
        trend: 'stable',
        codeQuality: 'fair',
        techCompliance: true,
        recommendedAction: 'maintain',
      };
    }

    // Calculate average score
    const avgScore =
      performanceHistory.reduce((sum, p) => sum + p.score, 0) / performanceHistory.length;

    // Determine trend (last 2 vs first questions)
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (performanceHistory.length >= 2) {
      const recentAvg =
        performanceHistory.slice(-2).reduce((sum, p) => sum + p.score, 0) / 2;
      const initialAvg =
        performanceHistory.slice(0, 2).reduce((sum, p) => sum + p.score, 0) /
        Math.min(2, performanceHistory.length);

      if (recentAvg > initialAvg + 0.1) trend = 'improving';
      else if (recentAvg < initialAvg - 0.1) trend = 'declining';
    }

    // Assess code quality (simplified)
    let codeQuality: 'poor' | 'fair' | 'good' | 'excellent';
    const avgTestsPassed =
      performanceHistory.reduce((sum, p) => sum + p.testsPassedRatio, 0) /
      performanceHistory.length;

    if (avgTestsPassed >= 0.9 && avgScore >= 0.8) codeQuality = 'excellent';
    else if (avgTestsPassed >= 0.7 && avgScore >= 0.65) codeQuality = 'good';
    else if (avgTestsPassed >= 0.5 || avgScore >= 0.5) codeQuality = 'fair';
    else codeQuality = 'poor';

    // Determine recommended action
    let recommendedAction: 'extend' | 'maintain' | 'simplify';
    if (avgScore >= 0.75 && trend !== 'declining') {
      recommendedAction = 'extend';
    } else if (avgScore < 0.4 || trend === 'declining') {
      recommendedAction = 'simplify';
    } else {
      recommendedAction = 'maintain';
    }

    return {
      averageScore: avgScore,
      trend,
      codeQuality,
      techCompliance: true, // Will be determined by TechStackValidator
      recommendedAction,
    };
  }

  /**
   * Determine if we should generate another question
   * Based on question count limits and performance thresholds
   */
  private shouldGenerateNextQuestion(
    currentQuestionCount: number,
    performanceHistory: PerformanceMetrics[]
  ): { continue: boolean; reason?: string } {
    // Configuration
    const MIN_QUESTIONS = 2;
    const MAX_QUESTIONS = 5;
    const EXPERTISE_THRESHOLD = 0.7; // Need 70% on current question to advance

    // Check max questions limit
    if (currentQuestionCount >= MAX_QUESTIONS) {
      return {
        continue: false,
        reason: `Maximum questions reached (${MAX_QUESTIONS}). Assessment complete.`,
      };
    }

    // If we haven't reached minimum, continue
    if (currentQuestionCount < MIN_QUESTIONS) {
      return { continue: true };
    }

    // After minimum questions, check if candidate is performing well enough to continue
    if (performanceHistory.length > 0) {
      const lastPerformance = performanceHistory[performanceHistory.length - 1];

      // If candidate is struggling (below threshold), stop generating more questions
      if (lastPerformance.score < EXPERTISE_THRESHOLD) {
        return {
          continue: false,
          reason: `Candidate performance (${(lastPerformance.score * 100).toFixed(0)}%) below expertise threshold (${(EXPERTISE_THRESHOLD * 100).toFixed(0)}%). Stopping at ${currentQuestionCount} questions.`,
        };
      }
    }

    // Continue if performing well and haven't hit max
    return { continue: true };
  }

  /**
   * Build contextual prompt for incremental question generation
   */
  private buildIncrementalPrompt(params: {
    seed: any;
    seniority: SeniorityLevel;
    previousQuestions: GeneratedQuestion[];
    previousPerformance: PerformanceMetrics[];
    progressAnalysis: ProgressAnalysis;
    requiredTech: RequiredTechStack;
    progressionHints: ProgressionHints;
    seniorityExpectations: SeniorityExpectations | null;
    timeRemaining: number;
  }): string {
    const {
      seed,
      seniority,
      previousQuestions,
      previousPerformance,
      progressAnalysis,
      requiredTech,
      progressionHints,
      seniorityExpectations,
      timeRemaining,
    } = params;

    const lastPerformance = previousPerformance[previousPerformance.length - 1];

    let actionGuidance = '';
    if (progressAnalysis.recommendedAction === 'extend') {
      actionGuidance = `The candidate is performing well (avg: ${(progressAnalysis.averageScore * 100).toFixed(0)}%). Create a CHALLENGING follow-up question that:
- BUILDS DIRECTLY ON their existing code from previous questions
- Adds complexity from these topics: ${progressionHints.extensionTopics.join(', ')}
- Tests ${seniority}-level skills${seniorityExpectations?.[seniority] ? `: ${seniorityExpectations[seniority]?.join(', ')}` : ''}
- Requires significant extensions to their current implementation
- Should take approximately ${Math.min(25, timeRemaining - 10)} minutes`;
    } else if (progressAnalysis.recommendedAction === 'simplify') {
      actionGuidance = `The candidate is struggling (avg: ${(progressAnalysis.averageScore * 100).toFixed(0)}%). Create a SUPPORTIVE follow-up that:
- SIMPLIFIES the current task or provides a clearer path forward
- Focuses on foundational concepts: ${progressionHints.simplificationTopics.join(', ')}
- Provides clearer guidance and hints
- Builds confidence without reducing standards
- Should take approximately 15-20 minutes`;
    } else {
      actionGuidance = `The candidate is performing adequately (avg: ${(progressAnalysis.averageScore * 100).toFixed(0)}%). Create a MODERATE follow-up that:
- EXTENDS their current work incrementally
- Maintains current difficulty level
- Explores adjacent concepts
- Should take approximately ${Math.min(20, timeRemaining - 10)} minutes`;
    }

    return `You are generating question #${previousQuestions.length + 1} in an adaptive technical interview for a ${seniority} developer.

**Assessment Scenario:** ${seed.title}
${seed.domain ? `**Domain:** ${seed.domain}` : ''}
**Description:** ${seed.description}

**REQUIRED TECHNOLOGY STACK (MUST USE):**
- Languages: ${requiredTech.languages.join(', ')}
- Frameworks: ${requiredTech.frameworks.join(', ')}
- Databases: ${requiredTech.databases.join(', ')}
${requiredTech.tools ? `- Tools: ${requiredTech.tools.join(', ')}` : ''}

**Previous Questions in This Assessment:**
${previousQuestions.map((q, i) => `
Q${i + 1}: ${q.title}
   Difficulty: ${q.difficulty}
   Score: ${previousPerformance[i] ? `${(previousPerformance[i].score * 100).toFixed(0)}%` : 'Pending'}
   Time: ${previousPerformance[i] ? `${previousPerformance[i].timeSpent} min` : 'N/A'}
`).join('')}

**Candidate Progress Analysis:**
- Average Score: ${(progressAnalysis.averageScore * 100).toFixed(0)}%
- Trend: ${progressAnalysis.trend}
- Code Quality: ${progressAnalysis.codeQuality}
- Tech Stack Compliance: ${progressAnalysis.techCompliance ? '✓ Compliant' : '✗ Non-compliant'}

**Time Remaining:** ${timeRemaining} minutes

**Your Task:**
${actionGuidance}

**CRITICAL REQUIREMENTS:**
1. The question MUST require the candidate to USE THE SPECIFIED TECH STACK
2. The question should BUILD ON their previous work (reference it explicitly if helpful)
3. Make it realistic - like a real-world feature request or bug fix
4. Include specific, testable requirements
5. Provide clear acceptance criteria

**Response Format (JSON only, no markdown):**
{
  "title": "Clear, descriptive title for the task",
  "description": "Detailed problem description with context, requirements, examples, and constraints. Make it clear how this builds on previous work.",
  "requirements": [
    "Specific requirement 1",
    "Specific requirement 2",
    "Performance/quality requirement"
  ],
  "estimatedTime": ${Math.min(25, timeRemaining - 5)},
  "starterCode": [
    {
      "fileName": "main.${requiredTech.languages[0] === 'python' ? 'py' : requiredTech.languages[0] === 'go' ? 'go' : 'ts'}",
      "content": "// Brief starter code or TODO comments guiding implementation",
      "language": "${requiredTech.languages[0]}"
    }
  ],
  "testCases": [
    {
      "name": "Test case name",
      "input": {"param": "value"},
      "expectedOutput": "expected result",
      "hidden": false,
      "description": "What this test validates"
    }
  ]
}

Return ONLY the JSON object, no additional text or markdown formatting.`;
  }

  /**
   * Parse Claude's JSON response
   */
  private parseQuestionResponse(response: string): any {
    try {
      // Remove markdown code blocks if present
      let jsonText = response.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\s*|\s*```/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\s*|\s*```/g, '');
      }

      // Extract JSON from response
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Failed to parse question response:', error);
      console.error('Response was:', response);
      throw new Error('Invalid question format generated by AI');
    }
  }

  /**
   * Validate that the generated question requires the specified tech stack
   */
  private validateTechStackInQuestion(
    questionData: any,
    requiredTech: RequiredTechStack
  ): void {
    const description = questionData.description?.toLowerCase() || '';
    const requirements = (questionData.requirements || []).join(' ').toLowerCase();
    const combined = description + ' ' + requirements;

    // Check for framework mentions
    const mentionsFramework = requiredTech.frameworks.some((fw) =>
      combined.includes(fw.toLowerCase())
    );

    // Check for database mentions
    const mentionsDatabase = requiredTech.databases.some((db) =>
      combined.includes(db.toLowerCase())
    );

    if (!mentionsFramework && requiredTech.frameworks.length > 0) {
      console.warn(
        `Generated question does not explicitly mention required frameworks: ${requiredTech.frameworks.join(', ')}`
      );
    }

    if (!mentionsDatabase && requiredTech.databases.length > 0) {
      console.warn(
        `Generated question does not explicitly mention required databases: ${requiredTech.databases.join(', ')}`
      );
    }
  }

  /**
   * Determine difficulty based on progress and question number
   */
  private determineDifficulty(
    analysis: ProgressAnalysis,
    questionNumber: number
  ): Difficulty {
    // First question is always EASY/MEDIUM
    if (questionNumber === 1) return 'EASY';

    // Adjust based on performance
    if (analysis.recommendedAction === 'extend') {
      return questionNumber >= 3 ? 'HARD' : 'MEDIUM';
    } else if (analysis.recommendedAction === 'simplify') {
      return 'EASY';
    } else {
      return 'MEDIUM';
    }
  }

  /**
   * Get initial difficulty based on seniority
   */
  private getInitialDifficulty(seniority: SeniorityLevel): Difficulty {
    const difficultyMap: Record<SeniorityLevel, Difficulty> = {
      junior: 'EASY',
      mid: 'EASY',
      senior: 'MEDIUM',
      staff: 'MEDIUM',
      principal: 'MEDIUM',
    };
    return difficultyMap[seniority] || 'EASY';
  }

  /**
   * Get main file name based on language
   */
  private getMainFileName(language: string): string {
    const extensionMap: Record<string, string> = {
      python: 'main.py',
      typescript: 'main.ts',
      javascript: 'main.js',
      go: 'main.go',
      java: 'Main.java',
      rust: 'main.rs',
    };
    return extensionMap[language] || 'main.ts';
  }
}

// Export singleton instance
export const incrementalQuestionGenerator = new IncrementalQuestionGenerator();

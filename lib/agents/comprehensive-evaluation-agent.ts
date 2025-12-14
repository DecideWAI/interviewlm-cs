/**
 * Comprehensive Evaluation Agent
 *
 * Full session evaluation agent for hiring managers. Runs in background,
 * re-evaluates from scratch, and generates detailed actionable reports.
 *
 * Features:
 * - 4-dimension evaluation (Code Quality, Problem Solving, AI Collaboration, Communication)
 * - Evidence-based scoring with confidence metrics
 * - Actionable reports (Skills Gap Matrix, Development Roadmap, Interview Insights)
 * - Hiring recommendations with reasoning
 * - Bias detection and fairness reporting
 * - Progressive scoring for multi-question assessments
 */

import { logger } from '@/lib/utils/logger';
import prisma from '@/lib/prisma';
import {
  type ComprehensiveEvaluationInput,
  type ComprehensiveEvaluationResult,
  type ComprehensiveSessionData,
  type ComprehensiveDimensionScore,
  COMPREHENSIVE_AGENT_DEFAULTS,
  DIMENSION_WEIGHTS,
  calculateOverallScore,
  calculateOverallConfidence,
} from '@/lib/types/comprehensive-evaluation';
import {
  analyzeCodeQuality,
  analyzeProblemSolving,
  analyzeAICollaboration,
  analyzeCommunication,
} from '@/lib/agent-tools/analysis';
import {
  calculateConfidence,
  detectBias,
  generateFairnessReport,
  type ConfidenceMetrics,
} from '@/lib/evaluation/confidence-and-bias';
import {
  ProgressiveScoringCalculator,
  type ProgressiveScoreResult,
} from '@/lib/services/progressive-scoring';
import {
  ActionableReportGenerator,
  type ActionableReport,
  type EvaluationData,
} from '@/lib/services/actionable-report';
import { generateHiringRecommendation } from '@/lib/scoring';
import type { CandidateProfile, HiringRecommendation } from '@/types/analytics';
import type { SeniorityLevel } from '@/types/assessment';

// =============================================================================
// Constants
// =============================================================================

const { MODEL, MAX_ITERATIONS, MAX_TOKENS, TEMPERATURE } =
  COMPREHENSIVE_AGENT_DEFAULTS;

// =============================================================================
// Session Data Extraction
// =============================================================================

/**
 * Extract session data from the unified event store
 */
async function extractSessionData(
  sessionId: string
): Promise<ComprehensiveSessionData> {
  // Fetch all events for this session
  const events = await prisma.sessionEventLog.findMany({
    where: { sessionId },
    orderBy: { timestamp: 'asc' },
  });

  const sessionData: ComprehensiveSessionData = {
    sessionId,
    candidateId: sessionId, // Session ID is candidate ID in our system
    codeSnapshots: [],
    testResults: [],
    aiInteractions: [],
    terminalCommands: [],
    metrics: {},
  };

  for (const event of events) {
    const data = event.data as Record<string, unknown> | null;

    switch (event.eventType) {
      case 'code.snapshot':
        if (data) {
          sessionData.codeSnapshots.push({
            timestamp: event.timestamp,
            files: (data.files as Record<string, string>) || {},
            questionId: (data.questionId as string) || undefined,
            origin: event.origin as 'USER' | 'AI',
          });
        }
        break;

      case 'test.result':
      case 'test.run_complete':
        if (data) {
          sessionData.testResults.push({
            timestamp: event.timestamp,
            passed: (data.passed as number) || 0,
            failed: (data.failed as number) || 0,
            total: (data.total as number) || 0,
            output: (data.output as string) || undefined,
            questionId: (data.questionId as string) || undefined,
          });
        }
        break;

      case 'chat.user_message':
        if (data) {
          sessionData.aiInteractions.push({
            timestamp: event.timestamp,
            candidateMessage: (data.content as string) || '',
            questionId: (data.questionId as string) || undefined,
          });
        }
        break;

      case 'chat.assistant_message':
        if (data && sessionData.aiInteractions.length > 0) {
          // Attach to most recent user message
          const lastInteraction =
            sessionData.aiInteractions[sessionData.aiInteractions.length - 1];
          lastInteraction.assistantMessage = (data.content as string) || '';
          lastInteraction.toolsUsed =
            (data.toolsUsed as string[]) || undefined;
        }
        break;

      case 'terminal.input':
        if (data) {
          sessionData.terminalCommands.push({
            timestamp: event.timestamp,
            command: (data.command as string) || '',
            questionId: (data.questionId as string) || undefined,
          });
        }
        break;

      case 'terminal.output':
        if (data && sessionData.terminalCommands.length > 0) {
          // Attach to most recent command
          const lastCommand =
            sessionData.terminalCommands[sessionData.terminalCommands.length - 1];
          lastCommand.output = (data.output as string) || '';
          lastCommand.exitCode = (data.exitCode as number) || undefined;
        }
        break;

      case 'session.metrics':
        if (data) {
          sessionData.metrics = {
            aiDependencyScore: (data.aiDependencyScore as number) || undefined,
            irtTheta: (data.irtTheta as number) || undefined,
            strugglingIndicators:
              (data.strugglingIndicators as Array<{
                type: string;
                severity: string;
                timestamp: Date;
              }>) || undefined,
          };
        }
        break;
    }
  }

  return sessionData;
}

// =============================================================================
// Bias Detection
// =============================================================================

/**
 * Detect biases in comprehensive evaluation
 */
function detectBiases(
  sessionData: ComprehensiveSessionData,
  scores: {
    codeQuality: ComprehensiveDimensionScore;
    problemSolving: ComprehensiveDimensionScore;
    aiCollaboration: ComprehensiveDimensionScore;
    communication: ComprehensiveDimensionScore;
  }
): string[] {
  const biasFlags: string[] = [];

  // Code volume bias
  const lastSnapshot = sessionData.codeSnapshots.slice(-1)[0];
  if (lastSnapshot) {
    const totalLines = Object.values(lastSnapshot.files).reduce(
      (acc, content) =>
        acc + (typeof content === 'string' ? content.split('\n').length : 0),
      0
    );

    if (totalLines < 20 && scores.codeQuality.score > 80) {
      biasFlags.push('code_volume_bias');
    }
  }

  // Low confidence warning
  const avgConfidence =
    (scores.codeQuality.confidence +
      scores.problemSolving.confidence +
      scores.aiCollaboration.confidence +
      scores.communication.confidence) /
    4;

  if (avgConfidence < 0.5) {
    biasFlags.push('low_confidence_evaluation');
  }

  // No AI usage but scored for AI collaboration
  if (sessionData.aiInteractions.length === 0 && scores.aiCollaboration.score > 0) {
    biasFlags.push('ai_usage_inconsistency');
  }

  // Perfect score warning
  const overallScore = calculateOverallScore(scores);
  if (overallScore >= 98) {
    biasFlags.push('perfect_score_review_needed');
  }

  // AI over-reliance
  if (
    sessionData.metrics?.aiDependencyScore &&
    sessionData.metrics.aiDependencyScore > 0.8 &&
    scores.aiCollaboration.score < 50
  ) {
    biasFlags.push('ai_usage_penalty');
  }

  return biasFlags;
}

// =============================================================================
// Comprehensive Evaluation Agent Class
// =============================================================================

/**
 * Comprehensive Evaluation Agent
 *
 * Full session evaluation for hiring managers. Re-evaluates from scratch,
 * generates actionable reports, and provides hiring recommendations.
 */
export class ComprehensiveEvaluationAgent {
  private input: ComprehensiveEvaluationInput;

  constructor(input: ComprehensiveEvaluationInput) {
    this.input = input;
  }

  /**
   * Run comprehensive evaluation
   */
  async evaluate(): Promise<ComprehensiveEvaluationResult> {
    const startTime = Date.now();

    logger.info('[ComprehensiveEvaluationAgent] Starting evaluation', {
      sessionId: this.input.sessionId,
      candidateId: this.input.candidateId,
      role: this.input.role,
      seniority: this.input.seniority,
      questionCount: this.input.questions.length,
    });

    try {
      // 1. Extract session data from event store
      const sessionData = await extractSessionData(this.input.sessionId);

      logger.info('[ComprehensiveEvaluationAgent] Session data extracted', {
        codeSnapshots: sessionData.codeSnapshots.length,
        testResults: sessionData.testResults.length,
        aiInteractions: sessionData.aiInteractions.length,
        terminalCommands: sessionData.terminalCommands.length,
      });

      // 2. Convert to analysis format
      const analysisData = this.convertToAnalysisFormat(sessionData);

      // 3. Run 4-dimension evaluation in parallel
      const [codeQuality, problemSolving, aiCollaboration, communication] =
        await Promise.all([
          this.evaluateCodeQuality(analysisData),
          this.evaluateProblemSolving(analysisData),
          this.evaluateAICollaboration(analysisData),
          this.evaluateCommunication(analysisData),
        ]);

      const scores = { codeQuality, problemSolving, aiCollaboration, communication };

      // 4. Calculate overall scores
      const overallScore = calculateOverallScore(scores);
      const overallConfidence = calculateOverallConfidence(scores);

      // 5. Detect biases
      const biasFlags = detectBiases(sessionData, scores);

      // 6. Calculate progressive scoring (for multi-question assessments)
      const progressiveResult = await this.calculateProgressiveScoring();

      // 7. Calculate confidence metrics
      const confidenceMetrics = this.calculateConfidenceMetrics(scores, sessionData);

      // 8. Generate fairness report
      const fairnessReport = this.generateFairnessReport(biasFlags, confidenceMetrics);

      // 9. Generate actionable report
      const evaluationData = this.buildEvaluationData(
        scores,
        overallScore,
        overallConfidence,
        sessionData
      );
      const actionableReport = await this.generateActionableReport(evaluationData);

      // 10. Generate hiring recommendation
      const hiringRecommendation = await this.generateHiringRecommendation(
        scores,
        overallScore,
        overallConfidence,
        actionableReport
      );

      const evaluationTimeMs = Date.now() - startTime;

      const result: ComprehensiveEvaluationResult = {
        sessionId: this.input.sessionId,
        candidateId: this.input.candidateId,
        codeQuality,
        problemSolving,
        aiCollaboration,
        communication,
        overallScore,
        overallConfidence,
        progressiveResult,
        expertiseLevel: progressiveResult?.expertiseLevel,
        expertiseGrowth: progressiveResult?.expertiseGrowth,
        expertiseGrowthTrend: progressiveResult?.growthTrend,
        actionableReport,
        hiringRecommendation,
        confidenceMetrics,
        biasDetection: {
          biasesDetected: biasFlags,
          recommendations: this.getBiasRecommendations(biasFlags),
        },
        biasFlags,
        fairnessReport,
        evaluatedAt: new Date(),
        model: MODEL,
        evaluationTimeMs,
        toolCallCount: 0, // No tools used in comprehensive evaluation
      };

      logger.info('[ComprehensiveEvaluationAgent] Evaluation complete', {
        sessionId: this.input.sessionId,
        overallScore,
        overallConfidence: overallConfidence.toFixed(2),
        hiringDecision: hiringRecommendation.decision,
        evaluationTimeMs,
      });

      return result;
    } catch (error) {
      logger.error('[ComprehensiveEvaluationAgent] Evaluation failed', {
        sessionId: this.input.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Convert session data to analysis format
   */
  private convertToAnalysisFormat(sessionData: ComprehensiveSessionData) {
    return {
      codeSnapshots: sessionData.codeSnapshots.map((s) => ({
        timestamp: s.timestamp.toISOString(),
        files: s.files,
      })),
      testResults: sessionData.testResults.map((t) => ({
        timestamp: t.timestamp.toISOString(),
        passed: t.passed,
        failed: t.failed,
        total: t.total,
        output: t.output,
      })),
      claudeInteractions: sessionData.aiInteractions.map((i) => ({
        candidateMessage: i.candidateMessage,
        assistantMessage: i.assistantMessage,
        timestamp: i.timestamp.toISOString(),
        toolsUsed: i.toolsUsed,
      })),
      terminalCommands: sessionData.terminalCommands.map((c) => ({
        command: c.command,
        output: c.output,
        exitCode: c.exitCode,
        timestamp: c.timestamp.toISOString(),
      })),
      interviewMetrics: sessionData.metrics,
    };
  }

  /**
   * Evaluate code quality dimension
   */
  private async evaluateCodeQuality(
    analysisData: ReturnType<typeof this.convertToAnalysisFormat>
  ): Promise<ComprehensiveDimensionScore> {
    try {
      const result = await analyzeCodeQuality(
        analysisData.codeSnapshots,
        analysisData.testResults
      );
      return {
        ...result,
        evidence: result.evidence.map((e) => ({
          ...e,
          timestamp: e.timestamp ? new Date(e.timestamp) : undefined,
        })),
      };
    } catch (error) {
      logger.warn('[ComprehensiveEvaluationAgent] Code quality evaluation failed', {
        error,
      });
      return { score: 0, confidence: 0, evidence: [], breakdown: null };
    }
  }

  /**
   * Evaluate problem solving dimension
   */
  private async evaluateProblemSolving(
    analysisData: ReturnType<typeof this.convertToAnalysisFormat>
  ): Promise<ComprehensiveDimensionScore> {
    try {
      const result = await analyzeProblemSolving(
        analysisData.codeSnapshots,
        analysisData.testResults,
        analysisData.terminalCommands
      );
      return {
        ...result,
        evidence: result.evidence.map((e) => ({
          ...e,
          timestamp: e.timestamp ? new Date(e.timestamp) : undefined,
        })),
      };
    } catch (error) {
      logger.warn('[ComprehensiveEvaluationAgent] Problem solving evaluation failed', {
        error,
      });
      return { score: 0, confidence: 0, evidence: [], breakdown: null };
    }
  }

  /**
   * Evaluate AI collaboration dimension
   */
  private async evaluateAICollaboration(
    analysisData: ReturnType<typeof this.convertToAnalysisFormat>
  ): Promise<ComprehensiveDimensionScore> {
    try {
      const result = await analyzeAICollaboration(
        analysisData.claudeInteractions,
        analysisData.interviewMetrics
      );
      return {
        ...result,
        evidence: result.evidence.map((e) => ({
          ...e,
          timestamp: e.timestamp ? new Date(e.timestamp) : undefined,
        })),
      };
    } catch (error) {
      logger.warn('[ComprehensiveEvaluationAgent] AI collaboration evaluation failed', {
        error,
      });
      return { score: 0, confidence: 0, evidence: [], breakdown: null };
    }
  }

  /**
   * Evaluate communication dimension
   */
  private async evaluateCommunication(
    analysisData: ReturnType<typeof this.convertToAnalysisFormat>
  ): Promise<ComprehensiveDimensionScore> {
    try {
      const result = await analyzeCommunication(
        analysisData.claudeInteractions,
        analysisData.codeSnapshots
      );
      return {
        ...result,
        evidence: result.evidence.map((e) => ({
          ...e,
          timestamp: e.timestamp ? new Date(e.timestamp) : undefined,
        })),
      };
    } catch (error) {
      logger.warn('[ComprehensiveEvaluationAgent] Communication evaluation failed', {
        error,
      });
      return { score: 0, confidence: 0, evidence: [], breakdown: null };
    }
  }

  /**
   * Calculate progressive scoring for multi-question assessments
   */
  private async calculateProgressiveScoring(): Promise<
    ProgressiveScoreResult | undefined
  > {
    if (this.input.questions.length < 2) {
      return undefined;
    }

    try {
      const calculator = new ProgressiveScoringCalculator();

      // Fetch question scores from database
      const questions = await prisma.generatedQuestion.findMany({
        where: {
          candidateId: this.input.candidateId,
          status: 'COMPLETED',
        },
        orderBy: { order: 'asc' },
      });

      for (const question of questions) {
        if (question.score !== null) {
          calculator.addQuestionScore(
            question.id,
            question.score,
            question.difficulty,
            question.timeSpent || undefined,
            question.expectedTime || undefined
          );
        }
      }

      return calculator.calculateFinalScore();
    } catch (error) {
      logger.warn('[ComprehensiveEvaluationAgent] Progressive scoring failed', {
        error,
      });
      return undefined;
    }
  }

  /**
   * Calculate confidence metrics
   */
  private calculateConfidenceMetrics(
    scores: {
      codeQuality: ComprehensiveDimensionScore;
      problemSolving: ComprehensiveDimensionScore;
      aiCollaboration: ComprehensiveDimensionScore;
      communication: ComprehensiveDimensionScore;
    },
    sessionData: ComprehensiveSessionData
  ): ConfidenceMetrics {
    const evidenceCounts = {
      codeQuality: scores.codeQuality.evidence.length,
      problemSolving: scores.problemSolving.evidence.length,
      aiCollaboration: scores.aiCollaboration.evidence.length,
      communication: scores.communication.evidence.length,
    };

    const dataQuality =
      sessionData.codeSnapshots.length > 0 && sessionData.testResults.length > 0
        ? 0.8
        : 0.4;

    const sampleSize = Math.min(
      sessionData.codeSnapshots.length +
        sessionData.testResults.length +
        sessionData.aiInteractions.length,
      100
    ) / 100;

    const consistency =
      (scores.codeQuality.confidence +
        scores.problemSolving.confidence +
        scores.aiCollaboration.confidence +
        scores.communication.confidence) /
      4;

    const overall = (dataQuality + sampleSize + consistency) / 3;

    const warnings: string[] = [];
    if (sessionData.codeSnapshots.length === 0) {
      warnings.push('No code snapshots found');
    }
    if (sessionData.testResults.length === 0) {
      warnings.push('No test results found');
    }
    if (sessionData.aiInteractions.length === 0) {
      warnings.push('No AI interactions found');
    }

    return {
      overall,
      dataQuality,
      sampleSize,
      consistency,
      explanation: `Evaluation based on ${sessionData.codeSnapshots.length} code snapshots, ${sessionData.testResults.length} test results, and ${sessionData.aiInteractions.length} AI interactions.`,
      warnings,
    };
  }

  /**
   * Generate fairness report
   */
  private generateFairnessReport(
    biasFlags: string[],
    confidenceMetrics: ConfidenceMetrics
  ): string {
    if (biasFlags.length === 0 && confidenceMetrics.overall > 0.7) {
      return 'Evaluation appears fair with high confidence. No significant biases detected.';
    }

    const issues: string[] = [];

    if (biasFlags.includes('code_volume_bias')) {
      issues.push('Potential code volume bias - high score with minimal code');
    }
    if (biasFlags.includes('low_confidence_evaluation')) {
      issues.push('Low confidence in evaluation - limited data available');
    }
    if (biasFlags.includes('ai_usage_inconsistency')) {
      issues.push('AI usage scoring inconsistency detected');
    }
    if (biasFlags.includes('perfect_score_review_needed')) {
      issues.push('Perfect or near-perfect score - manual review recommended');
    }
    if (biasFlags.includes('ai_usage_penalty')) {
      issues.push('Possible penalty for AI usage - review AI collaboration score');
    }

    return `Fairness Review: ${issues.length} potential issue(s) detected.\n\n${issues.map((i) => `- ${i}`).join('\n')}\n\nConfidence: ${(confidenceMetrics.overall * 100).toFixed(0)}%`;
  }

  /**
   * Get bias recommendations
   */
  private getBiasRecommendations(biasFlags: string[]): string[] {
    const recommendations: string[] = [];

    for (const flag of biasFlags) {
      switch (flag) {
        case 'code_volume_bias':
          recommendations.push('Review code quality independent of volume');
          break;
        case 'low_confidence_evaluation':
          recommendations.push('Consider re-evaluation with more data');
          break;
        case 'ai_usage_inconsistency':
          recommendations.push('Verify AI collaboration scoring methodology');
          break;
        case 'perfect_score_review_needed':
          recommendations.push('Manual review recommended for exceptional scores');
          break;
        case 'ai_usage_penalty':
          recommendations.push('Review if AI usage was penalized unfairly');
          break;
      }
    }

    return recommendations;
  }

  /**
   * Build evaluation data for actionable report
   */
  private buildEvaluationData(
    scores: {
      codeQuality: ComprehensiveDimensionScore;
      problemSolving: ComprehensiveDimensionScore;
      aiCollaboration: ComprehensiveDimensionScore;
      communication: ComprehensiveDimensionScore;
    },
    overallScore: number,
    overallConfidence: number,
    sessionData: ComprehensiveSessionData
  ): EvaluationData {
    return {
      candidateId: this.input.candidateId,
      sessionId: this.input.sessionId,
      role: this.input.role,
      seniority: this.input.seniority,
      scores: {
        codeQuality: scores.codeQuality.score,
        problemSolving: scores.problemSolving.score,
        aiCollaboration: scores.aiCollaboration.score,
        communication: scores.communication.score,
        overall: overallScore,
      },
      confidence: {
        codeQuality: scores.codeQuality.confidence,
        problemSolving: scores.problemSolving.confidence,
        aiCollaboration: scores.aiCollaboration.confidence,
        communication: scores.communication.confidence,
        overall: overallConfidence,
      },
      evidence: {
        codeQuality: scores.codeQuality.evidence.map((e) => e.description),
        problemSolving: scores.problemSolving.evidence.map((e) => e.description),
        aiCollaboration: scores.aiCollaboration.evidence.map((e) => e.description),
        communication: scores.communication.evidence.map((e) => e.description),
      },
      aiInteractionCount: sessionData.aiInteractions.length,
      testResultCount: sessionData.testResults.length,
      codeSnapshotCount: sessionData.codeSnapshots.length,
    };
  }

  /**
   * Generate actionable report
   */
  private async generateActionableReport(
    evaluationData: EvaluationData
  ): Promise<ActionableReport> {
    try {
      const generator = new ActionableReportGenerator();
      return await generator.generateReport(evaluationData);
    } catch (error) {
      logger.warn('[ComprehensiveEvaluationAgent] Report generation failed', {
        error,
      });

      // Return minimal report on error
      return {
        candidateId: this.input.candidateId,
        sessionId: this.input.sessionId,
        role: this.input.role,
        seniority: this.input.seniority,
        generatedAt: new Date(),
        skillsGapMatrix: {
          overallFit: evaluationData.scores.overall,
          categories: [],
          criticalGaps: [],
          strengths: [],
          summary: 'Report generation encountered an error.',
        },
        developmentRoadmap: {
          currentLevel: this.input.seniority,
          targetLevel: this.input.seniority,
          estimatedTimeToTarget: 'N/A',
          phases: [],
          resources: [],
          milestones: [],
        },
        interviewInsights: {
          keyObservations: [],
          redFlags: [],
          greenFlags: [],
          comparativeAnalysis: {
            percentile: 50,
            similarCandidatesCount: 0,
            standoutAreas: [],
            developmentAreas: [],
          },
          recommendedFollowUp: [],
        },
        executiveSummary: 'Evaluation complete but detailed report generation failed.',
        hiringRecommendation: {
          decision: 'no-hire',
          confidence: 0.5,
          reasoning: ['Report generation error - manual review required'],
        },
      };
    }
  }

  /**
   * Generate hiring recommendation
   */
  private async generateHiringRecommendation(
    scores: {
      codeQuality: ComprehensiveDimensionScore;
      problemSolving: ComprehensiveDimensionScore;
      aiCollaboration: ComprehensiveDimensionScore;
      communication: ComprehensiveDimensionScore;
    },
    overallScore: number,
    overallConfidence: number,
    actionableReport: ActionableReport
  ): Promise<ComprehensiveEvaluationResult['hiringRecommendation']> {
    // Use actionable report's recommendation if available
    if (actionableReport.hiringRecommendation) {
      return {
        ...actionableReport.hiringRecommendation,
        aiFactorInfluence:
          actionableReport.hiringRecommendation.aiFactorInfluence || 'neutral',
      };
    }

    // Generate based on scores
    let decision: 'strong-hire' | 'hire' | 'no-hire' | 'strong-no-hire';
    const reasoning: string[] = [];

    if (overallScore >= 85 && overallConfidence >= 0.7) {
      decision = 'strong-hire';
      reasoning.push(`Excellent overall score of ${overallScore}`);
      reasoning.push('High confidence in evaluation');
    } else if (overallScore >= 70 && overallConfidence >= 0.5) {
      decision = 'hire';
      reasoning.push(`Good overall score of ${overallScore}`);
    } else if (overallScore >= 50) {
      decision = 'no-hire';
      reasoning.push(`Below threshold score of ${overallScore}`);
      if (scores.codeQuality.score < 60) {
        reasoning.push('Code quality needs improvement');
      }
    } else {
      decision = 'strong-no-hire';
      reasoning.push(`Low overall score of ${overallScore}`);
      reasoning.push('Significant skill gaps identified');
    }

    // Determine AI factor influence
    let aiFactorInfluence: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (scores.aiCollaboration.score >= 80) {
      aiFactorInfluence = 'positive';
      reasoning.push('Excellent AI collaboration skills');
    } else if (scores.aiCollaboration.score < 40) {
      aiFactorInfluence = 'negative';
      reasoning.push('Limited AI collaboration effectiveness');
    }

    return {
      decision,
      confidence: overallConfidence,
      reasoning,
      aiFactorInfluence,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Comprehensive Evaluation Agent
 */
export function createComprehensiveEvaluationAgent(
  input: ComprehensiveEvaluationInput
): ComprehensiveEvaluationAgent {
  return new ComprehensiveEvaluationAgent(input);
}

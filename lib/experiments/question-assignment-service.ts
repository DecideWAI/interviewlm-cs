/**
 * Question Assignment Service
 *
 * DB-based question generation backend selection with experiment support.
 * Follows the same pattern as AgentAssignmentService but for question generation.
 *
 * Priority order:
 * 1. Existing session assignment (sticky)
 * 2. Active experiment assignment
 * 3. AgentConfig question-gen defaults
 * 4. Environment variable
 * 5. Hardcoded default (typescript)
 */

import prisma from '@/lib/prisma';
import type { AgentBackend as PrismaAgentBackend, ExperimentStatus } from '@prisma/client';
import crypto from 'crypto';
import type { QuestionBackendType, QuestionAssignmentContext, QuestionAssignmentResult } from './types';

// Map Prisma enum to string types
const BACKEND_MAP: Record<PrismaAgentBackend, QuestionBackendType> = {
  CLAUDE_SDK: 'typescript',
  LANGGRAPH: 'langgraph',
};

const REVERSE_BACKEND_MAP: Record<QuestionBackendType, PrismaAgentBackend> = {
  typescript: 'CLAUDE_SDK',
  langgraph: 'LANGGRAPH',
};

/**
 * Question Assignment Service
 *
 * Determines which question generation backend to use for a session.
 */
export class QuestionAssignmentService {
  private static instance: QuestionAssignmentService;

  private constructor() {}

  static getInstance(): QuestionAssignmentService {
    if (!QuestionAssignmentService.instance) {
      QuestionAssignmentService.instance = new QuestionAssignmentService();
    }
    return QuestionAssignmentService.instance;
  }

  /**
   * Get the question generation backend for a session
   *
   * Main entry point. Will:
   * 1. Return existing assignment if session already has one (sticky)
   * 2. Otherwise, determine backend and persist assignment
   */
  async getBackendForSession(context: QuestionAssignmentContext): Promise<QuestionAssignmentResult> {
    // 1. Check if session already has a question backend assignment (sticky)
    const existingAssignment = await this.getExistingAssignment(context.sessionId);
    if (existingAssignment) {
      return existingAssignment;
    }

    // 2. Determine backend and create assignment
    const assignment = await this.determineBackend(context);

    // 3. Persist assignment to session
    await this.persistAssignment(context.sessionId, assignment);

    return assignment;
  }

  /**
   * Check for existing session question backend assignment
   */
  private async getExistingAssignment(sessionId: string): Promise<QuestionAssignmentResult | null> {
    try {
      const session = await prisma.sessionRecording.findFirst({
        where: {
          OR: [{ id: sessionId }, { candidateId: sessionId }],
        },
        select: {
          questionBackend: true,
          questionExperimentId: true,
        },
      });

      if (session?.questionBackend) {
        // Check if this was from an experiment
        let variant: 'control' | 'treatment' | undefined;
        if (session.questionExperimentId) {
          const assignment = await prisma.questionExperimentAssignment.findUnique({
            where: { sessionId },
            select: { variant: true },
          });
          variant = assignment?.variant as 'control' | 'treatment' | undefined;
        }

        return {
          backend: BACKEND_MAP[session.questionBackend],
          experimentId: session.questionExperimentId ?? undefined,
          variant,
          source: 'session',
        };
      }
    } catch (error) {
      console.error('[QuestionAssignment] Error checking existing assignment:', error);
    }

    return null;
  }

  /**
   * Determine which question backend to use
   */
  private async determineBackend(context: QuestionAssignmentContext): Promise<QuestionAssignmentResult> {
    // 2. Check for active experiments
    const experimentAssignment = await this.checkExperiments(context);
    if (experimentAssignment) {
      return experimentAssignment;
    }

    // 3. Check AgentConfig for org/assessment
    const configBackend = await this.getConfiguredBackend(context);
    if (configBackend) {
      return configBackend;
    }

    // 4. Check environment variable
    const envBackend = this.getEnvBackend();
    if (envBackend) {
      return envBackend;
    }

    // 5. Default to langgraph (changed from typescript for 100% LangGraph)
    return {
      backend: 'langgraph',
      source: 'default',
    };
  }

  /**
   * Check for active question generation experiments and assign if eligible
   */
  private async checkExperiments(context: QuestionAssignmentContext): Promise<QuestionAssignmentResult | null> {
    try {
      // Find applicable config with question experiments enabled
      const config = await this.findApplicableConfig(context);
      if (!config?.questionEnableExperiments) {
        return null;
      }

      // Find running question experiments for this config
      const runningExperiments = await prisma.questionExperiment.findMany({
        where: {
          configId: config.id,
          status: 'RUNNING' as ExperimentStatus,
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const experiment of runningExperiments) {
        // Check targeting rules
        if (!this.matchesTargetingRules(experiment.targetingRules, context)) {
          continue;
        }

        // Assign to variant using consistent hashing
        const variant = this.assignVariant(
          context.candidateId,
          experiment.id,
          experiment.controlPercent,
        );

        const backend =
          variant === 'control'
            ? BACKEND_MAP[experiment.controlBackend]
            : BACKEND_MAP[experiment.treatmentBackend];

        // Record experiment assignment
        await prisma.questionExperimentAssignment.create({
          data: {
            experimentId: experiment.id,
            sessionId: context.sessionId,
            candidateId: context.candidateId,
            variant,
            assignedBackend: REVERSE_BACKEND_MAP[backend],
          },
        });

        // Update experiment session counts
        if (variant === 'control') {
          await prisma.questionExperiment.update({
            where: { id: experiment.id },
            data: { controlSessions: { increment: 1 } },
          });
        } else {
          await prisma.questionExperiment.update({
            where: { id: experiment.id },
            data: { treatmentSessions: { increment: 1 } },
          });
        }

        return {
          backend,
          experimentId: experiment.id,
          variant,
          source: 'experiment',
        };
      }
    } catch (error) {
      console.error('[QuestionAssignment] Error checking experiments:', error);
    }

    return null;
  }

  /**
   * Check targeting rules
   */
  private matchesTargetingRules(
    rules: unknown,
    context: QuestionAssignmentContext,
  ): boolean {
    if (!rules || typeof rules !== 'object') {
      return true; // No rules = match all
    }

    const targeting = rules as {
      seniorityIn?: string[];
      roleIn?: string[];
      assessmentTypeIn?: string[];
    };

    // Check seniority
    if (targeting.seniorityIn?.length && context.seniority) {
      if (!targeting.seniorityIn.includes(context.seniority)) {
        return false;
      }
    }

    // Check role
    if (targeting.roleIn?.length && context.role) {
      if (!targeting.roleIn.includes(context.role)) {
        return false;
      }
    }

    // Check assessment type
    if (targeting.assessmentTypeIn?.length && context.assessmentType) {
      if (!targeting.assessmentTypeIn.includes(context.assessmentType)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Assign variant using consistent hashing
   */
  private assignVariant(
    candidateId: string,
    experimentId: string,
    controlPercent: number,
  ): 'control' | 'treatment' {
    const hash = crypto
      .createHash('md5')
      .update(candidateId + experimentId + 'question') // Add 'question' to differentiate from agent assignments
      .digest('hex');
    const bucket = parseInt(hash.substring(0, 8), 16) % 100;
    return bucket < controlPercent ? 'control' : 'treatment';
  }

  /**
   * Get configured backend from AgentConfig question-gen fields
   */
  private async getConfiguredBackend(
    context: QuestionAssignmentContext,
  ): Promise<QuestionAssignmentResult | null> {
    const config = await this.findApplicableConfig(context);
    if (!config) {
      return null;
    }

    // Use weighted selection if both weights are > 0
    if (config.questionLangGraphWeight > 0 && config.questionClaudeSdkWeight > 0) {
      const totalWeight = config.questionLangGraphWeight + config.questionClaudeSdkWeight;
      const hash = crypto
        .createHash('md5')
        .update(context.candidateId + context.sessionId + 'question')
        .digest('hex');
      const bucket = parseInt(hash.substring(0, 8), 16) % totalWeight;

      const backend: QuestionBackendType =
        bucket < config.questionLangGraphWeight ? 'langgraph' : 'typescript';

      return {
        backend,
        source: 'config',
      };
    }

    return {
      backend: BACKEND_MAP[config.questionDefaultBackend],
      source: 'config',
    };
  }

  /**
   * Find applicable AgentConfig
   * Priority: assessment-specific > org-specific > global
   */
  private async findApplicableConfig(context: QuestionAssignmentContext) {
    // 1. Assessment-specific config
    if (context.assessmentId && context.organizationId) {
      const assessmentConfig = await prisma.agentConfig.findFirst({
        where: {
          organizationId: context.organizationId,
          assessmentId: context.assessmentId,
          isActive: true,
        },
      });
      if (assessmentConfig) return assessmentConfig;
    }

    // 2. Organization-specific config
    if (context.organizationId) {
      const orgConfig = await prisma.agentConfig.findFirst({
        where: {
          organizationId: context.organizationId,
          assessmentId: null,
          isActive: true,
        },
      });
      if (orgConfig) return orgConfig;
    }

    // 3. Global config
    const globalConfig = await prisma.agentConfig.findFirst({
      where: {
        organizationId: null,
        assessmentId: null,
        isActive: true,
      },
    });
    return globalConfig;
  }

  /**
   * Get backend from environment variable
   */
  private getEnvBackend(): QuestionAssignmentResult | null {
    const envValue = process.env.USE_LANGGRAPH_QUESTIONS;
    if (envValue === 'true') {
      return {
        backend: 'langgraph',
        source: 'env',
      };
    }
    if (envValue === 'false') {
      return {
        backend: 'typescript',
        source: 'env',
      };
    }
    return null;
  }

  /**
   * Persist assignment to session recording
   */
  private async persistAssignment(
    sessionId: string,
    assignment: QuestionAssignmentResult,
  ): Promise<void> {
    try {
      await prisma.sessionRecording.updateMany({
        where: {
          OR: [{ id: sessionId }, { candidateId: sessionId }],
        },
        data: {
          questionBackend: REVERSE_BACKEND_MAP[assignment.backend],
          questionExperimentId: assignment.experimentId,
        },
      });
    } catch (error) {
      // Session might not exist yet, that's okay - will be set when created
      console.warn('[QuestionAssignment] Could not persist assignment:', error);
    }
  }

  /**
   * Record question generation latency for experiment tracking
   */
  async recordGenerationLatency(
    sessionId: string,
    latencyMs: number,
    questionId?: string,
  ): Promise<void> {
    try {
      const assignment = await prisma.questionExperimentAssignment.findUnique({
        where: { sessionId },
      });

      if (assignment) {
        await prisma.questionExperimentAssignment.update({
          where: { id: assignment.id },
          data: {
            generationLatency: latencyMs,
            questionId,
          },
        });

        // Update experiment average latencies
        await this.updateExperimentLatencies(assignment.experimentId);
      }
    } catch (error) {
      console.error('[QuestionAssignment] Error recording latency:', error);
    }
  }

  /**
   * Update experiment average latencies
   */
  private async updateExperimentLatencies(experimentId: string): Promise<void> {
    // Calculate control average latency
    const controlStats = await prisma.questionExperimentAssignment.aggregate({
      where: {
        experimentId,
        variant: 'control',
        generationLatency: { not: null },
      },
      _avg: { generationLatency: true },
    });

    // Calculate treatment average latency
    const treatmentStats = await prisma.questionExperimentAssignment.aggregate({
      where: {
        experimentId,
        variant: 'treatment',
        generationLatency: { not: null },
      },
      _avg: { generationLatency: true },
    });

    await prisma.questionExperiment.update({
      where: { id: experimentId },
      data: {
        controlAvgLatency: controlStats._avg.generationLatency,
        treatmentAvgLatency: treatmentStats._avg.generationLatency,
      },
    });
  }

  /**
   * Get experiment results summary
   */
  async getExperimentResults(experimentId: string) {
    const experiment = await prisma.questionExperiment.findUnique({
      where: { id: experimentId },
      include: {
        assignments: {
          select: {
            variant: true,
            generationLatency: true,
          },
        },
      },
    });

    if (!experiment) return null;

    const controlAssignments = experiment.assignments.filter(
      (a) => a.variant === 'control',
    );
    const treatmentAssignments = experiment.assignments.filter(
      (a) => a.variant === 'treatment',
    );

    return {
      experimentId,
      name: experiment.name,
      status: experiment.status,
      control: {
        backend: BACKEND_MAP[experiment.controlBackend],
        totalSessions: controlAssignments.length,
        avgLatency: experiment.controlAvgLatency,
      },
      treatment: {
        backend: BACKEND_MAP[experiment.treatmentBackend],
        totalSessions: treatmentAssignments.length,
        avgLatency: experiment.treatmentAvgLatency,
      },
      startedAt: experiment.startedAt,
      endedAt: experiment.endedAt,
    };
  }
}

// Export singleton instance
export const questionAssignmentService = QuestionAssignmentService.getInstance();

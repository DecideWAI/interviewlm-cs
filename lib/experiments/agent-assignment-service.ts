/**
 * Agent Assignment Service
 *
 * DB-based agent backend selection with experiment support.
 * Once a backend is chosen for a session, it persists for the entire session.
 */

import prisma from '@/lib/prisma';
import type { AgentBackend as PrismaAgentBackend, ExperimentStatus } from '@prisma/client';
import crypto from 'crypto';

// Map Prisma enum to string types used in the codebase
export type AgentBackendType = 'claude-sdk' | 'langgraph';

const BACKEND_MAP: Record<PrismaAgentBackend, AgentBackendType> = {
  CLAUDE_SDK: 'claude-sdk',
  LANGGRAPH: 'langgraph',
};

const REVERSE_BACKEND_MAP: Record<AgentBackendType, PrismaAgentBackend> = {
  'claude-sdk': 'CLAUDE_SDK',
  langgraph: 'LANGGRAPH',
};

export interface AssignmentContext {
  sessionId: string;
  candidateId: string;
  organizationId?: string;
  assessmentId?: string;
  // Optional targeting metadata
  seniority?: string;
  role?: string;
  assessmentType?: string;
}

export interface AssignmentResult {
  backend: AgentBackendType;
  experimentId?: string;
  variant?: 'control' | 'treatment';
  source: 'session' | 'experiment' | 'config' | 'env' | 'default';
}

/**
 * Agent Assignment Service
 *
 * Determines which agent backend to use for a session.
 * Priority order:
 * 1. Existing session assignment (sticky)
 * 2. Active experiment assignment
 * 3. AgentConfig default for org/assessment
 * 4. Global AgentConfig default
 * 5. Environment variable
 * 6. Hardcoded default (langgraph)
 */
export class AgentAssignmentService {
  private static instance: AgentAssignmentService;

  private constructor() {}

  static getInstance(): AgentAssignmentService {
    if (!AgentAssignmentService.instance) {
      AgentAssignmentService.instance = new AgentAssignmentService();
    }
    return AgentAssignmentService.instance;
  }

  /**
   * Get the agent backend for a session
   *
   * This is the main entry point. It will:
   * 1. Return existing assignment if session already has one (sticky)
   * 2. Otherwise, determine backend and persist assignment
   */
  async getBackendForSession(context: AssignmentContext): Promise<AssignmentResult> {
    // 1. Check if session already has an assignment (sticky)
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
   * Check for existing session assignment
   */
  private async getExistingAssignment(sessionId: string): Promise<AssignmentResult | null> {
    try {
      const session = await prisma.sessionRecording.findFirst({
        where: {
          OR: [{ id: sessionId }, { candidateId: sessionId }],
        },
        select: {
          agentBackend: true,
          experimentId: true,
        },
      });

      if (session?.agentBackend) {
        // Check if this was from an experiment
        let variant: 'control' | 'treatment' | undefined;
        if (session.experimentId) {
          const assignment = await prisma.agentExperimentAssignment.findUnique({
            where: { sessionId },
            select: { variant: true },
          });
          variant = assignment?.variant as 'control' | 'treatment' | undefined;
        }

        return {
          backend: BACKEND_MAP[session.agentBackend],
          experimentId: session.experimentId ?? undefined,
          variant,
          source: 'session',
        };
      }
    } catch (error) {
      console.error('[AgentAssignment] Error checking existing assignment:', error);
    }

    return null;
  }

  /**
   * Determine which backend to use
   */
  private async determineBackend(context: AssignmentContext): Promise<AssignmentResult> {
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

    // 5. Default to langgraph
    return {
      backend: 'langgraph',
      source: 'default',
    };
  }

  /**
   * Check for active experiments and assign if eligible
   */
  private async checkExperiments(context: AssignmentContext): Promise<AssignmentResult | null> {
    try {
      // Find applicable config with experiments enabled
      const config = await this.findApplicableConfig(context);
      if (!config?.enableExperiments) {
        return null;
      }

      // Find running experiments for this config
      const runningExperiments = await prisma.agentExperiment.findMany({
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
        await prisma.agentExperimentAssignment.create({
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
          await prisma.agentExperiment.update({
            where: { id: experiment.id },
            data: { controlSessions: { increment: 1 } },
          });
        } else {
          await prisma.agentExperiment.update({
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
      console.error('[AgentAssignment] Error checking experiments:', error);
    }

    return null;
  }

  /**
   * Check targeting rules
   */
  private matchesTargetingRules(
    rules: unknown,
    context: AssignmentContext,
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
      .update(candidateId + experimentId)
      .digest('hex');
    const bucket = parseInt(hash.substring(0, 8), 16) % 100;
    return bucket < controlPercent ? 'control' : 'treatment';
  }

  /**
   * Get configured backend from AgentConfig
   */
  private async getConfiguredBackend(
    context: AssignmentContext,
  ): Promise<AssignmentResult | null> {
    const config = await this.findApplicableConfig(context);
    if (!config) {
      return null;
    }

    // Use weighted selection if both weights are > 0
    if (config.langGraphWeight > 0 && config.claudeSdkWeight > 0) {
      const totalWeight = config.langGraphWeight + config.claudeSdkWeight;
      const hash = crypto
        .createHash('md5')
        .update(context.candidateId + context.sessionId)
        .digest('hex');
      const bucket = parseInt(hash.substring(0, 8), 16) % totalWeight;

      const backend: AgentBackendType =
        bucket < config.langGraphWeight ? 'langgraph' : 'claude-sdk';

      return {
        backend,
        source: 'config',
      };
    }

    return {
      backend: BACKEND_MAP[config.defaultBackend],
      source: 'config',
    };
  }

  /**
   * Find applicable AgentConfig
   * Priority: assessment-specific > org-specific > global
   */
  private async findApplicableConfig(context: AssignmentContext) {
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
  private getEnvBackend(): AssignmentResult | null {
    const envValue = process.env.USE_LANGGRAPH_AGENT;
    if (envValue === 'true') {
      return {
        backend: 'langgraph',
        source: 'env',
      };
    }
    if (envValue === 'false') {
      return {
        backend: 'claude-sdk',
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
    assignment: AssignmentResult,
  ): Promise<void> {
    try {
      await prisma.sessionRecording.updateMany({
        where: {
          OR: [{ id: sessionId }, { candidateId: sessionId }],
        },
        data: {
          agentBackend: REVERSE_BACKEND_MAP[assignment.backend],
          experimentId: assignment.experimentId,
        },
      });
    } catch (error) {
      // Session might not exist yet, that's okay - will be set when created
      console.warn('[AgentAssignment] Could not persist assignment:', error);
    }
  }

  /**
   * Record session completion for experiment tracking
   */
  async recordSessionCompletion(
    sessionId: string,
    overallScore?: number,
  ): Promise<void> {
    try {
      const assignment = await prisma.agentExperimentAssignment.findUnique({
        where: { sessionId },
      });

      if (assignment) {
        await prisma.agentExperimentAssignment.update({
          where: { id: assignment.id },
          data: {
            sessionCompleted: true,
            overallScore,
            completedAt: new Date(),
          },
        });

        // Update experiment average scores
        await this.updateExperimentScores(assignment.experimentId);
      }
    } catch (error) {
      console.error('[AgentAssignment] Error recording completion:', error);
    }
  }

  /**
   * Update experiment average scores
   */
  private async updateExperimentScores(experimentId: string): Promise<void> {
    // Calculate control average
    const controlStats = await prisma.agentExperimentAssignment.aggregate({
      where: {
        experimentId,
        variant: 'control',
        sessionCompleted: true,
        overallScore: { not: null },
      },
      _avg: { overallScore: true },
    });

    // Calculate treatment average
    const treatmentStats = await prisma.agentExperimentAssignment.aggregate({
      where: {
        experimentId,
        variant: 'treatment',
        sessionCompleted: true,
        overallScore: { not: null },
      },
      _avg: { overallScore: true },
    });

    await prisma.agentExperiment.update({
      where: { id: experimentId },
      data: {
        controlAvgScore: controlStats._avg.overallScore,
        treatmentAvgScore: treatmentStats._avg.overallScore,
      },
    });
  }

  /**
   * Get experiment results summary
   */
  async getExperimentResults(experimentId: string) {
    const experiment = await prisma.agentExperiment.findUnique({
      where: { id: experimentId },
      include: {
        assignments: {
          select: {
            variant: true,
            sessionCompleted: true,
            overallScore: true,
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
        completedSessions: controlAssignments.filter((a) => a.sessionCompleted)
          .length,
        avgScore: experiment.controlAvgScore,
      },
      treatment: {
        backend: BACKEND_MAP[experiment.treatmentBackend],
        totalSessions: treatmentAssignments.length,
        completedSessions: treatmentAssignments.filter((a) => a.sessionCompleted)
          .length,
        avgScore: experiment.treatmentAvgScore,
      },
      startedAt: experiment.startedAt,
      endedAt: experiment.endedAt,
    };
  }
}

// Export singleton instance
export const agentAssignmentService = AgentAssignmentService.getInstance();

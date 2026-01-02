/**
 * Experiment Framework
 *
 * A/B testing and feature flag system for comparing different agent implementations.
 * Supports routing between Claude Code SDK (TypeScript) and LangGraph (Python) agents.
 *
 * Uses DB-based AgentAssignmentService for persistent, session-sticky assignments.
 */

export * from './types';
export * from './experiment-service';
export * from './agent-router';
export * from './metrics-collector';
export * from './agent-assignment-service';
export * from './question-assignment-service';

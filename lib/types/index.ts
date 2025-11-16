/**
 * Type Exports
 *
 * Central export point for all TypeScript types used across InterviewLM.
 * Import from this file to maintain consistency and enable easy refactoring.
 */

// Agent types
export type {
  ClaudeModel,
  AgentTool,
  HelpfulnessLevel,
  HelpfulnessConfig,
  PermissionConfig,
  AgentConfig,
  CodingAgentConfig,
  InterviewAgentConfig,
  EvaluationAgentConfig,
  SessionRecording,
  CodeSnapshot,
  AIInteraction,
  TestResult,
  TerminalCommand,
  ScoringWeights,
  AgentResponse,
} from './agent';

export { HELPFULNESS_CONFIGS, DEFAULT_SCORING_WEIGHTS } from './agent';

// Event types
export type {
  QueueName,
  InterviewEventType,
  EvaluationEventType,
  NotificationEventType,
  BaseEventData,
  AIInteractionEventData,
  CodeChangedEventData,
  TestRunEventData,
  QuestionAnsweredEventData,
  SessionStartedEventData,
  SessionCompleteEventData,
  AdjustDifficultyEventData,
  EvaluationAnalyzeEventData,
  GenerateReportEventData,
  EvaluationCompleteEventData,
  InterviewInvitedEventData,
  InterviewEventData,
  EvaluationEventData,
  NotificationEventData,
  Event,
} from './events';

export {
  QUEUE_NAMES,
  createInterviewEvent,
  createEvaluationEvent,
  createNotificationEvent,
} from './events';

// Role types
export type { Role, RoutePermission } from './roles';

export { ROLE_PERMISSIONS, isRouteAllowed, getRolePermissions } from './roles';

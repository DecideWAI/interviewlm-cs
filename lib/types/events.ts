/**
 * BullMQ Event Types
 *
 * Type-safe event definitions for the InterviewLM event-driven architecture.
 * All events are published to BullMQ queues and consumed by specialized workers.
 */

import type { AgentTool } from './agent';

/**
 * Queue names
 */
export const QUEUE_NAMES = {
  INTERVIEW: 'interview',
  EVALUATION: 'evaluation',
  NOTIFICATION: 'notification',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Event types for the interview queue
 */
export type InterviewEventType =
  | 'ai-interaction'
  | 'code-changed'
  | 'test-run'
  | 'question-answered'
  | 'session-started'
  | 'session-complete'
  | 'adjust-difficulty';

/**
 * Event types for the evaluation queue
 */
export type EvaluationEventType = 'analyze' | 'generate-report';

/**
 * Event types for the notification queue
 */
export type NotificationEventType =
  | 'evaluation-complete'
  | 'interview-invited'
  | 'interview-reminder'
  | 'interview-expired';

/**
 * Base event data (common to all events)
 */
export interface BaseEventData {
  sessionId: string;
  timestamp: Date;
}

/**
 * AI Interaction Event
 * Triggered when candidate sends a message to the Coding Agent
 */
export interface AIInteractionEventData extends BaseEventData {
  candidateMessage: string;
  aiResponse: string;
  toolsUsed: AgentTool[];
  filesModified: string[];
}

/**
 * Code Changed Event
 * Triggered when files in the workspace are modified
 */
export interface CodeChangedEventData extends BaseEventData {
  files: Record<string, string>; // filename -> content
  trigger: 'manual' | 'ai' | 'test';
}

/**
 * Test Run Event
 * Triggered when tests are executed
 */
export interface TestRunEventData extends BaseEventData {
  passed: number;
  failed: number;
  total: number;
  coverage?: number;
  output: string;
}

/**
 * Question Answered Event
 * Triggered when candidate submits an answer to a question
 */
export interface QuestionAnsweredEventData extends BaseEventData {
  questionId: string;
  answer: string;
  timeSpent: number; // seconds
  isCorrect?: boolean;
}

/**
 * Session Started Event
 * Triggered when an interview session begins
 */
export interface SessionStartedEventData extends BaseEventData {
  candidateId: string;
  questionId: string;
  difficulty: number;
  questionSeed: string;
}

/**
 * Session Complete Event
 * Triggered when candidate submits the interview
 */
export interface SessionCompleteEventData extends BaseEventData {
  candidateId: string;
  questionId: string;
  duration: number; // seconds
  finalCode: Record<string, string>; // filename -> content
}

/**
 * Adjust Difficulty Event
 * Triggered by Interview Agent when difficulty should change
 */
export interface AdjustDifficultyEventData extends BaseEventData {
  newDifficulty: number;
  irtTheta: number; // Updated ability estimate
  reason: string;
}

/**
 * Evaluation Analyze Event
 * Triggered when an interview should be evaluated
 */
export interface EvaluationAnalyzeEventData extends BaseEventData {
  candidateId: string;
  priority?: number; // 1-10, higher = more urgent
}

/**
 * Generate Report Event
 * Triggered to generate a detailed evaluation report
 */
export interface GenerateReportEventData extends BaseEventData {
  evaluationId: string;
  format: 'json' | 'html' | 'pdf';
}

/**
 * Evaluation Complete Notification Event
 * Triggered when evaluation is finished
 */
export interface EvaluationCompleteEventData extends BaseEventData {
  candidateId: string;
  evaluationId: string;
  overallScore: number;
}

/**
 * Interview Invited Notification Event
 * Triggered when a candidate is invited
 */
export interface InterviewInvitedEventData extends BaseEventData {
  candidateEmail: string;
  candidateName: string;
  inviteLink: string;
  expiresAt: Date;
}

/**
 * Union type for all interview events
 */
export type InterviewEventData =
  | AIInteractionEventData
  | CodeChangedEventData
  | TestRunEventData
  | QuestionAnsweredEventData
  | SessionStartedEventData
  | SessionCompleteEventData
  | AdjustDifficultyEventData;

/**
 * Union type for all evaluation events
 */
export type EvaluationEventData = EvaluationAnalyzeEventData | GenerateReportEventData;

/**
 * Union type for all notification events
 */
export type NotificationEventData =
  | EvaluationCompleteEventData
  | InterviewInvitedEventData;

/**
 * Generic event with type discrimination
 */
export interface Event<T extends string, D extends BaseEventData> {
  type: T;
  data: D;
}

/**
 * Type-safe event creators
 */
export function createInterviewEvent<T extends InterviewEventType>(
  type: T,
  data: Extract<InterviewEventData, { sessionId: string }>
): Event<T, typeof data> {
  return { type, data };
}

export function createEvaluationEvent<T extends EvaluationEventType>(
  type: T,
  data: Extract<EvaluationEventData, { sessionId: string }>
): Event<T, typeof data> {
  return { type, data };
}

export function createNotificationEvent<T extends NotificationEventType>(
  type: T,
  data: Extract<NotificationEventData, { sessionId: string }>
): Event<T, typeof data> {
  return { type, data };
}

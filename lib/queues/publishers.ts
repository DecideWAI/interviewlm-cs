/**
 * Event Publishers
 *
 * Type-safe functions for publishing events to BullMQ queues.
 * Provides a clean API for adding jobs from anywhere in the application.
 */

import { JobsOptions } from 'bullmq';
import { getQueue } from './config';
import {
  QUEUE_NAMES,
  type InterviewEventType,
  type EvaluationEventType,
  type NotificationEventType,
  type AIInteractionEventData,
  type CodeChangedEventData,
  type TestRunEventData,
  type QuestionAnsweredEventData,
  type SessionStartedEventData,
  type SessionCompleteEventData,
  type AdjustDifficultyEventData,
  type EvaluationAnalyzeEventData,
  type GenerateReportEventData,
  type EvaluationCompleteEventData,
  type InterviewInvitedEventData,
} from '../types/events';

/**
 * Base job options
 * Can be overridden per event
 */
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: true,
  removeOnFail: false,
};

/**
 * Publish an AI interaction event
 * Triggered when candidate sends a message to the Coding Agent
 */
export async function publishAIInteraction(
  data: AIInteractionEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.INTERVIEW);
  const eventType: InterviewEventType = 'ai-interaction';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    jobId: `${data.sessionId}_${eventType}_${Date.now()}`,
  });
}

/**
 * Publish a code changed event
 * Triggered when files in the workspace are modified
 */
export async function publishCodeChanged(
  data: CodeChangedEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.INTERVIEW);
  const eventType: InterviewEventType = 'code-changed';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    jobId: `${data.sessionId}_${eventType}_${Date.now()}`,
  });
}

/**
 * Publish a test run event
 * Triggered when tests are executed
 */
export async function publishTestRun(
  data: TestRunEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.INTERVIEW);
  const eventType: InterviewEventType = 'test-run';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    jobId: `${data.sessionId}_${eventType}_${Date.now()}`,
  });
}

/**
 * Publish a question answered event
 * Triggered when candidate submits an answer
 */
export async function publishQuestionAnswered(
  data: QuestionAnsweredEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.INTERVIEW);
  const eventType: InterviewEventType = 'question-answered';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    jobId: `${data.sessionId}_${eventType}_${Date.now()}`,
  });
}

/**
 * Publish a session started event
 * Triggered when an interview session begins
 */
export async function publishSessionStarted(
  data: SessionStartedEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.INTERVIEW);
  const eventType: InterviewEventType = 'session-started';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    jobId: `${data.sessionId}_${eventType}`,
  });
}

/**
 * Publish a session complete event
 * Triggered when candidate submits the interview
 */
export async function publishSessionComplete(
  data: SessionCompleteEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.INTERVIEW);
  const eventType: InterviewEventType = 'session-complete';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    priority: 2, // Higher priority for completion
    jobId: `${data.sessionId}_${eventType}`,
  });
}

/**
 * Publish an adjust difficulty event
 * Triggered by Interview Agent when difficulty should change
 */
export async function publishAdjustDifficulty(
  data: AdjustDifficultyEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.INTERVIEW);
  const eventType: InterviewEventType = 'adjust-difficulty';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    jobId: `${data.sessionId}_${eventType}_${Date.now()}`,
  });
}

/**
 * Publish an evaluation analyze event
 * Triggered when an interview should be evaluated
 */
export async function publishEvaluationAnalyze(
  data: EvaluationAnalyzeEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.EVALUATION);
  const eventType: EvaluationEventType = 'analyze';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    priority: data.priority || 5, // Use priority from data, default to 5
    jobId: `${data.sessionId}_${eventType}`,
  });
}

/**
 * Publish a generate report event
 * Triggered to generate a detailed evaluation report
 */
export async function publishGenerateReport(
  data: GenerateReportEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.EVALUATION);
  const eventType: EvaluationEventType = 'generate-report';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    jobId: `${data.sessionId}_${eventType}_${data.format}`,
  });
}

/**
 * Publish an evaluation complete notification event
 * Triggered when evaluation is finished
 */
export async function publishEvaluationComplete(
  data: EvaluationCompleteEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.NOTIFICATION);
  const eventType: NotificationEventType = 'evaluation-complete';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    jobId: `${data.sessionId}_${eventType}`,
  });
}

/**
 * Publish an interview invited notification event
 * Triggered when a candidate is invited
 */
export async function publishInterviewInvited(
  data: InterviewInvitedEventData,
  options?: JobsOptions
) {
  const queue = getQueue(QUEUE_NAMES.NOTIFICATION);
  const eventType: NotificationEventType = 'interview-invited';

  await queue.add(eventType, data, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
    priority: 10, // Invitations are high priority
    jobId: `${data.sessionId}_${eventType}`,
  });
}

/**
 * Batch publish multiple events at once
 * More efficient than individual publishes
 */
export async function publishBatch<T extends string, D extends { sessionId: string }>(
  queueName: string,
  events: Array<{ type: T; data: D; options?: JobsOptions }>
) {
  const queue = getQueue(queueName as any);

  const jobs = events.map(({ type, data, options }) => ({
    name: type,
    data,
    opts: {
      ...DEFAULT_JOB_OPTIONS,
      ...options,
      jobId: `${data.sessionId}_${type}_${Date.now()}`,
    },
  }));

  await queue.addBulk(jobs);
}

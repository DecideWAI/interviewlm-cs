/**
 * Queue Exports
 *
 * Central export point for BullMQ queue configuration and event publishers.
 */

// Configuration
export {
  redisConnection,
  defaultQueueOptions,
  queueOptionsOverrides,
  getQueue,
  closeAllQueues,
  pauseAllQueues,
  resumeAllQueues,
  getQueuesHealth,
  type QueueHealth,
} from './config';

// Event publishers
export {
  publishAIInteraction,
  publishCodeChanged,
  publishTestRun,
  publishQuestionAnswered,
  publishSessionStarted,
  publishSessionComplete,
  publishAdjustDifficulty,
  publishEvaluationAnalyze,
  publishGenerateReport,
  publishEvaluationComplete,
  publishInterviewInvited,
  publishBatch,
} from './publishers';

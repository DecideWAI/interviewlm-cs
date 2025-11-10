/**
 * InterviewLM Services
 *
 * Central export point for all service layer modules.
 * Import services using: import { claudeService, modalService } from '@/lib/services'
 */

// Claude AI Service
export * as claudeService from "./claude";
export type {
  TokenUsage,
  StreamChunk,
  ChatResponse,
} from "./claude";

// Modal AI Sandbox Service
export * as modalService from "./modal";
export type {
  TestResult,
  ExecutionResult,
  SandboxInstance,
} from "./modal";

// S3 Storage Service
export * as s3Service from "./s3";
export type {
  UploadResult,
  DownloadResult,
} from "./s3";

// Session Recording Service
export * as sessionService from "./sessions";

// Dynamic Question Generation Service
export * as questionService from "./questions";
export type {
  QuestionGenerationResult,
} from "./questions";

// Re-export individual functions for direct imports
export {
  streamChatCompletion,
  getChatCompletion,
  CURRENT_MODEL,
} from "./claude";

export {
  executeCode,
  createSandbox,
  destroySandbox,
  getTerminalConnectionUrl,
} from "./modal";

export {
  uploadSessionRecording,
  downloadSessionRecording,
  generatePresignedUrl,
} from "./s3";

export {
  createSession,
  recordEvent,
  recordClaudeInteraction,
  recordCodeSnapshot,
  recordTestResult,
  closeSession,
  getSessionRecording,
  getSessionStats,
} from "./sessions";

export {
  generateQuestion,
  getNextQuestion,
  startQuestion,
  completeQuestion,
  getCandidateQuestions,
  calculatePerformance,
} from "./questions";

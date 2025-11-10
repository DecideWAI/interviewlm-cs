/**
 * Prisma Type Definitions
 *
 * Temporary type definitions for Prisma models and enums.
 * These will be replaced when Prisma client is properly regenerated.
 */

// Enums (as type unions to match Prisma generated types)
export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type QuestionStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";

export type SessionStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED";

// Models
export interface GeneratedQuestion {
  id: string;
  candidateId: string;
  seed: string | null;
  difficulty: Difficulty;
  status: QuestionStatus;
  title: string;
  description: string;
  starterCode: string | null;
  testCases: any;
  languageAllowed: string[];
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecording {
  id: string;
  candidateId: string;
  startTime: Date;
  endTime: Date | null;
  status: SessionStatus;
  s3Url: string | null;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  timestamp: Date;
  type: string;
  data: any;
  checkpoint: boolean;
}

export interface ClaudeInteraction {
  id: string;
  sessionId: string;
  timestamp: Date;
  role: string;
  content: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latency: number | null;
  stopReason: string | null;
}

export interface CodeSnapshot {
  id: string;
  sessionId: string;
  timestamp: Date;
  fileId: string;
  fileName: string;
  language: string;
  content: string;
  linesAdded: number;
  linesDeleted: number;
  diffFromPrevious: string | null;
}

export interface TestResult {
  id: string;
  sessionId: string;
  questionId: string;
  timestamp: Date;
  passed: number;
  failed: number;
  total: number;
  executionTime: number | null;
  output: string | null;
  error: string | null;
}

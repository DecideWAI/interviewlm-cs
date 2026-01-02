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
  questionSeedId: string | null;
  order: number;
  title: string;
  description: string;
  difficulty: Difficulty;
  language: string;
  requirements: string[];
  estimatedTime: number;
  starterCode: any; // Json
  testCases: any; // Json
  status: QuestionStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  score: number | null;
  createdAt: Date;
}

export interface SessionRecording {
  id: string;
  candidateId: string;
  startTime: Date;
  endTime: Date | null;
  duration: number | null;
  status: SessionStatus;
  eventCount: number;
  storagePath: string | null;
  storageSize: number | null;
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
  contentHash: string;
  fullContent: string | null;
  diffFromPrevious: any; // Json
  linesAdded: number;
  linesDeleted: number;
}

export interface TestResult {
  id: string;
  sessionId: string;
  timestamp: Date;
  testName: string;
  passed: boolean;
  output: string | null;
  error: string | null;
  duration: number | null;
}

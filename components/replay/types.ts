export interface SessionEvent {
  id: string;
  sessionId: string;
  timestamp: Date;
  type: 'code_edit' | 'terminal_output' | 'ai_interaction' | 'test_run' | 'file_change';
  data: Record<string, any>;
}

export interface CodeSnapshot {
  timestamp: Date;
  fileName: string;
  content: string;
  language: string;
}

export interface TerminalEvent {
  timestamp: Date;
  output: string;
  isCommand: boolean;
}

/**
 * Terminal checkpoint for efficient seeking
 * Stores accumulated terminal output at specific points in time
 */
export interface TerminalCheckpoint {
  timestamp: Date;
  timeOffset: number; // Seconds from session start
  accumulatedOutput: string; // All terminal output up to this point
  eventIndex: number; // Index in terminalEvents array
}

export interface AgentQuestion {
  questionId: string;
  questionText: string;
  options: string[];
  multiSelect?: boolean;
  allowCustomAnswer?: boolean;
  context?: string;
}

export interface AgentQuestionAnswer {
  questionId: string;
  selectedOption?: string | null;
  selectedOptions?: string[] | null;
  customAnswer?: string | null;
  responseText: string;
  isMultiSelect?: boolean;
}

export interface ToolCallData {
  toolName: 'ask_question' | 'ask_questions';
  batchId?: string;
  questions?: AgentQuestion[];
  answers?: AgentQuestionAnswer[];
}

export interface AIInteraction {
  id: string;
  timestamp: Date;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tokens?: number;
  promptScore?: number;
  // Tool call specific data
  toolCall?: ToolCallData;
}

export interface KeyMoment {
  id: string;
  timestamp: Date;
  type: 'test_passed' | 'test_failed' | 'error_fixed' | 'ai_interaction' | 'milestone';
  label: string;
  description?: string;
}

export interface SessionData {
  sessionId: string;
  candidateId: string;
  startTime: Date;
  endTime: Date;
  events: SessionEvent[];
  codeSnapshots: CodeSnapshot[];
  terminalEvents: TerminalEvent[];
  terminalCheckpoints: TerminalCheckpoint[]; // Pre-computed checkpoints for efficient seeking
  aiInteractions: AIInteraction[];
  keyMoments: KeyMoment[];
  metadata: {
    totalDuration: number;
    language: string;
    problemTitle: string;
  };
}

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

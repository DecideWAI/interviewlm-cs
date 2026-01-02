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

export interface AIInteraction {
  id: string;
  timestamp: Date;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  promptScore?: number;
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
  aiInteractions: AIInteraction[];
  keyMoments: KeyMoment[];
  metadata: {
    totalDuration: number;
    language: string;
    problemTitle: string;
  };
}

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

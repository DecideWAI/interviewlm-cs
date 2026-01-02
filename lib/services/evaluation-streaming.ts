/**
 * Evaluation Streaming Service
 *
 * Manages real-time evaluation progress and result notifications via Server-Sent Events (SSE).
 * Broadcasts evaluation events to connected clients watching a specific session.
 */

import { EventEmitter } from 'events';

export interface EvaluationProgressEvent {
  sessionId: string;
  candidateId: string;
  type: 'evaluation_progress';
  status: 'analyzing' | 'scoring' | 'finalizing';
  progressPercent: number;
  currentStep: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface EvaluationCompleteEvent {
  sessionId: string;
  candidateId: string;
  evaluationId: string;
  type: 'evaluation_complete';
  overallScore: number;
  codeQualityScore: number;
  problemSolvingScore: number;
  aiCollaborationScore: number;
  communicationScore: number;
  confidence: number;
}

export type EvaluationEvent = EvaluationProgressEvent | EvaluationCompleteEvent;

/**
 * Evaluation Stream Manager
 * Manages SSE connections and broadcasts evaluation events
 */
class EvaluationStreamManager extends EventEmitter {
  private static instance: EvaluationStreamManager;
  private activeClients: Map<string, Set<string>> = new Map(); // sessionId -> Set<clientId>

  private constructor() {
    super();
    this.setMaxListeners(100); // Support many concurrent clients
  }

  static getInstance(): EvaluationStreamManager {
    if (!EvaluationStreamManager.instance) {
      EvaluationStreamManager.instance = new EvaluationStreamManager();
    }
    return EvaluationStreamManager.instance;
  }

  /**
   * Register a new SSE connection for a session
   */
  registerClient(sessionId: string, clientId: string): void {
    if (!this.activeClients.has(sessionId)) {
      this.activeClients.set(sessionId, new Set());
    }
    this.activeClients.get(sessionId)!.add(clientId);
    console.log(`[EvaluationStreaming] Client ${clientId} registered for session ${sessionId}`);
  }

  /**
   * Unregister an SSE connection
   */
  unregisterClient(sessionId: string, clientId: string): void {
    const clients = this.activeClients.get(sessionId);
    if (clients) {
      clients.delete(clientId);
      if (clients.size === 0) {
        this.activeClients.delete(sessionId);
      }
    }
    console.log(`[EvaluationStreaming] Client ${clientId} unregistered from session ${sessionId}`);
  }

  /**
   * Broadcast evaluation event to all connected clients for a session
   */
  broadcastEvent(event: EvaluationEvent): void {
    const clients = this.activeClients.get(event.sessionId);
    console.log(`[EvaluationStreaming] Broadcast: ${event.type} for session ${event.sessionId}`);
    console.log(`[EvaluationStreaming] Active clients: ${clients?.size || 0}`);

    if (!clients || clients.size === 0) {
      console.log(`[EvaluationStreaming] No active clients, skipping broadcast`);
      return;
    }

    console.log(`[EvaluationStreaming] Broadcasting to ${clients.size} clients`);
    this.emit(event.sessionId, event);
  }

  /**
   * Check if session has active clients
   */
  hasActiveClients(sessionId: string): boolean {
    const clients = this.activeClients.get(sessionId);
    return clients !== undefined && clients.size > 0;
  }

  /**
   * Get count of active clients for a session
   */
  getClientCount(sessionId: string): number {
    return this.activeClients.get(sessionId)?.size || 0;
  }
}

export const evaluationStreamManager = EvaluationStreamManager.getInstance();

/**
 * Create SSE response stream for evaluation updates
 */
export function createEvaluationStreamResponse(
  sessionId: string,
  controller: ReadableStreamDefaultController<Uint8Array>
): { clientId: string; cleanup: () => void } {
  const encoder = new TextEncoder();
  const clientId = `eval_client_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Register client
  evaluationStreamManager.registerClient(sessionId, clientId);

  // Event listener for evaluation events
  const eventListener = (event: EvaluationEvent) => {
    try {
      console.log(`[EvaluationStreaming] Client ${clientId} sending: ${event.type}`);
      const data = JSON.stringify(event);
      controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
      console.log(`[EvaluationStreaming] Event sent successfully`);
    } catch (error) {
      console.error('[EvaluationStreaming] Error sending event:', error);
    }
  };

  // Register event listener
  evaluationStreamManager.on(sessionId, eventListener);

  // Send initial connection event
  controller.enqueue(
    encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId, sessionId })}\n\n`)
  );

  // Cleanup function
  const cleanup = () => {
    evaluationStreamManager.off(sessionId, eventListener);
    evaluationStreamManager.unregisterClient(sessionId, clientId);
  };

  return { clientId, cleanup };
}

/**
 * File Streaming Service
 *
 * Manages real-time file change notifications via Server-Sent Events (SSE).
 * Broadcasts file create/update/delete events to connected clients.
 */

import { EventEmitter } from 'events';

export interface FileChangeEvent {
  sessionId: string;
  type: 'create' | 'update' | 'delete';
  path: string;
  fileType: 'file' | 'folder';
  name: string;
  timestamp: string;
}

/**
 * File Stream Manager
 * Manages SSE connections and broadcasts file change events
 */
class FileStreamManager extends EventEmitter {
  private static instance: FileStreamManager;
  private activeClients: Map<string, Set<string>> = new Map(); // sessionId -> Set<clientId>

  private constructor() {
    super();
    this.setMaxListeners(100); // Support many concurrent clients
  }

  static getInstance(): FileStreamManager {
    if (!FileStreamManager.instance) {
      FileStreamManager.instance = new FileStreamManager();
    }
    return FileStreamManager.instance;
  }

  /**
   * Register a new SSE connection for a session
   */
  registerClient(sessionId: string, clientId: string): void {
    if (!this.activeClients.has(sessionId)) {
      this.activeClients.set(sessionId, new Set());
    }
    this.activeClients.get(sessionId)!.add(clientId);
    console.log(`[FileStreaming] Client ${clientId} registered for session ${sessionId}`);
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
    console.log(`[FileStreaming] Client ${clientId} unregistered from session ${sessionId}`);
  }

  /**
   * Broadcast file change event to all connected clients for a session
   */
  broadcastFileChange(event: FileChangeEvent): void {
    const clients = this.activeClients.get(event.sessionId);
    console.log(`[FileStreaming] Broadcast request: ${event.type} for ${event.path}, session=${event.sessionId}, activeClients=${clients?.size || 0}`);

    if (!clients || clients.size === 0) {
      console.log(`[FileStreaming] No active clients for session ${event.sessionId}, skipping broadcast`);
      return;
    }

    console.log(`[FileStreaming] Broadcasting ${event.type} for ${event.path} to ${clients.size} clients`);
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

export const fileStreamManager = FileStreamManager.getInstance();

/**
 * Create SSE response stream for file updates
 */
export function createFileStreamResponse(
  sessionId: string,
  controller: ReadableStreamDefaultController<Uint8Array>
): { clientId: string; cleanup: () => void } {
  const encoder = new TextEncoder();
  const clientId = `file_client_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Register client
  fileStreamManager.registerClient(sessionId, clientId);

  // Event listener for file changes
  const eventListener = (event: FileChangeEvent) => {
    try {
      console.log(`[FileStreaming] Client ${clientId} sending event:`, event.type, event.path);
      const data = JSON.stringify(event);
      controller.enqueue(encoder.encode(`event: file-change\ndata: ${data}\n\n`));
      console.log(`[FileStreaming] Client ${clientId} event sent successfully`);
    } catch (error) {
      console.error('[FileStreaming] Error sending event:', error);
    }
  };

  // Register event listener
  fileStreamManager.on(sessionId, eventListener);

  // Send initial connection event
  controller.enqueue(
    encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`)
  );

  // Cleanup function
  const cleanup = () => {
    fileStreamManager.off(sessionId, eventListener);
    fileStreamManager.unregisterClient(sessionId, clientId);
  };

  return { clientId, cleanup };
}

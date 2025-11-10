/**
 * Terminal state management
 * SSE connections store - Maps sessionId to output queue for that terminal session
 * In production, this should use Redis or a distributed store
 */
const outputQueues = new Map<string, string[]>();

/**
 * Queue output to be sent to terminal client
 * Called by the input handler when executing commands
 */
export function queueTerminalOutput(sessionId: string, output: string) {
  if (!outputQueues.has(sessionId)) {
    outputQueues.set(sessionId, []);
  }
  outputQueues.get(sessionId)!.push(output);
}

/**
 * Get output queue for a session
 */
export function getOutputQueue(sessionId: string): string[] {
  if (!outputQueues.has(sessionId)) {
    outputQueues.set(sessionId, []);
  }
  return outputQueues.get(sessionId)!;
}

/**
 * Clear output queue for a session
 */
export function clearOutputQueue(sessionId: string) {
  outputQueues.delete(sessionId);
}

/**
 * Observability Module
 *
 * Exports observability utilities for the application.
 * Currently supports LangSmith for tracing Claude API calls.
 */

export {
  getTracedAnthropicClient,
  withAgentTrace,
  traceToolExecution,
  traceAgentSession,
  traceClaudeCall,
  getLangSmithStatus,
  initializeLangSmith,
} from './langsmith';

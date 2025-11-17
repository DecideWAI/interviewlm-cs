# Code Streaming Feature

## Overview

The **Code Streaming** feature enables real-time visualization of AI-generated code as it's being written. When the AI coding assistant generates code using the `Write` tool, candidates see the code appear character-by-character in the CodeEditor, similar to how ChatGPT streams responses.

This creates a more engaging and transparent experience, allowing candidates to see the AI's thought process unfold in real-time.

## Architecture

### Components

1. **Code Streaming Service** (`lib/services/code-streaming.ts`)
   - Manages SSE connections and broadcasts code updates
   - Uses EventEmitter to distribute events to multiple connected clients
   - Supports streaming in configurable chunks with delays for typing effect

2. **SSE API Endpoint** (`app/api/interview/[id]/code-stream/route.ts`)
   - Server-Sent Events endpoint for real-time code streaming
   - Authenticates clients and maintains persistent connections
   - Sends keep-alive pings every 30 seconds to prevent timeout

3. **Coding Agent Integration** (`lib/agents/coding-agent.ts`)
   - Enhanced `toolWrite` function streams code generation
   - Configurable via `ENABLE_CODE_STREAMING` environment variable
   - Streams in parallel with actual file writing (non-blocking)

4. **React Hook** (`hooks/useCodeStreaming.ts`)
   - Client-side SSE connection management
   - Automatic reconnection with exponential backoff
   - Event handling for delta, complete, start, and error events

5. **CodeEditor Component** (`components/interview/CodeEditor.tsx`)
   - Consumes code streaming events via `useCodeStreaming` hook
   - Visual indicator when code is being streamed (pulsing "AI Writing Code..." badge)
   - Prevents recording streamed changes as user edits

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Generates Code                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  CodingAgent.toolWrite(filePath, content)                       │
│  - Streams code via streamCodeGeneration()                      │
│  - Writes file to Modal sandbox                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Code Streaming Service                                          │
│  - Breaks code into 5-character chunks                          │
│  - Sends 'delta' events every 20ms                              │
│  - Sends 'complete' event when done                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  SSE Endpoint (/api/interview/[id]/code-stream)                 │
│  - Broadcasts events to all connected clients                   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  useCodeStreaming Hook                                           │
│  - Receives SSE events                                           │
│  - Accumulates code deltas                                       │
│  - Calls onCodeUpdate() callback                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  CodeEditor Component                                            │
│  - Updates editor value with streamed code                       │
│  - Shows "AI Writing Code..." indicator                          │
└─────────────────────────────────────────────────────────────────┘
```

## Event Types

### SSE Events

**1. `connected`**
```json
{
  "clientId": "client_1234567890_abc123"
}
```
Sent when client first connects.

**2. `code` (type: 'start')**
```json
{
  "sessionId": "sess_xyz",
  "fileName": "solution.js",
  "type": "start"
}
```
Signals the beginning of code streaming for a file.

**3. `code` (type: 'delta')**
```json
{
  "sessionId": "sess_xyz",
  "fileName": "solution.js",
  "delta": "const ",
  "type": "delta",
  "position": {
    "line": 0,
    "column": 5
  }
}
```
Incremental code chunk (5 characters by default).

**4. `code` (type: 'complete')**
```json
{
  "sessionId": "sess_xyz",
  "fileName": "solution.js",
  "fullContent": "const solution = () => { ... }",
  "type": "complete"
}
```
Final event with complete code.

**5. `code` (type: 'error')**
```json
{
  "sessionId": "sess_xyz",
  "fileName": "solution.js",
  "error": "Failed to stream code",
  "type": "error"
}
```
Error during streaming.

## Configuration

### Environment Variables

**`ENABLE_CODE_STREAMING`** (default: `"true"`)
- Set to `"false"` to disable code streaming
- When disabled, code is written immediately without streaming effect

### Streaming Parameters

Configurable in `lib/agents/coding-agent.ts`:

```typescript
streamCodeGeneration(sessionId, fileName, content, {
  chunkSize: 5,   // Characters per chunk (smaller = smoother but more events)
  delayMs: 20,    // Delay between chunks in milliseconds (lower = faster)
});
```

**Recommended values:**
- **Fast typing**: `chunkSize: 10, delayMs: 10`
- **Normal typing**: `chunkSize: 5, delayMs: 20` (default)
- **Slow typing**: `chunkSize: 3, delayMs: 30`

## Performance Considerations

### Network Efficiency

1. **SSE vs WebSocket**: SSE is used because it's simpler and sufficient for one-way streaming (server → client)
2. **Keep-alive pings**: Sent every 30 seconds to prevent connection timeout
3. **Automatic reconnection**: Exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)

### Memory

- EventEmitter is used instead of a database for real-time events
- No persistence needed (streaming is ephemeral)
- Cleanup happens automatically when clients disconnect

### Cost

- **Minimal API calls**: Streaming uses a single long-lived SSE connection per client
- **No database writes**: Events are in-memory only
- **Modal costs**: File write happens once (streaming is visual only)

## Testing

### Manual Testing

1. Start the application:
```bash
npm run dev
```

2. Start an interview session and open the AI chat

3. Ask the AI to write code:
```
Write a function to reverse a string in solution.js
```

4. Observe:
   - "AI Writing Code..." indicator appears in editor header
   - Code appears character-by-character with typing effect
   - Indicator disappears when streaming completes

### Disabling Streaming

Set in `.env.local`:
```bash
ENABLE_CODE_STREAMING=false
```

Code will be written immediately without streaming effect.

## Troubleshooting

### Issue: Code Not Streaming

**Symptoms**: Code appears all at once instead of streaming

**Possible causes:**
1. `ENABLE_CODE_STREAMING=false` in environment
2. SSE connection failed to establish
3. Browser doesn't support EventSource

**Solution:**
1. Check environment variable
2. Check browser console for SSE connection errors
3. Verify `/api/interview/[id]/code-stream` endpoint is accessible

### Issue: Streaming Stops Midway

**Symptoms**: Code streams partially then stops

**Possible causes:**
1. Network interruption
2. Server error during streaming
3. Client disconnected

**Solution:**
- Check browser console for errors
- Check server logs for streaming errors
- Hook will attempt automatic reconnection (up to 5 attempts)

### Issue: Multiple Files Stream Simultaneously

**Symptoms**: Code from different files appears mixed

**Solution:**
- This is expected behavior if AI writes multiple files
- Each file streams independently
- `currentFile` prop in CodeEditor filters to only show current file

## Future Enhancements

### Planned Features

1. **Cursor Position Tracking**
   - Show exact line/column where code is being written
   - Scroll editor viewport to follow streaming position

2. **Syntax Highlighting During Stream**
   - Real-time syntax highlighting as code streams
   - Currently highlights after completion

3. **Multiple File Streaming UI**
   - Visual indicator showing which files are being updated
   - File tree highlights streaming files

4. **Streaming Speed Control**
   - User preference for streaming speed (slow/normal/fast/instant)
   - Stored in localStorage

5. **Streaming Analytics**
   - Track streaming performance metrics
   - Measure latency and user engagement

### Advanced Use Cases

1. **Multi-file Refactoring**
   - Stream changes across multiple files simultaneously
   - Show diff view during streaming

2. **Interactive Streaming**
   - Allow user to pause/resume streaming
   - Allow user to reject changes mid-stream

3. **Collaborative Streaming**
   - Multiple users watching same code stream (for pair interviews)
   - Instructor can see student's AI assistance in real-time

## Security Considerations

### Authentication

- SSE endpoint requires valid session authentication
- Only candidates can access their own code streams
- Organization members can access streams for candidates in their org

### Content Validation

- All streamed content goes through security validation
- Path checking ensures files are only written to workspace
- Same security as direct file writes (no bypasses)

### Rate Limiting

- SSE connections are rate-limited per IP (future enhancement)
- Prevents abuse of streaming endpoint

## API Reference

### `streamCodeGeneration(sessionId, fileName, fullCode, options)`

Streams code generation for a file.

**Parameters:**
- `sessionId` (string): Session recording ID
- `fileName` (string): Name of file being written
- `fullCode` (string): Complete code to stream
- `options` (object):
  - `chunkSize` (number): Characters per chunk (default: 5)
  - `delayMs` (number): Delay between chunks (default: 20)

**Returns:** Promise<void>

### `useCodeStreaming(options)`

React hook for consuming code streams.

**Options:**
- `sessionId` (string): Session recording ID
- `enabled` (boolean): Enable streaming (default: true)
- `onCodeUpdate` (function): Callback for delta events
- `onStreamComplete` (function): Callback for complete events
- `onStreamStart` (function): Callback for start events
- `onError` (function): Callback for error events

**Returns:**
- `isConnected` (boolean): SSE connection status
- `isStreaming` (boolean): Currently streaming
- `currentFile` (string | null): File being streamed
- `accumulatedContent` (Map): Accumulated code per file
- `error` (string | null): Error message if any
- `reconnect` (function): Manual reconnection

## Related Documentation

- [Session Recording Architecture](./SESSION_RECORDING_ARCHITECTURE.md)
- [Coding Agent Tools](./CODING_AGENT_TOOLS_RESEARCH.md)
- [Claude Agent SDK](./CLAUDE_AGENT_SDK_ARCHITECTURE.md)

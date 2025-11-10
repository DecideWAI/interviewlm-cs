# Session Replay Event Synchronization

## Overview

This document describes the comprehensive event recording and synchronization strategy for session replay functionality.

## Event Recording Architecture

### Principles

1. **Server-Side Timestamping**: All events use server-generated timestamps to avoid client clock skew
2. **Atomic Recording**: Each event is recorded immediately when it occurs
3. **Checkpoint System**: Strategic checkpoints for efficient replay seeking
4. **Type Safety**: All events validated with Zod schemas

### Event Categories

#### 1. Code Events
- **Type**: `code_edit`
- **Recorded When**: File content is saved (debounced 2s)
- **Data**: fileName, language, content, timestamp
- **API**: `POST /api/interview/[id]/files`

- **Type**: `code_snapshot`
- **Recorded When**: Significant code changes (>50 char changes)
- **Data**: fileName, language, fullContent, diffFromPrevious, linesAdded, linesDeleted
- **Storage**: `CodeSnapshot` model

#### 2. Terminal Events
- **Type**: `terminal_input`
- **Recorded When**: User submits command in terminal
- **Data**: command, workingDirectory, timestamp
- **API**: `POST /api/interview/[id]/terminal/input`

- **Type**: `terminal_output`
- **Recorded When**: Command produces output
- **Data**: output, stdout, stderr, exitCode, timestamp
- **API**: SSE stream from terminal output

#### 3. AI Interaction Events
- **Type**: `ai_message`
- **Recorded When**: User sends message or Claude responds
- **Data**: role (user/assistant), content, model, inputTokens, outputTokens, latency
- **Storage**: `ClaudeInteraction` model
- **API**: `GET /api/interview/[id]/chat` (SSE)

#### 4. Test Execution Events
- **Type**: `test_run_start`
- **Recorded When**: User clicks "Run Tests"
- **Data**: testCount, timestamp
- **API**: `POST /api/interview/[id]/run-tests`

- **Type**: `test_result`
- **Recorded When**: Test execution completes
- **Data**: testName, passed, output, error, duration
- **Storage**: `TestResult` model

#### 5. Navigation Events
- **Type**: `file_switch`
- **Recorded When**: User selects different file in file tree
- **Data**: fromFile, toFile, timestamp
- **API**: Client-side (needs implementation)

#### 6. Session Lifecycle Events
- **Type**: `session_start`
- **Recorded When**: Interview session initializes
- **Data**: questionId, timeLimit, startTime
- **API**: `POST /api/interview/[id]/initialize`

- **Type**: `session_submit`
- **Recorded When**: Candidate submits assessment
- **Data**: finalCode, testResults, duration, timestamp
- **API**: `POST /api/interview/[id]/submit`

## Timeline Construction

### Unified Timeline Algorithm

```typescript
function buildTimeline(sessionData: SessionData): TimelineEvent[] {
  const timeline: TimelineEvent[] = [];

  // Merge all event sources
  sessionData.events.forEach(e => timeline.push({...e, category: 'event'}));
  sessionData.claudeInteractions.forEach(e => timeline.push({...e, category: 'chat'}));
  sessionData.codeSnapshots.forEach(e => timeline.push({...e, category: 'code'}));
  sessionData.testResults.forEach(e => timeline.push({...e, category: 'test'}));

  // Sort chronologically by server timestamp
  timeline.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return timeline;
}
```

### Checkpoint System

Checkpoints are created at strategic points for efficient seeking:

1. **Session Start**: Initial state checkpoint
2. **Test Runs**: Before each test execution
3. **File Switches**: When switching files
4. **Time-Based**: Every 5 minutes

Checkpoints include full state snapshot:
- All file contents
- Terminal history
- AI chat history
- Test results

## Replay State Reconstruction

### State Machine

```typescript
interface ReplayState {
  // Code state
  files: Map<string, string>;         // fileName -> content
  currentFile: string;

  // Terminal state
  terminalHistory: TerminalLine[];
  terminalOutput: string;

  // AI state
  chatMessages: Message[];

  // Test state
  testResults: Map<string, TestResult>;
  lastTestRun: Date | null;
}
```

### Event Application

Each event type updates specific parts of state:

```typescript
function applyEvent(state: ReplayState, event: TimelineEvent): ReplayState {
  const newState = { ...state };

  switch (event.type) {
    case 'code_edit':
    case 'code_snapshot':
      newState.files.set(event.data.fileName, event.data.content);
      break;

    case 'file_switch':
      newState.currentFile = event.data.toFile;
      break;

    case 'terminal_input':
      newState.terminalHistory.push({
        type: 'input',
        content: event.data.command,
        timestamp: event.timestamp
      });
      break;

    case 'terminal_output':
      newState.terminalHistory.push({
        type: 'output',
        content: event.data.output,
        timestamp: event.timestamp
      });
      break;

    case 'ai_message':
      newState.chatMessages.push({
        role: event.data.role,
        content: event.data.content,
        timestamp: event.timestamp
      });
      break;

    case 'test_result':
      newState.testResults.set(event.data.testName, event.data);
      break;
  }

  return newState;
}
```

## Seeking Optimization

### Fast Seeking with Checkpoints

1. Find nearest checkpoint before target time
2. Load checkpoint state
3. Apply events from checkpoint to target
4. Update UI

```typescript
async function seekToTime(targetTime: number) {
  // Find nearest checkpoint
  const checkpoint = findNearestCheckpoint(targetTime);

  // Load checkpoint state
  let state = loadCheckpointState(checkpoint);

  // Apply events from checkpoint to target
  const events = getEventsBetween(checkpoint.time, targetTime);
  for (const event of events) {
    state = applyEvent(state, event);
  }

  // Update UI
  updateReplayUI(state);
}
```

## Synchronization Guarantees

### Timestamp Consistency
- All timestamps are server-generated (UTC)
- Events are ordered by server timestamp, not client timestamp
- Sub-second precision (milliseconds)

### Concurrent Event Handling
- Terminal output during code editing: Both events preserved in timeline
- AI response while typing: Interleaved correctly by timestamp
- Multiple test runs: Each run's events grouped by `test_run_start` marker

### Missing Event Detection
- Event sequence numbers for gap detection
- Periodic heartbeat events (every 30s)
- Warning in replay UI if gaps detected

## Implementation Checklist

- [x] Code edit event recording (files API)
- [ ] Terminal input event recording (terminal API)
- [ ] Terminal output event recording (terminal API)
- [ ] File switch event recording (client-side)
- [ ] Session start event recording (initialize API)
- [ ] Session submit event recording (submit API)
- [ ] Test run start event recording (run-tests API)
- [x] Test result recording (run-tests API)
- [x] AI interaction recording (chat API)
- [x] Unified timeline construction (sessions API)
- [x] Replay state reconstruction (replay viewer)
- [ ] Checkpoint creation system
- [ ] Fast seeking implementation

## Testing Strategy

1. **Unit Tests**: Event recording functions
2. **Integration Tests**: API endpoint event recording
3. **E2E Tests**: Full session recording and replay
4. **Performance Tests**: Seeking speed with checkpoints
5. **Synchronization Tests**: Concurrent event ordering

## Future Enhancements

1. **Real-time Collaboration**: Live viewing of ongoing sessions
2. **Event Streaming**: WebSocket for real-time event delivery
3. **Compression**: Event payload compression for storage
4. **Analytics**: Event-based metrics and insights
5. **Export**: Export session to video format

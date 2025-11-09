# Session Recording and Replay Architecture for InterviewLM

## Executive Summary

This document provides architectural recommendations for implementing comprehensive session recording and replay for the InterviewLM platform. The system must capture all coding interview activities—code changes, keystrokes, Claude API interactions, terminal output, and UI state—while enabling pixel-perfect replay with analytics extraction.

**Key Recommendation**: Hybrid event-based approach combining:
1. Code change tracking via Git-like diffing (code stability)
2. Operational Transform (OT) for keystroke-level granularity
3. Terminal event streaming (asciinema format)
4. Session timeline with indexed events for fast seeking

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    RECORDING LAYER                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Code Editor  │  │ Terminal I/O  │  │ Claude API   │      │
│  │ Events       │  │ Events        │  │ Interactions │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│  ┌──────▼─────────────────▼─────────────────▼───────┐      │
│  │        Event Capture & Normalization Engine       │      │
│  └──────┬─────────────────────────────────────┬─────┘      │
│         │                                     │              │
│  ┌──────▼────────────┐             ┌─────────▼──────┐      │
│  │ Event Serializer  │             │ Compression    │      │
│  │ (JSON → Binary)   │             │ & Encryption   │      │
│  └──────┬────────────┘             └─────────┬──────┘      │
│         │                                    │               │
│         └────────────┬─────────────────────┬─┘               │
│                      │                     │                 │
│            ┌─────────▼─────────────┐      │                 │
│            │  Index Generation     │      │                 │
│            │  (timestamps/seek pts)│      │                 │
│            └─────────┬─────────────┘      │                 │
│                      │                     │                 │
│         ┌────────────▼─────────────┬──────▼────────┐        │
│         │  Storage Layer           │                │        │
│         │  (Indexed Event Stream)  │  Metadata     │        │
│         └────────────┬─────────────┴────────┬──────┘        │
│                      │                      │                │
└──────────────────────┼──────────────────────┼────────────────┘
                       │                      │
┌──────────────────────┼──────────────────────┼────────────────┐
│              PLAYBACK & ANALYSIS LAYER     │                │
├──────────────────────┼──────────────────────┼────────────────┤
│                      │                      │                │
│         ┌────────────▼────────────┐   ┌────▼──────────┐    │
│         │  Session Replay Engine  │   │ Index Reader  │    │
│         │  (Real-time Playback)   │   │ (Fast Seek)   │    │
│         └────────────┬────────────┘   └───────────────┘    │
│                      │                                       │
│  ┌──────────────────▼──────────────────┐                   │
│  │  Multi-View Renderer                │                   │
│  │  • Code viewer (with diffs)         │                   │
│  │  • Terminal console                 │                   │
│  │  • Timeline scrubber                │                   │
│  │  • Claude API chat replay           │                   │
│  └──────────────────┬──────────────────┘                   │
│                     │                                        │
│  ┌──────────────────▼──────────────────┐                   │
│  │  Analytics Extraction               │                   │
│  │  • Code quality metrics             │                   │
│  │  • Velocity analysis                │                   │
│  │  • Debugging pattern detection      │                   │
│  │  • AI assistance usage metrics      │                   │
│  └─────────────────────────────────────┘                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Session Recording Libraries and Technologies

### 2.1 Frontend Session Tracking

**rrweb (Session Replay)**
- **What**: Browser session replay library using DOM snapshot + event stream
- **Pros**:
  - Pixel-perfect UI reconstruction
  - Works with any web framework
  - Handles dynamic content well
  - Good compression (2-3% of uncompressed)
- **Cons**:
  - Large event stream for heavy interactions
  - Doesn't capture application logic/state directly
- **Use case**: UI state playback, IDE visual replay
- **Installation**: `npm install rrweb`
- **License**: MIT

**LogRocket (Commercial Alternative)**
- **Pros**: Production-ready, CDN-hosted, privacy-compliant
- **Cons**: Expensive ($500+/month), vendor lock-in, not customizable
- **Use case**: If UI replay is only requirement, but InterviewLM needs code-specific features

**Custom Keystroke Tracking**
- **Approach**: Intercept Monaco/VS Code Editor API events
- **Pros**:
  - Lightweight
  - Exact keystroke fidelity
  - Can capture keystroke timing (useful for measuring fluency)
- **Cons**:
  - Duplicate with code diffs (need reconciliation)
  - Can be large for sessions with lots of typing
- **Code example**:
```typescript
editor.onDidChangeModelContent((event) => {
  recordEvent({
    type: 'codeChange',
    timestamp: Date.now(),
    delta: {
      range: event.changes[0].range,
      text: event.changes[0].text,
      rangeLength: event.changes[0].rangeLength
    },
    contentHash: hashCode(editor.getValue()) // for validation
  });
});
```

### 2.2 Code Change Tracking Strategies

#### Option A: Git-Like Diffing (Recommended for Most Use Cases)

**Approach**: Snapshot entire file content at intervals + compute diffs
- **Pros**:
  - Simple, reliable, extensively tested
  - Can reconstruct any point in time
  - Works with any editor
  - Standard diff formats (unified, patience diff)
  - Git familiarity for dev teams
- **Cons**:
  - Loses keystroke-level granularity
  - Less useful for typing speed analysis
  - Larger file size for many small edits

**Implementation Libraries**:
- `diff-match-patch` (Google) - Fast JS implementation
- `jsdiff` - Clean API
- `node-diff3` - 3-way merge capability

**Recommended**: jsdiff for balance of speed and functionality

```typescript
import { diffLines } from 'diff';

function captureCodeSnapshot(fileId: string, content: string) {
  const previousSnapshot = loadLatestSnapshot(fileId);

  const diff = diffLines(previousSnapshot.content, content);
  const recordedPatch = {
    timestamp: Date.now(),
    fileId,
    hash: sha256(content),
    diff,
    size: content.length,
  };

  // Store diff, not full content (except on time boundaries)
  storeFileDiff(recordedPatch);
}
```

#### Option B: Operational Transform (OT) - For Keystroke Granularity

**What**: Transformation-based change tracking capturing each keystroke

**Libraries**:
- `ot.js` - Google Wave based
- `yjs` - Excellent CRDT (better than OT for distributed systems)
- `automerge` - JSON-based CRDT
- `quill-delta` - Delta format OT

**Pros**:
- Keystroke-level fidelity
- Can replay typing in real-time
- Better for analyzing typing patterns
- Smaller for many small edits vs big changes

**Cons**:
- More complex implementation
- Harder to reconcile with final code
- Slower seeking through document
- Overkill for "code snapshot at time T" queries

**When to use**: If keystroke analysis is important, or if building collaborative editing

#### Option C: CRDT (Conflict-free Replicated Data Types) - For Collaborative Features

**What**: Data structure that automatically resolves conflicts without central authority

**Libraries**:
- `yjs` (Recommended) - Most mature, performant
- `automerge` - Better suited for offline-first
- `delta-crdts` - Research project, less production-ready

**Pros**:
- Handles concurrent edits without server
- Perfect for collaborative interviews
- Smaller messages than OT
- Better performance at scale
- Offline-capable

**Cons**:
- Overkill if not doing real-time collaboration
- Adds complexity to implementation
- Harder to integrate with existing editors

**Use case**: Future feature - multiple assessors reviewing same session

**Yjs example**:
```typescript
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';

const ydoc = new Y.Doc();
const ytext = ydoc.getText('shared-text');
const binding = new MonacoBinding(ytext, editor.getModel(),
  new Set([editor]), new Set([ydoc.clientID]));

// Listen to changes
ytext.observe(event => {
  recordEvent({
    type: 'crdt-update',
    timestamp: Date.now(),
    delta: event.changes // automatically conflict-free
  });
});
```

#### Recommended Approach: Hybrid Strategy

For InterviewLM, use **Git-like diffing as primary** with **keystroke event overlay**:
- Store file diffs every 5 seconds (balances size/granularity)
- Capture keystroke events separately for analytics
- Keystroke events reference code snapshot hash for validation

```typescript
interface SessionEvent {
  timestamp: number;
  type: 'keystroke' | 'codeSnapshot' | 'terminal' | 'claude-api';

  // Keystroke events
  keystrokeData?: {
    fileId: string;
    position: { line: number; column: number };
    char: string;
    codeHashBefore: string; // validate consistency
  };

  // Code snapshot events (every 5 sec or on semantic boundary)
  codeSnapshot?: {
    fileId: string;
    diff: DiffLine[];
    fullContent: string; // store full content every 30 sec
    hash: string;
  };
}
```

---

## 3. Terminal Recording

### asciinema Format (Recommended)

**What**: Standard format for terminal session recording

**Pros**:
- Industry standard (used by thousands of projects)
- Compact JSON-based format
- Easy to parse and replay
- Supports 256-color terminal
- Timestamps built-in
- Used by major platforms (real.python.org, etc.)

**Format Structure**:
```json
{
  "version": 2,
  "width": 80,
  "height": 24,
  "timestamp": 1504467315,
  "env": { "SHELL": "/bin/bash", "TERM": "xterm-256color" }
}
[2.340848, "o", "$ "]
[6.541826, "o", "npm run test\r\n"]
[0.185117, "o", "Running tests...\r\n"]
```

**Implementation**:
- `node-pty` - PTY abstraction for Node.js
- `xterm.js` - Terminal emulator that can emit events

**Libraries**:
- `asciinema-player` - Official player (self-contained)

**Node.js Implementation**:
```typescript
import pty from 'node-pty';
import * as fs from 'fs';

interface TerminalEvent {
  timestamp: number;
  type: 'output' | 'input';
  data: string;
}

class TerminalRecorder {
  private events: TerminalEvent[] = [];
  private startTime = Date.now();

  startRecording() {
    const shell = pty.spawn('bash', [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24
    });

    shell.onData((data: any) => {
      this.events.push({
        timestamp: Date.now() - this.startTime,
        type: 'output',
        data: data.toString()
      });
    });
  }

  saveAsAsciicast(filename: string) {
    const header = {
      version: 2,
      width: 80,
      height: 24,
      timestamp: Math.floor(this.startTime / 1000),
      env: { SHELL: '/bin/bash', TERM: 'xterm-256color' }
    };

    const stream = fs.createWriteStream(filename);
    stream.write(JSON.stringify(header) + '\n');

    for (const event of this.events) {
      stream.write(JSON.stringify([
        event.timestamp / 1000,
        event.type === 'output' ? 'o' : 'i',
        event.data
      ]) + '\n');
    }
    stream.end();
  }
}
```

### Browser Terminal (xterm.js)

**For browser-based terminal playback**:
- Use `xterm.js` (very popular, excellent API)
- Capture terminal render events
- Store as sequence of commands + outputs

```typescript
import { Terminal } from 'xterm';

const terminal = new Terminal();
const recordedEvents: TerminalEvent[] = [];

// Override write method to capture output
const originalWrite = terminal.write.bind(terminal);
terminal.write = function(data: string) {
  recordedEvents.push({
    timestamp: Date.now(),
    type: 'output',
    data
  });
  return originalWrite(data);
};
```

---

## 4. Claude API Interaction Recording

### Requirements

Must capture:
1. **Prompt sent**: Exact user message to Claude
2. **Response received**: Full Claude response text
3. **Model used**: claude-3-5-sonnet, etc.
4. **Timestamp**: When interaction occurred
5. **Token usage**: Input/output tokens (if available)
6. **Latency**: Time from request to response
7. **Tool usage**: Any code execution or tools Claude used

### Implementation

**Middleware Approach** (Recommended for Next.js):

```typescript
// app/api/claude/route.ts
import Anthropic from '@anthropic-ai/sdk';

interface RecordedClaudeInteraction {
  id: string;
  sessionId: string;
  timestamp: number;
  prompt: string;
  response: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latency: number;
  stopReason: string;
}

export async function POST(request: Request) {
  const { messages, sessionId } = await request.json();

  const startTime = Date.now();
  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2048,
    messages
  });

  const latency = Date.now() - startTime;

  // Record the interaction
  const interaction: RecordedClaudeInteraction = {
    id: crypto.randomUUID(),
    sessionId,
    timestamp: Date.now(),
    prompt: messages[messages.length - 1].content,
    response: response.content[0].type === 'text' ? response.content[0].text : '',
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latency,
    stopReason: response.stop_reason
  };

  // Store interaction
  await storeClaudeInteraction(interaction);

  return Response.json({
    response: interaction,
    usage: response.usage
  });
}
```

**Storage**: Store separately in `claude_interactions` table for easy querying

---

## 5. Data Storage Format

### Recommended: Indexed Event Stream (Hybrid JSON + Binary)

**Format Design**:
```
SESSION_RECORDING/
├── metadata.json          # Session info, timestamps, config
├── events.jsonl          # JSON Lines: one event per line
├── events.bin            # Binary (Protobuf) for compression
├── index.json            # Seek index for fast navigation
├── files/
│   ├── file_1.hash       # Final file content hash
│   ├── file_1.diffs      # All diffs for file_1
│   └── file_2.diffs
├── terminal.cast         # asciinema format
└── claude_interactions.jsonl
```

**metadata.json**:
```json
{
  "sessionId": "sess_12345",
  "assessmentId": "assess_789",
  "candidateId": "cand_456",
  "startTime": 1699564800000,
  "endTime": 1699568400000,
  "duration": 3600000,
  "status": "completed",
  "files": {
    "main.js": { "createdAt": 1699564800000, "finalHash": "abc123" },
    "test.js": { "createdAt": 1699564810000, "finalHash": "def456" }
  },
  "totalClaudeInteractions": 24,
  "totalKeystrokes": 3847,
  "environment": {
    "nodeVersion": "18.0.0",
    "shell": "bash"
  }
}
```

**index.json** (for fast seeking):
```json
{
  "version": 1,
  "eventCount": 15643,
  "checkpoints": [
    {
      "timestamp": 1699564800000,
      "offset": 0,
      "eventIndex": 0,
      "description": "session_start"
    },
    {
      "timestamp": 1699564810000,
      "offset": 5234,
      "eventIndex": 42,
      "description": "first_file_created"
    },
    {
      "timestamp": 1699565000000,
      "offset": 125432,
      "eventIndex": 456,
      "description": "first_claude_call"
    },
    {
      "timestamp": 1699568400000,
      "offset": 2534234,
      "eventIndex": 15643,
      "description": "session_end"
    }
  ]
}
```

### Event Stream Format (events.jsonl)

One JSON object per line for streaming processing:

```jsonl
{"type":"session_start","timestamp":1699564800000,"sessionId":"sess_12345"}
{"type":"file_created","timestamp":1699564805000,"fileId":"f1","filename":"main.js","language":"javascript"}
{"type":"keystroke","timestamp":1699564806001,"fileId":"f1","char":"c","position":{"line":0,"column":0}}
{"type":"keystroke","timestamp":1699564806045,"fileId":"f1","char":"o","position":{"line":0,"column":1}}
{"type":"keystroke","timestamp":1699564806089,"fileId":"f1","char":"n","position":{"line":0,"column":2}}
{"type":"keystroke","timestamp":1699564806133,"fileId":"f1","char":"s","position":{"line":0,"column":3}}
{"type":"keystroke","timestamp":1699564806177,"fileId":"f1","char":"t","position":{"line":0,"column":4}}
{"type":"code_snapshot","timestamp":1699564810000,"fileId":"f1","contentHash":"abc123","diff":[{"type":"add","value":"const message = 'hello';\n"}]}
{"type":"terminal_output","timestamp":1699564815000,"data":"$ npm test\r\n"}
{"type":"terminal_output","timestamp":1699564816000,"data":"Running tests...\r\n"}
{"type":"claude_api_call","timestamp":1699564820000,"prompt":"How do I fix this test?","model":"claude-3-5-sonnet","inputTokens":145}
{"type":"claude_api_response","timestamp":1699564825000,"response":"The test is failing because...","outputTokens":287}
{"type":"session_end","timestamp":1699568400000,"reason":"manual_stop"}
```

### Compression Strategy

**For Cost-Effective Storage**:

1. **Primary storage** (searchable): Store events as JSONL (gzip compressed)
2. **Archive storage** (readonly): Convert to Protobuf + BROTLI for 70% compression
3. **Live playback**: Stream from JSONL with on-the-fly decompression

**Compression Results** (typical 1-hour session):
- Uncompressed JSONL: ~15-25 MB
- GZIP compressed: ~2-3 MB
- Protobuf + BROTLI: ~1-1.5 MB

```typescript
import { createGzip } from 'zlib';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

async function storeSessionCompressed(sessionId: string, events: SessionEvent[]) {
  const gzip = createGzip({ level: 9 }); // maximum compression
  const output = createWriteStream(`sessions/${sessionId}/events.jsonl.gz`);

  const input = Readable.from(
    events.map(e => JSON.stringify(e) + '\n')
  );

  await pipeline(input, gzip, output);
}
```

---

## 6. Real-Time Playback Features

### Playback Engine Architecture

```typescript
interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number; // 0.5x, 1x, 2x, 4x
  currentEventIndex: number;
  renderedContent: Map<string, string>;
}

class SessionPlayer {
  private sessionData: SessionRecording;
  private state: PlaybackState;
  private eventEmitter: EventEmitter;

  constructor(sessionId: string) {
    this.sessionData = loadSession(sessionId);
    this.state = {
      currentTime: 0,
      isPlaying: false,
      playbackSpeed: 1.0,
      currentEventIndex: 0,
      renderedContent: new Map()
    };
  }

  /**
   * Seek to specific timestamp (uses index for O(log n) lookup)
   */
  seekTo(timestamp: number) {
    const checkpoint = this.sessionData.index.findCheckpointNear(timestamp);
    const eventIndex = this.findEventIndexAfterTimestamp(
      timestamp,
      checkpoint.eventIndex
    );

    this.state.currentTime = timestamp;
    this.state.currentEventIndex = eventIndex;
    this.renderStateAtTimestamp(timestamp);
  }

  /**
   * Play with speed control
   */
  play(speed: number = 1.0) {
    this.state.isPlaying = true;
    this.state.playbackSpeed = Math.max(0.25, Math.min(4.0, speed));

    this.playbackLoop();
  }

  private playbackLoop() {
    if (!this.state.isPlaying) return;

    const frameTime = 16.67; // ~60fps
    const actualAdvance = frameTime * this.state.playbackSpeed;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      this.state.currentTime += actualAdvance;

      // Process all events up to current time
      this.processEventsUntil(this.state.currentTime);

      // Emit state update for renderer
      this.eventEmitter.emit('update', this.getRenderedState());

      if (this.state.currentTime >= this.sessionData.endTime) {
        this.state.isPlaying = false;
        clearInterval(interval);
        this.eventEmitter.emit('end');
      }
    }, frameTime);
  }

  private processEventsUntil(timestamp: number) {
    while (this.state.currentEventIndex < this.sessionData.events.length) {
      const event = this.sessionData.events[this.state.currentEventIndex];

      if (event.timestamp > timestamp) break;

      this.applyEvent(event);
      this.state.currentEventIndex++;
    }
  }

  private applyEvent(event: SessionEvent) {
    switch (event.type) {
      case 'keystroke':
        // Insert character at position
        const file = this.state.renderedContent.get(event.keystrokeData.fileId);
        // ... apply keystroke
        break;

      case 'code_snapshot':
        // Apply diff to file
        const current = this.state.renderedContent.get(event.codeSnapshot.fileId);
        const updated = applyDiff(current, event.codeSnapshot.diff);
        this.state.renderedContent.set(event.codeSnapshot.fileId, updated);
        break;

      case 'terminal_output':
        this.eventEmitter.emit('terminal', event.data);
        break;

      case 'claude_api_call':
        this.eventEmitter.emit('claude-call', event);
        break;
    }
  }

  getRenderedState() {
    return {
      timestamp: this.state.currentTime,
      files: Object.fromEntries(this.state.renderedContent),
      playbackSpeed: this.state.playbackSpeed,
      progress: this.state.currentTime / this.sessionData.duration
    };
  }
}
```

### Multi-View Renderer (React Component)

```typescript
import React, { useState, useEffect } from 'react';

export function SessionReplayViewer({ sessionId }: { sessionId: string }) {
  const [player] = useState(() => new SessionPlayer(sessionId));
  const [playbackState, setPlaybackState] = useState({
    currentTime: 0,
    isPlaying: false,
    playbackSpeed: 1.0,
    progress: 0
  });
  const [files, setFiles] = useState<Record<string, string>>({});

  useEffect(() => {
    player.eventEmitter.on('update', (state) => {
      setPlaybackState({
        currentTime: state.timestamp,
        isPlaying: true,
        playbackSpeed: state.playbackSpeed,
        progress: state.progress
      });
      setFiles(state.files);
    });

    return () => player.eventEmitter.removeAllListeners();
  }, [player]);

  return (
    <div className="grid grid-cols-3 gap-4 h-screen">
      {/* Code Editor View */}
      <div className="col-span-2">
        <CodeEditor value={files['main.js'] || ''} readOnly />
      </div>

      {/* Terminal/Output View */}
      <div className="border-l">
        <TerminalEmulator sessionId={sessionId} playbackState={playbackState} />
      </div>

      {/* Playback Controls */}
      <div className="col-span-3 border-t p-4">
        <PlaybackControls
          currentTime={playbackState.currentTime}
          duration={/* ... */}
          isPlaying={playbackState.isPlaying}
          speed={playbackState.playbackSpeed}
          onSeek={(t) => player.seekTo(t)}
          onPlayPause={() => player.play()}
          onSpeedChange={(s) => player.play(s)}
        />
      </div>
    </div>
  );
}
```

### Speed Controls

Support 0.5x, 1x, 1.5x, 2x, 4x playback:

```typescript
const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 4.0];

function PlaybackSpeedSelector({ current, onChange }) {
  return (
    <select value={current} onChange={(e) => onChange(parseFloat(e.target.value))}>
      {PLAYBACK_SPEEDS.map(speed => (
        <option key={speed} value={speed}>
          {speed}x
        </option>
      ))}
    </select>
  );
}
```

---

## 7. Code Diff Visualization

### Syntax-Aware Diff Display

Use `react-diff-viewer` or `diff-match-patch` with syntax highlighting:

```typescript
import DiffViewer from 'react-diff-viewer-continued';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

export function CodeDiffView({ before, after, language }) {
  return (
    <DiffViewer
      oldValue={before}
      newValue={after}
      splitView={true}
      highlightComponent={HighlightComponent}
      compareMethod={LineAndCharacter}
    />
  );
}

const HighlightComponent = ({ str, type, ...rest }) => (
  <SyntaxHighlighter
    language={language}
    {...rest}
  >
    {str}
  </SyntaxHighlighter>
);
```

### Diff Timeline

Show code snapshots at key points:

```typescript
interface CodeTimeline {
  snapshots: Array<{
    timestamp: number;
    fileId: string;
    hash: string;
    description: string; // "Initial code", "After Claude fix", etc.
    diff?: DiffLine[];
  }>;
}

function CodeTimeline({ snapshots, onSelectSnapshot }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-4">
      {snapshots.map((snap, i) => (
        <button
          key={i}
          onClick={() => onSelectSnapshot(snap)}
          className="px-3 py-2 rounded border whitespace-nowrap"
        >
          <div className="text-xs text-gray-500">
            {new Date(snap.timestamp).toLocaleTimeString()}
          </div>
          <div className="text-sm font-medium">{snap.description}</div>
        </button>
      ))}
    </div>
  );
}
```

---

## 8. Analytics Extraction

### Metrics to Compute

**Code Quality Metrics**:
```typescript
interface CodeQualityMetrics {
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
  avgLineLength: number;
  comments: number;
  codeComplexity: number; // cyclomatic complexity
  testCoverage: number;
  passingTests: number;
  failingTests: number;
}
```

**Velocity Metrics**:
```typescript
interface VelocityMetrics {
  keystrokesPerMinute: number;
  codeChangesPerMinute: number;
  averageEditDistance: number; // chars changed per edit
  timeToFirstCode: number; // ms until first keystroke
  burstyness: number; // clustering of edits (0-1)
}

// Compute velocity
function computeVelocityMetrics(events: SessionEvent[], duration: number): VelocityMetrics {
  const keystrokes = events.filter(e => e.type === 'keystroke');
  const codeSnapshots = events.filter(e => e.type === 'code_snapshot');

  return {
    keystrokesPerMinute: (keystrokes.length / duration) * 60000,
    codeChangesPerMinute: (codeSnapshots.length / duration) * 60000,
    averageEditDistance: computeAverageEditDistance(codeSnapshots),
    timeToFirstCode: events.find(e => e.type === 'keystroke')?.timestamp || 0,
    burstyness: computeActivityClustering(events)
  };
}
```

**AI Assistance Analysis**:
```typescript
interface AIAssistanceMetrics {
  totalClaudeInteractions: number;
  averagePromptLength: number;
  averageResponseLength: number;
  responseTimeSeconds: number;
  codeAcceptanceRate: number; // % of suggestions used
  typicalInteractionPattern: string; // "trial-and-error" | "goal-oriented" | "experimental"
  aiHelpTiming: Array<{
    timestamp: number;
    stage: string; // "initial", "debugging", "optimization"
    promptCategory: string; // "explanation", "debugging", "implementation"
  }>;
}

function analyzeAIAssistance(events: SessionEvent[], codeEvents: SessionEvent[]): AIAssistanceMetrics {
  const apiCalls = events.filter(e => e.type === 'claude_api_call');
  const apiResponses = events.filter(e => e.type === 'claude_api_response');

  // Detect if code changes follow Claude suggestions
  const acceptanceRate = computeAcceptanceRate(apiResponses, codeEvents);

  return {
    totalClaudeInteractions: apiCalls.length,
    averagePromptLength: apiCalls.reduce((sum, e) => sum + e.prompt.length, 0) / apiCalls.length,
    averageResponseLength: apiResponses.reduce((sum, e) => sum + e.response.length, 0) / apiResponses.length,
    responseTimeSeconds: computeAverageResponseTime(apiCalls, apiResponses),
    codeAcceptanceRate: acceptanceRate,
    typicalInteractionPattern: classifyInteractionPattern(events),
    aiHelpTiming: extractAIHelpTimings(events)
  };
}
```

**Problem-Solving Patterns**:
```typescript
interface ProblemSolvingPattern {
  pattern: 'linear' | 'trial-and-error' | 'debug-driven' | 'ai-guided';
  averageCycleTime: number; // ms per "attempt"
  successRate: number; // % of attempts that improved code
  debuggingTime: number; // time spent in debugging vs coding
  refactoringPasses: number;
}
```

---

## 9. Privacy and Compliance

### Data Handling Best Practices

**PII Removal**:
```typescript
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /\b(?:\+?1[-.]?)?\(?([0-9]{3})\)?[-.]?([0-9]{3})[-.]?([0-9]{4})\b/g,
  apiKey: /(?:api[_-]?)?key[_-]?[a-zA-Z0-9]{20,}/gi,
  password: /password\s*[:=]\s*[^\s]+/gi,
  ssn: /\b(?:\d{3}[-]?)?\d{3}[-]?\d{4}\b/g,
};

function removePII(text: string, policy: 'anonymize' | 'redact' = 'redact'): string {
  let cleaned = text;

  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    if (policy === 'redact') {
      cleaned = cleaned.replace(pattern, `[${type.toUpperCase()}]`);
    } else {
      // anonymize: replace with consistent hash
      cleaned = cleaned.replace(pattern, (match) => {
        const hash = hashString(match).substring(0, 8);
        return `[${type.toUpperCase()}_${hash}]`;
      });
    }
  }

  return cleaned;
}
```

**GDPR/CCPA Compliance**:

1. **Right to Access**: Provide candidates with their session recording
2. **Right to Deletion**: Hard-delete session data after 90 days (configurable)
3. **Right to Portability**: Export in standard formats (JSON, video)
4. **Data Minimization**: Don't record sensitive data if not needed
5. **Consent**: Explicit opt-in before recording starts

```typescript
interface SessionConsentAgreement {
  candidateId: string;
  sessionId: string;
  timestamp: number;
  consentedTo: {
    codeCapture: boolean;
    keystrokeCapture: boolean;
    aiInteractionCapture: boolean;
    analytics: boolean;
    recordingRetention: number; // days
  };
  jurisdictions: string[]; // ['US', 'EU'] for GDPR/CCPA
}

async function createSession(assessment: Assessment): Promise<SessionRecording> {
  // Get explicit consent from candidate
  const consent = await getConsent(assessment.candidateId);

  if (!consent.consentedTo.codeCapture) {
    // Don't record code changes
  }

  if (consent.jurisdictions.includes('EU')) {
    // Apply GDPR-specific handling
    enablePIIRemoval();
    setDataRetention(30); // 30 days max
  }
}
```

**Data Retention Policies**:
```typescript
const RETENTION_POLICIES = {
  DEVELOPMENT: 7, // days
  STAGING: 30,
  PRODUCTION: 90,
  COMPLIANCE_HOLD: 365
};

async function enforcePurging() {
  const threshold = Date.now() - RETENTION_POLICIES.PRODUCTION * 24 * 3600 * 1000;

  const oldSessions = db.sessions.find({
    createdAt: { $lt: new Date(threshold) },
    status: 'completed'
  });

  for (const session of oldSessions) {
    // Hard delete from all storage backends
    await deleteSessionCompletely(session.id);
  }
}
```

---

## 10. Implementation Roadmap

### Phase 1: MVP (Weeks 1-3)
- Basic event capture (code diffs, terminal output)
- JSON event stream storage
- Simple playback (play/pause/seek)
- Export to JSON/ZIP

**Tech Stack**:
- jsdiff for code diffs
- xterm.js for terminal
- Next.js API routes for Claude recording
- SQLite for metadata (can migrate later)

### Phase 2: Enhanced Playback (Weeks 4-6)
- Multi-view renderer (code + terminal side-by-side)
- Speed controls
- Claude interaction timeline
- Syntax highlighting for diffs

**Tech Stack**:
- React components for UI
- React-diff-viewer for diff visualization
- JSONL compressed storage

### Phase 3: Analytics (Weeks 7-9)
- Velocity metrics
- AI assistance analysis
- Problem-solving pattern detection
- Exportable analytics reports

### Phase 4: Compliance & Scale (Weeks 10-12)
- PII removal
- GDPR/CCPA compliance
- Binary format compression
- Indexed seeking for large sessions
- S3/cloud storage integration

---

## 11. Library Recommendations Summary

### Tier 1: Essential
| Category | Library | Version | Why |
|----------|---------|---------|-----|
| Code Diffing | jsdiff | ^5.0 | Fast, accurate, minimal dependencies |
| Terminal Recording | xterm.js | ^5.2 | Industry standard, great API |
| Session Replay | Custom + rrweb | ^2.0 | Custom for code, rrweb for UI fallback |
| Terminal Format | asciinema standard | - | Industry standard format |

### Tier 2: Recommended
| Category | Library | Version | Why |
|----------|---------|---------|-----|
| Diff Visualization | react-diff-viewer | ^4.0 | Syntax highlighting + side-by-side |
| Compression | node-brotli | ^1.3 | 30% better than gzip |
| Analytics | simple-statistics | ^9.0 | Lightweight stats computation |
| Time Series | date-fns | ^2.30 | Formatting, comparisons |

### Tier 3: Optional (Future)
| Category | Library | Version | Why |
|----------|---------|---------|-----|
| Collaborative Editing | yjs | ^13.0 | If adding multi-user playback |
| CRDT Sync | automerge | ^2.0 | Alternative to yjs |
| Video Export | ffmpeg.wasm | ^0.11 | Convert to MP4 for sharing |
| PII Detection | compromise | ^14.0 | NLP-based PII detection |

---

## 12. Database Schema (PostgreSQL Recommended)

```sql
-- Session metadata
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  assessment_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_seconds INT,
  status ENUM ('active', 'completed', 'paused', 'abandoned'),
  event_count INT,
  storage_path TEXT,
  storage_size_bytes INT,
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (assessment_id) REFERENCES assessments(id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);

-- Indexed event stream metadata
CREATE TABLE session_events_index (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  event_index INT NOT NULL,
  timestamp BIGINT NOT NULL, -- ms since epoch
  event_type VARCHAR(50),
  file_id VARCHAR(255),
  checkpoint BOOLEAN DEFAULT FALSE,

  FOREIGN KEY (session_id) REFERENCES sessions(id),
  INDEX (session_id, timestamp),
  INDEX (session_id, event_type)
);

-- Code file snapshots
CREATE TABLE code_snapshots (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  file_id VARCHAR(255),
  timestamp BIGINT NOT NULL,
  content_hash VARCHAR(64),
  diff_from_previous JSONB,
  full_content TEXT, -- store full content every 30 sec
  language VARCHAR(50),

  FOREIGN KEY (session_id) REFERENCES sessions(id),
  INDEX (session_id, file_id, timestamp)
);

-- Claude API interactions
CREATE TABLE claude_interactions (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  timestamp BIGINT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  model VARCHAR(100),
  input_tokens INT,
  output_tokens INT,
  latency_ms INT,
  stop_reason VARCHAR(50),

  FOREIGN KEY (session_id) REFERENCES sessions(id),
  INDEX (session_id, timestamp)
);

-- Computed analytics
CREATE TABLE session_analytics (
  session_id UUID PRIMARY KEY,
  keystrokes_per_minute FLOAT,
  code_changes_per_minute FLOAT,
  total_ai_interactions INT,
  ai_suggestion_acceptance_rate FLOAT,
  problem_solving_pattern VARCHAR(50),
  code_quality_score FLOAT,
  debugging_time_minutes INT,
  computed_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

---

## 13. Cost Estimation (12-month)

### Storage Costs (AWS S3)
- Average session: 2.5 MB (compressed)
- 100 assessments/month × 10 candidates = 1,000 sessions/month
- Monthly storage: 1,000 × 2.5 MB = 2.5 GB
- Annual: 30 GB × $0.023/GB = **$690/year**

### Compute Costs
- Event processing: ~50ms per session
- 1,000 sessions × 50ms = 50 seconds compute/month
- **Negligible (< $5/year)**

### Bandwidth Costs
- Average playback session: 2.5 MB download
- 100 playbacks/month × 2.5 MB = 250 GB/year
- 250 GB × $0.09/GB = **$22.50/year**

### Total Annual: ~$715 (for processing 12,000 sessions)

---

## 14. Conclusion & Recommended Stack

**For InterviewLM, recommend**:

1. **Code Change Tracking**: Git-like diffing with jsdiff
2. **Keystroke Capture**: Optional overlay for timing analysis
3. **Terminal Recording**: asciinema format with xterm.js
4. **Claude Interactions**: Middleware-based API recording
5. **Storage**: JSONL + gzip compression, indexed checkpoints
6. **Playback**: Custom React component with multi-view renderer
7. **Analytics**: Custom computation from event stream
8. **Privacy**: Built-in PII removal and GDPR compliance

**Time to MVP**: 3-4 weeks with focused development

**Complexity**: Medium (not trivial, but well-established patterns)

**Maintainability**: High (event-based architecture is clean and extensible)

This approach balances fidelity, cost, performance, and compliance while remaining implementable within a reasonable timeline.

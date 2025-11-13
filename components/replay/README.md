# Session Replay Viewer Components

Complete session replay system for viewing candidate interview sessions with synchronized playback of code changes, terminal output, and AI interactions.

## Components

### SessionReplayViewer

Main component that orchestrates the entire replay experience.

**Usage:**

```tsx
import { SessionReplayViewer } from '@/components/replay';

<SessionReplayViewer
  sessionId="session-123"
  candidateId="candidate-456"
  autoPlay={false}
  initialSpeed={1}
/>
```

**Props:**

- `sessionId` (required): ID of the session to replay
- `candidateId` (optional): ID of the candidate
- `autoPlay` (optional): Auto-start playback on load (default: false)
- `initialSpeed` (optional): Initial playback speed (0.5 | 1 | 2 | 4, default: 1)

**Features:**

- Fetches session data from `/api/interview/[id]/events?checkpoints=true`
- Synchronized playback across all components
- Mock data generators for development (when API is not ready)
- Loading and error states
- Responsive layout with resizable panels

### TimelineScrubber

Interactive timeline with key moment markers and scrubbing.

**Features:**

- Draggable playhead for seeking
- Key moment markers with icons and colors
- Hover tooltips showing moment details
- Time display on hover
- Legend for moment types

**Moment Types:**

- `test_passed` - Green checkmark
- `test_failed` - Red X
- `error_fixed` - Green checkmark
- `ai_interaction` - Purple chat bubble
- `milestone` - Orange trophy

### CodeDiffViewer

Side-by-side diff viewer with syntax highlighting.

**Features:**

- Unified diff view split into old/new columns
- Line-by-line additions (green) and deletions (red)
- File tabs for multiple files
- Snapshot navigation
- Line numbers for both versions
- Statistics (additions/deletions count)

**Uses:**

- `diff` library for calculating diffs
- Custom diff rendering with proper alignment

### PlaybackControls

Media player-style controls for replay.

**Features:**

- Play/Pause button
- Skip to previous/next key moment
- Speed selector (0.5x, 1x, 2x, 4x)
- Skip idle time toggle
- Current time / total duration display
- Replay mode indicator badge

## Layout

```
┌─────────────────────────────────────────────────────┐
│  Timeline Scrubber (with key moments)               │
├──────────────────┬──────────────────────────────────┤
│  Code Diff View  │  Terminal Replay                 │
│  (side-by-side)  │  (xterm.js)                      │
│                  │                                  │
│                  ├──────────────────────────────────┤
│                  │  Claude Chat History             │
│                  │  (scrollable timeline)           │
└──────────────────┴──────────────────────────────────┘
│  Controls: Play/Pause | Speed (0.5x-4x) | Jump to   │
└─────────────────────────────────────────────────────┘
```

## Data Types

See `types.ts` for full type definitions:

- `SessionData` - Complete session with events, snapshots, and metadata
- `CodeSnapshot` - Point-in-time code state
- `TerminalEvent` - Terminal output event
- `AIInteraction` - Chat message with metadata
- `KeyMoment` - Important moment in the session
- `PlaybackSpeed` - 0.5 | 1 | 2 | 4

## API Integration

The component expects an API endpoint at:

```
GET /api/interview/[id]/events?checkpoints=true
```

**Response format:**

```json
{
  "sessionId": "session-123",
  "candidateId": "candidate-456",
  "startTime": "2025-01-01T10:00:00Z",
  "endTime": "2025-01-01T10:30:00Z",
  "events": [...],
  "codeSnapshots": [
    {
      "timestamp": "2025-01-01T10:05:00Z",
      "fileName": "solution.js",
      "content": "function binarySearch() {...}",
      "language": "javascript"
    }
  ],
  "terminalEvents": [
    {
      "timestamp": "2025-01-01T10:01:00Z",
      "output": "npm test",
      "isCommand": true
    }
  ],
  "aiInteractions": [
    {
      "id": "1",
      "timestamp": "2025-01-01T10:02:00Z",
      "role": "user",
      "content": "How do I implement binary search?",
      "tokens": 120,
      "promptScore": 0.85
    }
  ],
  "keyMoments": [
    {
      "id": "1",
      "timestamp": "2025-01-01T10:10:00Z",
      "type": "test_passed",
      "label": "All tests passed",
      "description": "Successfully implemented binary search"
    }
  ],
  "metadata": {
    "totalDuration": 1800,
    "language": "javascript",
    "problemTitle": "Binary Search Implementation"
  }
}
```

## Mock Data

For development without a backend, the component includes mock data generators:

- `generateMockCodeSnapshots()` - Sample code evolution
- `generateMockTerminalEvents()` - Sample terminal output
- `generateMockAIInteractions()` - Sample chat history
- `generateMockKeyMoments()` - Sample key moments

These are automatically used when the API returns empty or invalid data.

## Example Page

A demo page is available at `/app/replay/[sessionId]/page.tsx`:

```tsx
"use client";

import { SessionReplayViewer } from "@/components/replay";
import { useParams } from "next/navigation";

export default function SessionReplayPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  return (
    <SessionReplayViewer
      sessionId={sessionId}
      autoPlay={false}
      initialSpeed={1}
    />
  );
}
```

Access at: `/replay/session-123`

## Design System

All components follow the pitch-black design system with:

- Background layers: `bg-background`, `bg-background-secondary`, `bg-background-tertiary`
- Text hierarchy: `text-text-primary`, `text-text-secondary`, `text-text-tertiary`
- Primary accent: Purple (`text-primary`, `bg-primary`)
- Status colors: Success (green), Error (red), Warning (amber), Info (blue)

## Dependencies

Required packages (already installed):

- `@uiw/react-codemirror` - Code editor
- `@xterm/xterm` - Terminal emulator
- `@xterm/addon-fit` - Terminal resize
- `diff` - Diff calculation
- `@types/diff` - TypeScript types for diff
- `react-resizable-panels` - Resizable layout
- `lucide-react` - Icons

## Technical Notes

1. **xterm.js SSR**: Terminal component must be dynamically imported with `{ ssr: false }` due to xterm.js requiring client-side only rendering.

2. **Performance**: For long sessions with many events, consider:
   - Virtualization for terminal output
   - Lazy loading of code snapshots
   - Debounced timeline seeking

3. **Terminal Replay**: Currently replays from start when seeking. For production, implement proper seek-to-time functionality by:
   - Caching terminal state at checkpoints
   - Replaying only events between checkpoints and target time

4. **S3 Integration**: For production, load compressed events from S3 when available (see `pako` library in package.json).

## Future Enhancements

- [ ] Syntax highlighting in code diff
- [ ] Search within session events
- [ ] Bookmarks/annotations
- [ ] Export session as video
- [ ] Side-by-side comparison of multiple sessions
- [ ] Heatmap visualization of code changes
- [ ] Keyboard shortcuts (Space = play/pause, Arrow keys = seek)
- [ ] Full-screen mode
- [ ] Picture-in-picture for terminal
- [ ] Session analytics dashboard

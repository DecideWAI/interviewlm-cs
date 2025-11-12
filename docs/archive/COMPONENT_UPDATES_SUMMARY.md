# Interview Components Backend Integration Summary

This document summarizes the changes made to integrate the interview components with the real backend APIs.

## 1. AIChat.tsx (`/home/user/interviewlm-cs/components/interview/AIChat.tsx`)

### Changes Made:
- **Props Updated**: Changed from `messages`, `onSendMessage`, `isLoading` to just `sessionId`
- **Server-Sent Events Integration**: Implemented SSE connection to `/api/interview/[id]/chat`
- **Message State Management**: Component now manages its own message state internally
- **Chat History Loading**: Loads previous messages from `/api/interview/[id]/chat/history` on mount
- **Real-time Streaming**: Shows streaming AI responses with animated cursor
- **Token Usage Display**: Shows total tokens used for each AI response (hover to see)
- **Connection Status**: Displays WiFi icon showing connection state (green = connected, red = disconnected)
- **Error Handling**: Shows error messages in red banner when connection fails
- **Event Recording**: Records both user and assistant messages to `/api/interview/[id]/events`

### New Features:
- Connection status indicator (Wifi/WifiOff icons)
- Error banner for connection failures
- Streaming message display with animated cursor
- Token usage counter (shown on hover for each AI response)
- Auto-reconnect on connection failure
- Proper cleanup on unmount

### API Endpoints Used:
- `GET /api/interview/[id]/chat/history` - Load chat history
- `GET /api/interview/[id]/chat?message=...` - SSE endpoint for streaming responses
- `POST /api/interview/[id]/events` - Record chat messages

### SSE Event Types Expected:
- `content` - Streaming text delta
- `usage` - Token usage information
- `done` - Stream completion signal

---

## 2. Terminal.tsx (`/home/user/interviewlm-cs/components/interview/Terminal.tsx`)

### Changes Made:
- **Props Updated**: Added required `sessionId` prop
- **WebSocket Integration**: Connects to `/api/interview/[id]/terminal` via WebSocket
- **Bidirectional Communication**: Sends terminal input to backend, receives output
- **Auto-reconnect**: Automatically reconnects every 3 seconds if connection drops
- **Connection Status**: Exposes connection status through ref handle
- **Event Recording**: Records all terminal commands to `/api/interview/[id]/events`

### New Features:
- WebSocket connection with auto-reconnect
- Connection status exposed via ref (`connected`, `disconnected`, `connecting`)
- Visual feedback for connection state in terminal
- Interrupt signal support (Ctrl+C)
- Fallback to local echo when disconnected

### WebSocket Message Format:
```json
// Send to server
{
  "type": "input",
  "data": "command\n"
}

{
  "type": "interrupt"
}

// Receive from server
"text output to display"
```

### API Endpoints Used:
- `WS /api/interview/[id]/terminal` - WebSocket connection
- `POST /api/interview/[id]/events` - Record terminal commands

---

## 3. CodeEditor.tsx (`/home/user/interviewlm-cs/components/interview/CodeEditor.tsx`)

### Changes Made:
- **Props Updated**: Added `sessionId`, `questionId`, and `showTestButton` props
- **Debounced Event Recording**: Records code changes after 3 seconds of inactivity
- **Periodic Snapshots**: Creates code snapshots every 30 seconds
- **Run Tests Button**: Added "Run Tests" button in header (can be disabled)
- **Test Results Display**: Shows test results inline with color-coded success/failure
- **Test Output**: Expandable details section for test output

### New Features:
- "Run Tests" button with loading state
- Visual test results banner (green for pass, red for fail)
- Test statistics (X/Y passed)
- Expandable test output section
- File name display in header
- Debounced change recording (3 seconds)
- Automatic snapshots (30 seconds)

### Test Result Display:
- Shows pass/fail status with icons (CheckCircle2/XCircle)
- Color-coded background (green/red)
- Test count (e.g., "5/5 passed")
- Error messages displayed in monospace font
- Collapsible test output section

### API Endpoints Used:
- `POST /api/interview/[id]/events` - Record code changes, snapshots, and test runs
- `POST /api/interview/[id]/run-tests` - Execute tests

### Event Types Recorded:
- `code_change` - Debounced code edits
- `code_snapshot` - Periodic snapshots
- `test_run` - Test execution with results

---

## 4. FileTree.tsx (`/home/user/interviewlm-cs/components/interview/FileTree.tsx`)

### Changes Made:
- **Props Updated**: Added `sessionId`, `onFileCreate`, and `onFileDelete` props
- **File Operation Recording**: Records file open, create, and delete events
- **Create File UI**: Added "+" button in header to create new files
- **Event Tracking**: Tracks all file interactions

### New Features:
- File creation button in header
- File operation event recording
- Support for dynamic file creation during interview

### File Operations Tracked:
- `file_open` - When a file is selected/opened
- `file_create` - When a new file is created
- `file_delete` - When a file is deleted

### API Endpoints Used:
- `POST /api/interview/[id]/events` - Record file operations

---

## Design Preservation

All components maintain the existing pitch-black design system:
- Purple accent color (`#5E6AD2`)
- Dark backgrounds with proper hierarchy
- Consistent border colors
- Smooth transitions and animations
- Accessible focus states

## Error Handling

All components include:
- Try-catch blocks for API calls
- Console error logging
- User-friendly error messages
- Graceful degradation when APIs are unavailable

## Performance Optimizations

- **Debouncing**: Code changes debounced to 3 seconds
- **Snapshots**: Only created when content actually changes
- **Cleanup**: Proper cleanup of timers, WebSockets, and EventSource on unmount
- **Reconnection**: Smart auto-reconnect logic with timeouts

## Testing Considerations

Components can be tested by:
1. Mocking the fetch API
2. Mocking WebSocket connections
3. Mocking EventSource for SSE
4. Providing mock sessionId and questionId props

## Migration Notes

When integrating these components into existing pages:

### Before:
```tsx
<AIChat
  messages={messages}
  onSendMessage={handleSend}
  isLoading={loading}
/>

<Terminal onCommand={handleCommand} />

<CodeEditor
  value={code}
  onChange={setCode}
  language="javascript"
/>

<FileTree
  files={files}
  selectedFile={selected}
  onFileSelect={setSelected}
/>
```

### After:
```tsx
<AIChat sessionId={sessionId} />

<Terminal sessionId={sessionId} />

<CodeEditor
  sessionId={sessionId}
  questionId={questionId}
  value={code}
  onChange={setCode}
  language="javascript"
/>

<FileTree
  sessionId={sessionId}
  files={files}
  selectedFile={selected}
  onFileSelect={setSelected}
  onFileCreate={handleCreate}
  onFileDelete={handleDelete}
/>
```

## Backend API Requirements

These components expect the following API endpoints to be implemented:

### Chat API
- `GET /api/interview/[id]/chat/history` - Returns `{ messages: Message[] }`
- `GET /api/interview/[id]/chat?message=...` - SSE endpoint returning content/usage/done events

### Terminal API
- `WS /api/interview/[id]/terminal` - WebSocket for terminal I/O

### Test Execution API
- `POST /api/interview/[id]/run-tests` - Body: `{ questionId, code, language }`, Returns: `TestResult`

### Event Recording API
- `POST /api/interview/[id]/events` - Body: `{ eventType, data }`

## Next Steps

1. Implement the backend API endpoints
2. Test WebSocket and SSE connections
3. Update demo page to use new component signatures
4. Add E2E tests for the full flow
5. Consider adding retry logic for failed API calls
6. Add analytics/monitoring for API failures

# Implementation Checklist

## Phase 1: Fix Critical Bugs (1 Day)

### Chat System Fixes
- [ ] Fix AIChat SSE event format in `app/api/interview/[id]/chat/route.ts`
  - [ ] Change `/chat/route.ts` line 127: Add custom event types
  - [ ] Test with sample message in demo mode
  - [ ] Verify streaming works in browser DevTools
  - Files: `/app/api/interview/[id]/chat/route.ts` (20 lines changed)

- [ ] Fix AIChat client event listeners in `components/interview/AIChat.tsx`
  - Already correct (lines 105-148) ✓
  - Just need server fix above

### Security Fixes
- [ ] Remove demo mode auth bypass
  - [ ] `/app/api/interview/[id]/terminal/route.ts` line 14-25
  - [ ] `/app/api/interview/[id]/terminal/input/route.ts` line 116-125
  - [ ] `/app/api/interview/[id]/events/route.ts` - add auth check
  - [ ] `/app/api/interview/[id]/chat/route.ts` - already has auth ✓
  - [ ] `/app/api/interview/[id]/run-tests/route.ts` - already has auth ✓
  - [ ] `/app/api/interview/[id]/questions/route.ts` - already has auth ✓

### Verification
- [ ] Test chat with message "hello"
- [ ] Verify terminal requires auth (test with sessionId="invalid")
- [ ] Verify response structure matches client expectations

---

## Phase 2: Session Initialization (4 Hours)

### Create Initialization Endpoint
- [ ] Create `/app/api/interview/[id]/initialize/route.ts`
  - [ ] Check candidate exists and is authorized
  - [ ] Load assessment and current question
  - [ ] Create Modal sandbox via `createSandbox(sessionId, initialFiles)`
  - [ ] Store sandbox ID in SessionRecording
  - [ ] Initialize timer
  - [ ] Return question + file system + sandbox info
  - Lines: ~100 lines new code

- [ ] Create `/app/api/interview/[id]/submit/route.ts`
  - [ ] Check session is valid
  - [ ] Take final code snapshot
  - [ ] Run final test suite
  - [ ] Archive Modal volume
  - [ ] Update candidate status to COMPLETED
  - Lines: ~50 lines new code

### Update Interview Page
- [ ] Update `app/interview/[id]/page.tsx`
  - [ ] Call `/initialize` on mount (useEffect)
  - [ ] Load currentQuestion from API (not hardcoded)
  - [ ] Load fileSystem from API (not sampleFiles)
  - [ ] Set up timer that decrements
  - [ ] Handle initialization errors
  - Lines: ~40 lines changed

### Update Demo Page
- [ ] Keep `app/interview/demo/page.tsx` working as-is
- [ ] Ensure demo mode bypasses initialize call
- [ ] Test demo still works

---

## Phase 3: File System Sync (6 Hours)

### Create File API Endpoints
- [ ] Create `/app/api/interview/[id]/files/route.ts`
  - [ ] GET: List all files in workspace (`getFileSystem()`)
  - [ ] POST: Create new file
  - [ ] Lines: ~80 lines new code

- [ ] Create `/app/api/interview/[id]/files/[...path]/route.ts`
  - [ ] GET: Read file content (`readFile()`)
  - [ ] PUT: Write file content (`writeFile()`)
  - [ ] DELETE: Delete file (`deleteFile()` - from Modal service)
  - [ ] Validate path is within /workspace
  - [ ] Lines: ~100 lines new code

- [ ] Create `/app/api/interview/[id]/files/watch/route.ts` (optional for MVP)
  - [ ] SSE endpoint for file change notifications
  - [ ] For MVP, can skip - fetch on demand instead

### Create File Sync Hook
- [ ] Create `hooks/useFileSync.ts`
  - [ ] Load initial files on mount
  - [ ] Expose `getFileContent(path)` function
  - [ ] Expose `setFileContent(path, content)` function (debounced)
  - [ ] Optional: Subscribe to file changes via SSE
  - Lines: ~80 lines new code

### Connect to Components
- [ ] Update FileTree to fetch from API
  - [ ] Change `files={sampleFiles}` to use hook
  - [ ] Refresh on file operations
  - [ ] Show loading state while fetching

- [ ] Update CodeEditor to fetch file content
  - [ ] Load file on selection (via hook)
  - [ ] Sync writes to Modal volume (debounced 500ms)
  - [ ] Show unsaved indicator
  - [ ] Lines: ~20 lines changed

### Test File Operations
- [ ] Create new file in UI
- [ ] Edit file content
- [ ] Verify writes persist in Modal volume
- [ ] Verify files show in file tree

---

## Phase 4: Streaming Test Results (3 Hours)

### Update Test API
- [ ] Update `/app/api/interview/[id]/run-tests/route.ts`
  - [ ] Change from JSON response to SSE stream
  - [ ] Stream events: `start`, `test_result` (per test), `done`
  - [ ] Each test_result includes: name, passed, output, error, duration
  - [ ] Lines: ~40 lines changed

### Update CodeEditor Tests Display
- [ ] Update `components/interview/CodeEditor.tsx`
  - [ ] Change test result UI to show progressive updates
  - [ ] Display: Running X/Y tests...
  - [ ] Show each test as it completes (passed/failed)
  - [ ] Update summary at end
  - [ ] Lines: ~50 lines changed

### Test Execution
- [ ] Run tests and verify streaming works
- [ ] Verify UI updates as each test completes
- [ ] Test timeout scenario (what happens at 30s?)

---

## Phase 5: Modal Sandbox Integration (8 Hours)

### Connect Terminal to Modal
- [ ] Update Terminal component
  - [ ] Get WebSocket URL: `getTerminalConnectionUrl(sessionId)`
  - [ ] Connect to Modal terminal (not SSE endpoint)
  - [ ] Send input directly to WebSocket
  - [ ] Receive output directly from WebSocket
  - [ ] Handle connection/disconnect
  - [ ] Lines: ~40 lines changed

- [ ] Update terminal input handler
  - [ ] Remove HTTP POST to `/terminal/input`
  - [ ] Send directly via WebSocket
  - [ ] Still record events to database

### Test Terminal
- [ ] Run commands in terminal
- [ ] Verify they execute in Modal sandbox
- [ ] Verify file changes appear in FileTree
- [ ] Verify output streams correctly

### Wire Up Test Execution
- [ ] Update `run-tests/route.ts`
  - [ ] Call `executeCode()` from Modal service (already exists)
  - [ ] Remove mock execution fallback (for production)
  - [ ] Stream results via SSE
  - [ ] Lines: ~20 lines changed

---

## Phase 6: State Management (8 Hours)

### Create Interview Context
- [ ] Create `contexts/InterviewContext.tsx`
  - [ ] Define state shape:
    ```typescript
    {
      sessionId: string;
      candidateId: string;
      currentQuestion: Question | null;
      fileTree: FileNode[];
      selectedFile: string;
      timeRemaining: number;
      isRunning: boolean;
      error: Error | null;
      isConnected: boolean;
    }
    ```
  - [ ] Define action types (INIT, UPDATE_TIME, FILE_SELECT, etc.)
  - [ ] Create reducer function
  - [ ] Lines: ~150 lines new code

- [ ] Create `hooks/useInterview.ts`
  - [ ] Wraps useContext(InterviewContext)
  - [ ] Provides typed dispatch actions
  - [ ] Handles API calls
  - [ ] Lines: ~100 lines new code

### Update Interview Page
- [ ] Wrap with InterviewProvider
- [ ] Replace all useState with context dispatch
- [ ] Remove scattered API calls
- [ ] Lines: ~50 lines changed

### Update Components
- [ ] FileTree: Use context
- [ ] CodeEditor: Use context
- [ ] Terminal: Use context
- [ ] AIChat: Use context
- [ ] Lines: ~30 lines per component

---

## Phase 7: Polish & Optimization (8 Hours)

### Error Handling
- [ ] Add error boundaries around interview page
- [ ] Add error display in each component
- [ ] Add retry buttons for failed API calls
- [ ] Log errors to analytics

### Session Persistence
- [ ] Save state to localStorage on changes
- [ ] Restore state on page reload
- [ ] Show "session resumed" notification
- [ ] Sync with server if state diverged

### Performance
- [ ] Batch events before sending (5s intervals)
- [ ] Cache file reads (5s TTL)
- [ ] Debounce file writes (500ms)
- [ ] Measure: Session init time < 2s
- [ ] Measure: File sync latency < 100ms

### Monitoring
- [ ] Add structured logging to key operations
- [ ] Track: session init time, error rate, api latency
- [ ] Add /api/health endpoint expansion
- [ ] Set up alerts for errors

### UI Polish
- [ ] Add loading skeletons for files
- [ ] Add loading spinner for session init
- [ ] Add unsaved indicator for files
- [ ] Add connection status indicator
- [ ] Add keyboard shortcuts (Ctrl+S to save, etc.)

---

## Testing Checklist

### Unit Tests
- [ ] Test useFileSync hook
- [ ] Test interviewReducer
- [ ] Test event formatting

### Integration Tests
- [ ] Session initialization flow
- [ ] File read/write/delete
- [ ] Code execution and streaming
- [ ] AIChat message sending and streaming
- [ ] Terminal command execution

### E2E Tests (Cypress/Playwright)
- [ ] Full interview flow from start to finish
- [ ] Edit code → run tests → pass tests
- [ ] Ask AI question → get response
- [ ] Switch files → load different content

### Manual Testing
- [ ] Demo mode (should still work)
- [ ] Real session (with auth)
- [ ] Network disconnection recovery
- [ ] Long-running test (30+ seconds)
- [ ] Multiple file edits rapidly

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] No console errors
- [ ] Environment variables configured:
  - [ ] MODAL_TOKEN_ID
  - [ ] MODAL_TOKEN_SECRET
  - [ ] ANTHROPIC_API_KEY
  - [ ] DATABASE_URL
- [ ] Auth checks uncommented
- [ ] Demo mode removed/disabled

### Staging
- [ ] Deploy to staging environment
- [ ] Test full flow with test account
- [ ] Monitor error logs
- [ ] Verify database migrations ran
- [ ] Check Modal sandbox creation works

### Production
- [ ] Create database backup
- [ ] Deploy during low-traffic period
- [ ] Monitor error rate (target: <0.1%)
- [ ] Monitor API response times
- [ ] Have rollback plan ready

---

## Files Summary

### New Files to Create
1. `/app/api/interview/[id]/initialize/route.ts` (100 lines)
2. `/app/api/interview/[id]/submit/route.ts` (50 lines)
3. `/app/api/interview/[id]/files/route.ts` (80 lines)
4. `/app/api/interview/[id]/files/[...path]/route.ts` (100 lines)
5. `/hooks/useFileSync.ts` (80 lines)
6. `/contexts/InterviewContext.tsx` (150 lines)
7. `/hooks/useInterview.ts` (100 lines)

### Files to Modify
1. `/app/api/interview/[id]/chat/route.ts` (20 lines)
2. `/app/api/interview/[id]/terminal/route.ts` (15 lines)
3. `/app/api/interview/[id]/terminal/input/route.ts` (10 lines)
4. `/app/api/interview/[id]/run-tests/route.ts` (40 lines)
5. `/app/interview/[id]/page.tsx` (40 lines)
6. `/components/interview/CodeEditor.tsx` (50 lines)
7. `/components/interview/Terminal.tsx` (40 lines)
8. `/components/interview/FileTree.tsx` (30 lines)

**Total:** ~1000 lines of new code, ~200 lines of modifications

---

## Timeline Estimate

| Phase | Time | Complexity |
|-------|------|-----------|
| Phase 1: Critical Fixes | 1 day | Low |
| Phase 2: Session Init | 0.5 day | Medium |
| Phase 3: File Sync | 1.5 days | High |
| Phase 4: Test Streaming | 0.5 day | Low |
| Phase 5: Modal Integration | 1.5 days | High |
| Phase 6: State Management | 1.5 days | Medium |
| Phase 7: Polish | 1.5 days | Low |
| **Testing & Debugging** | **2 days** | **High** |
| **Total** | **10 days** | **--** |

**Recommended:** 2 weeks with buffer for unforeseen issues


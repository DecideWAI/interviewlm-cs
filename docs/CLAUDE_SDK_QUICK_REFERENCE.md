# Claude Code SDK Integration - Quick Reference

## Current Status
- **API Integration:** None (using client-side mock responses)
- **Backend Readiness:** 9/10 (auth, DB, API structure ready)
- **Estimated Implementation:** 3-5 weeks for full integration

## Key Findings

### What's Missing
1. `@anthropic-ai/sdk` dependency (not in package.json)
2. API routes for Claude integration (no `/api/interview/[id]/chat` endpoint)
3. Prisma schema for message history (Candidate.sessionData is JSON blob)
4. Environment variables (ANTHROPIC_API_KEY, ANTHROPIC_MODEL)
5. Real streaming implementation (demo uses 1.5s artificial delay)

### What's Already in Place
- `AIChat.tsx` component (pure presentational, ready for real API)
- NextAuth authentication system (JWT + Prisma adapter)
- Middleware for route protection
- Database with Candidate model that can store sessions
- Terminal (xterm.js) and CodeEditor (CodeMirror 6) components

## Recommended Tech Stack

| Component | Technology | Version | Notes |
|-----------|-----------|---------|-------|
| **SDK** | @anthropic-ai/sdk | 0.28.0+ | Official Anthropic SDK |
| **Streaming** | Next.js built-in | 15.0.0 | Server-Sent Events (SSE) |
| **Authentication** | NextAuth v5 | 5.0.0-beta.30 | Already integrated |
| **Model** | Claude Sonnet 4.5 | Latest | Best balance of cost/quality |
| **Database** | PostgreSQL + Prisma | Current | Add Message & TokenUsage models |

## Architecture at a Glance

```
Frontend (AIChat)
    ↓ fetch /api/interview/[id]/chat
Backend API Route
    ↓ buildClaudePrompt()
Claude SDK
    ↓ messages.stream()
Anthropic API (streaming)
    ↓ Server-Sent Events
Browser (real-time UI update)
```

## Critical Implementation Details

### 1. API Key Security
```env
# .env.local (NEVER commit)
ANTHROPIC_API_KEY="sk-ant-v1-..."

# .env.example (show in repo)
ANTHROPIC_API_KEY="your-api-key-here"
```

### 2. Streaming Response Format
```
event: text
data: {"text":"Here's"}

event: text  
data: {"text":" the answer"}

event: done
data: {"stop_reason":"end_turn"}
```

### 3. Frontend Consumer
```typescript
const response = await fetch('/api/interview/[id]/chat', {
  method: 'POST',
  body: JSON.stringify({ message, currentCode, language })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  // Parse SSE and update UI
}
```

## Database Schema Additions Needed

```prisma
model Message {
  id        String   @id @default(cuid())
  sessionId String   @map("session_id")
  role      String   // "user" | "assistant"
  content   String   @db.Text
  tokens    Int
  timestamp DateTime @default(now())
  
  @@map("messages")
}

model TokenUsage {
  id            String   @id @default(cuid())
  userId        String   @map("user_id")
  sessionId     String   @map("session_id")
  modelUsed     String
  inputTokens   Int      @map("input_tokens")
  outputTokens  Int      @map("output_tokens")
  costUSD       Float    @map("cost_usd")
  timestamp     DateTime @default(now())
  
  @@index([userId])
  @@map("token_usages")
}
```

## Cost Economics

**Per 60-minute assessment:**

| Scenario | Claude Cost | Infrastructure | Total COGS | Price | Margin |
|----------|------------|-----------------|-----------|-------|--------|
| Light (30 interactions) | $1.10 | $0.63 | $1.73 | $10 | 82.7% |
| Medium (45 interactions) | $1.81 | $0.73 | $2.54 | $10 | 74.6% |
| Heavy (65 interactions) | $3.11 | $0.83 | $3.94 | $10 | 60.6% |

**Blended (40/35/25):** $2.54 COGS, 74.6% margin

## Files to Create (Phase 1)

1. **lib/ai/claude-integration.ts** (150 lines)
   - Initialize Anthropic client
   - Token counting utilities
   - Model config constants

2. **lib/ai/prompt-builder.ts** (200 lines)
   - Build system prompt with context
   - Build user message with code/test output
   - Conversation history builder

3. **app/api/interview/[id]/chat/route.ts** (250 lines)
   - Authentication check
   - Load interview session context
   - Stream Claude response as SSE

4. **lib/ai/error-handler.ts** (150 lines)
   - Retry logic with exponential backoff
   - Fallback to smaller models
   - Rate limit handling

## Implementation Checklist

### Week 1
- [ ] Install @anthropic-ai/sdk
- [ ] Create lib/ai/claude-integration.ts
- [ ] Create lib/ai/prompt-builder.ts
- [ ] Add Message model to Prisma
- [ ] Update .env.example

### Week 2
- [ ] Create /api/interview/[id]/chat endpoint
- [ ] Update AIChat component for streaming
- [ ] Add error handling and retries
- [ ] Test with demo interview
- [ ] Add basic token usage tracking

### Week 3
- [ ] Create /api/interview/[id]/apply-code endpoint
- [ ] Create /api/interview/[id]/execute-command endpoint
- [ ] Add advanced token tracking
- [ ] Implement rate limiting

### Week 4+
- [ ] Prompt caching optimization
- [ ] Model selection heuristics
- [ ] Cost monitoring dashboard
- [ ] Performance optimization

## Testing Strategy

```bash
# Unit tests for prompt builders
npm test lib/ai/prompt-builder.test.ts

# Integration tests for chat API
npm test __tests__/api/interview/chat.test.ts

# Manual testing with demo
npm run dev
# Navigate to /interview/demo
```

## Common Pitfalls to Avoid

1. **API Key in Frontend Code** - Always use backend proxy
2. **Not Streaming Responses** - Use SSE for real-time feel
3. **No Token Counting** - Track costs per request
4. **Ignoring Rate Limits** - Implement exponential backoff
5. **Long Context Windows** - Prune old messages to manage token count
6. **No Error Recovery** - Add fallback models and retries

## Next Steps

1. **Immediate:** Install SDK and create basic client
2. **Short-term (1 week):** Implement streaming chat endpoint
3. **Medium-term (2 weeks):** Add message persistence and tracking
4. **Long-term (4 weeks):** Optimize costs and add advanced features

## Documentation Links

- Anthropic API: https://docs.anthropic.com
- Claude Models: https://docs.anthropic.com/models
- Streaming Guide: https://docs.anthropic.com/streaming
- SDK GitHub: https://github.com/anthropics/anthropic-sdk-python


# Claude Code SDK Integration Report for InterviewLM
**Date:** November 9, 2025
**Scope:** Integration of Anthropic Claude API with real-time AI coding assistance

---

## EXECUTIVE SUMMARY

InterviewLM currently has **zero API integration** with Anthropic/Claude. The demo mode uses client-side mock responses. This report provides architecture, implementation patterns, and cost analysis for integrating Claude Code SDK to provide real-time AI assistance during coding interviews.

**Key Findings:**
- No Anthropic/Claude dependencies currently installed
- Demo AI responses are hardcoded client-side keyword matching
- Backend infrastructure (API routes, authentication) is ready to support integration
- Database schema supports session recording but lacks message history storage
- Recommended approach: Claude SDK v3+ with Server-Sent Events streaming for real-time responses

---

## SECTION 1: CURRENT AI INTEGRATION STATUS

### 1.1 Current Architecture

**Frontend Component Analysis:**

**File:** `components/interview/AIChat.tsx` (193 lines)
- Pure presentational component (no API calls)
- Props: `messages`, `onSendMessage`, `isLoading`, `className`
- Handles: message display, input UI, copy-to-clipboard functionality
- **Status:** Ready for real API integration (no refactoring needed)

**File:** `app/interview/demo/page.tsx` (345 lines)
- Simulates AI responses client-side (lines 109-196)
- Uses keyword matching for mock responses:
  ```typescript
  if (message.toLowerCase().includes("approach")) { ... }
  else if (message.toLowerCase().includes("code")) { ... }
  else if (message.toLowerCase().includes("debug")) { ... }
  ```
- 1.5-second artificial delay to simulate thinking
- **Status:** Demonstrates expected UX but needs replacement with real API

### 1.2 Backend Infrastructure Status

**API Routes Established:**
- `app/api/auth/[...nextauth]/route.ts` - Authentication (NextAuth v5)
- `app/api/auth/register/route.ts` - User registration
- `app/api/health/route.ts` - Health checks
- **No AI API routes exist yet**

**Authentication System:**
- NextAuth v5 with Prisma adapter
- JWT sessions enabled
- OAuth providers: GitHub, Google
- Auth helpers available (`lib/auth-helpers.ts`)
- Server-side route protection patterns in place

### 1.3 Package.json Analysis

**Current Dependencies:**
```json
{
  "@auth/prisma-adapter": "^2.11.1",
  "@prisma/client": "^6.19.0",
  "next": "^15.0.0",
  "next-auth": "^5.0.0-beta.30",
  "react": "^19.0.0"
}
```

**Missing for Claude Integration:**
- No `@anthropic-ai/sdk` dependency
- No streaming response libraries
- No real-time communication libraries

### 1.4 Environment Variables

**Current `.env.example` (48 lines):**
```
DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
AWS S3 credentials (optional)
Redis (optional)
```

**Missing for Claude API:**
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` (e.g., "claude-opus-4-1" or "claude-sonnet-4-5")
- `INTERVIEW_SESSION_ID_SECRET` (for secure session tracking)

---

## SECTION 2: RECOMMENDED SDK & LIBRARIES

### 2.1 Anthropic SDK (Required)

**Library:** `@anthropic-ai/sdk`
**Current Version:** 0.28.0+ (as of Nov 2025)
**Documentation:** https://docs.anthropic.com

**Installation:**
```bash
npm install @anthropic-ai/sdk
```

**Why This Library:**
- Official Anthropic SDK for Node.js/JavaScript
- Full support for Claude Opus, Sonnet, Haiku models
- Streaming API support via `stream()` method
- Type-safe TypeScript definitions included
- Handles retries, rate limiting, error handling

**Key Features:**
```typescript
// Streaming responses
const stream = await client.messages.stream({
  model: "claude-opus-4-1",
  max_tokens: 1024,
  messages: [{ role: "user", content: "..." }]
});

// Streaming text events
stream.on("text", (text) => {
  console.log(text);
});

// Full message when done
const message = await stream.finalMessage();
```

### 2.2 Streaming & Real-time Communication

**Framework:** Next.js built-in streaming (Server-Sent Events)
**No additional library needed** - Next.js API routes support streaming natively

**Why SSE over WebSockets:**
- SSE is simpler (one-way server → client)
- Perfect for streaming AI responses
- Built-in browser support (EventSource API)
- Works with Next.js out of the box
- No WebSocket infrastructure complexity

**Alternative Considerations:**
- **Vercel AI SDK** (`ai` package): Abstraction over LLM streaming
  - Pros: Framework-agnostic, handles streaming complexity
  - Cons: Adds dependency, less fine-grained control
  - **Recommendation:** Use it for faster integration, but direct SDK calls offer more control for interviews

### 2.3 Supporting Libraries

**Optional but Recommended:**

```bash
# For token counting (predict costs)
npm install js-tiktoken

# For markdown rendering in chat (already have Tailwind + prose)
# Already included in AIChat component

# For request tracing & debugging
npm install opentelemetry-api

# For rate limiting (user protection)
npm install ioredis  # if using Redis caching
```

---

## SECTION 3: ARCHITECTURE FOR REAL-TIME AI CODING ASSISTANCE

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│          Frontend (Next.js 15)                  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │ app/interview/[id]/page.tsx              │  │
│  │ (Main interview session container)       │  │
│  └──────┬───────────────────────────────────┘  │
│         │                                        │
│    ┌────▼──────────────────────────────────┐   │
│    │ Components:                            │   │
│    │ • CodeEditor (CodeMirror 6)           │   │
│    │ • Terminal (xterm.js)                 │   │
│    │ • AIChat (streaming responses)        │   │
│    │ • FileTree                            │   │
│    └────┬──────────────────────────────────┘   │
│         │ fetch API                            │
└─────────┼────────────────────────────────────┘
          │
          │ POST /api/interview/[id]/chat
          │ (streaming SSE response)
          │
┌─────────▼────────────────────────────────────┐
│    Backend (Next.js API Routes)               │
│                                                │
│  ┌──────────────────────────────────────────┐│
│  │ app/api/interview/[id]/chat/route.ts    ││
│  │ • Auth validation (requireAuth)          ││
│  │ • Get interview session context          ││
│  │ • Build Claude prompt with code context ││
│  │ • Stream responses to client             ││
│  └──────────────────────────────────────────┘│
│         │                                      │
│         │ Uses Anthropic SDK                  │
│         │                                      │
│  ┌──────▼──────────────────────────────────┐ │
│  │ lib/ai/claude-integration.ts            │ │
│  │ • Initialize Claude client              │ │
│  │ • Build conversation context            │ │
│  │ • Handle streaming                      │ │
│  │ • Token counting & cost tracking        │ │
│  └──────┬───────────────────────────────────┤ │
│         │                                     │ │
└─────────┼─────────────────────────────────────┘
          │ ANTHROPIC_API_KEY
          │
          ▼
    ┌─────────────────┐
    │  Claude API     │
    │  (Anthropic)    │
    │                 │
    │  Models:        │
    │  • Opus 4.1     │
    │  • Sonnet 4.5   │
    │  • Haiku 3.5    │
    └─────────────────┘

Database (for session history):
┌─────────────────────────────────────────┐
│ Prisma Models (to be created):          │
│                                          │
│ InterviewSession                        │
│ ├── id, candidateId, assessmentId      │
│ ├── startedAt, completedAt             │
│ ├── codeSnapshots: CodeSnapshot[]      │
│ └── messages: Message[]                │
│                                          │
│ Message                                │
│ ├── id, sessionId                      │
│ ├── role: "user" | "assistant"         │
│ ├── content, tokenCount                │
│ ├── timestamp                          │
│ └── metadata: { ... }                  │
│                                          │
│ CodeSnapshot                           │
│ ├── sessionId, timestamp               │
│ ├── code, language                     │
│ └── hash (for deduplication)           │
└─────────────────────────────────────────┘
```

### 3.2 Data Flow for AI Requests

**Flow 1: User sends message to Claude**

```
1. User types message in AIChat component
2. handleSendMessage() called
3. POST /api/interview/[sessionId]/chat
   {
     message: "Help me debug this error",
     currentCode: "function foo() { ... }",
     language: "typescript",
     testOutput?: "Error: Expected..."
   }

4. Backend API route:
   - Verify user authentication
   - Get interview session from DB
   - Build prompt context:
     * Problem statement
     * Current code
     * Previous messages (conversation history)
     * Language/framework hints
     * Error messages (if any)
   
5. Call Anthropic API with streaming:
   client.messages.stream({
     model: "claude-opus-4-1",
     max_tokens: 2048,
     system: [problem context, coding guidelines],
     messages: [
       { role: "user", content: prev_message_1 },
       { role: "assistant", content: prev_response_1 },
       ...,
       { role: "user", content: current_message }
     ]
   })

6. Stream response back to client as SSE:
   event: text
   data: "Here's a solution:\n\n```typescript\nfunction fixed() {\n"
   
   event: text
   data: "  // implementation\n}\n```\n"
   
   event: done
   data: {"stop_reason": "end_turn"}

7. Frontend receives streamed text and appends to chat UI in real-time

8. Store message pair in DB when done
```

### 3.3 Streaming Implementation Pattern

**Backend Streaming Endpoint:** `app/api/interview/[id]/chat/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { getInterviewSession } from "@/lib/interview-service";
import { buildClaudePrompt } from "@/lib/ai/prompt-builder";
import { anthropicClient } from "@/lib/ai/claude-integration";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Verify authentication
    const session = await requireAuth();
    
    // 2. Get interview session
    const interviewSession = await getInterviewSession(
      params.id,
      session.user.id
    );
    
    if (!interviewSession) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 }
      );
    }
    
    // 3. Parse request
    const { message, currentCode, language, testOutput } = 
      await request.json();
    
    // 4. Build prompt with context
    const { systemPrompt, userPrompt } = buildClaudePrompt({
      problemStatement: interviewSession.problem,
      currentCode,
      language,
      conversationHistory: interviewSession.messages,
      testOutput,
      hints: interviewSession.hints
    });
    
    // 5. Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Initialize Claude stream
          const claudeStream = await anthropicClient.messages.stream({
            model: process.env.ANTHROPIC_MODEL || "claude-opus-4-1",
            max_tokens: 2048,
            temperature: 0.7,
            system: systemPrompt,
            messages: [
              ...interviewSession.messages.map(msg => ({
                role: msg.role as "user" | "assistant",
                content: msg.content
              })),
              { role: "user", content: userPrompt }
            ]
          });
          
          // Stream text events
          for await (const event of claudeStream) {
            if (event.type === "content_block_delta" && 
                event.delta?.type === "text_delta") {
              const text = event.delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              );
            }
          }
          
          // Send done signal
          const finalMessage = await claudeStream.finalMessage();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ 
                done: true, 
                stop_reason: finalMessage.stop_reason 
              })}\n\n`
            )
          );
          
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });
    
    // 6. Return SSE response
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
    
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
```

**Frontend Streaming Consumer:** `components/interview/AIChat.tsx`

```typescript
const handleSendMessage = async (message: string) => {
  const userMessage: Message = {
    id: Date.now().toString(),
    role: "user",
    content: message,
    timestamp: new Date()
  };
  
  setMessages(prev => [...prev, userMessage]);
  setIsLoading(true);
  
  try {
    // Create EventSource for streaming
    const response = await fetch(
      `/api/interview/${sessionId}/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          currentCode: code,
          language: "typescript",
          testOutput: terminalOutput
        })
      }
    );
    
    if (!response.ok) throw new Error("Failed to send message");
    
    // Create reader for streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let assistantContent = "";
    
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value);
      const lines = text.split("\n");
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              assistantContent += data.text;
              // Update message in real-time
              setMessages(prev => {
                const updated = [...prev];
                if (updated[updated.length - 1]?.role === "assistant") {
                  updated[updated.length - 1].content = assistantContent;
                } else {
                  updated.push({
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: assistantContent,
                    timestamp: new Date()
                  });
                }
                return updated;
              });
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }
    }
    
  } catch (error) {
    console.error("Error sending message:", error);
    // Handle error UI
  } finally {
    setIsLoading(false);
  }
};
```

---

## SECTION 4: STREAMING RESPONSES & REAL-TIME PATTERNS

### 4.1 Streaming Response Format

**Server-Sent Events (SSE) Format:**

```
event: text
data: {"text":"Here's a","tokenCount":2}

event: text
data: {"text":" solution","tokenCount":3}

event: text
data: {"text":"\n\n```typescript","tokenCount":4}

event: done
data: {"stop_reason":"end_turn","totalTokens":156,"costUSD":0.0047}
```

**Advantages over alternatives:**
- Works over HTTP (no WebSocket upgrade needed)
- Built-in browser support (EventSource API)
- Perfect for one-directional (server→client) streaming
- Simpler infrastructure on Vercel/serverless platforms

### 4.2 File Editing Pattern

**When Claude suggests code changes:**

```
POST /api/interview/[id]/apply-suggestion
{
  "messageId": "claude-msg-123",
  "fileId": "solution.ts",
  "code": "function longestPalindrome(s: string): string { ... }",
  "action": "replace" | "append" | "insert-at-line"
}

Response:
{
  "success": true,
  "codeHash": "abc123def456",
  "appliedAt": "2025-11-09T12:34:56Z"
}
```

**Frontend Integration:**

```typescript
// When Claude suggests code in chat response
const hasCodeBlock = /```[\w]*\n([\s\S]*?)```/.test(message.content);

if (hasCodeBlock) {
  // Extract code and show "Apply" button
  <Button 
    onClick={() => applyCodeSuggestion(extractedCode)}
    className="mt-2"
  >
    Apply Code Suggestion
  </Button>
}
```

### 4.3 Terminal Command Execution Pattern

**Flow for terminal commands mentioned by Claude:**

```
Claude: "Try running: npm test"

User clicks "Run" or types: npm test

POST /api/interview/[id]/execute-command
{
  "command": "npm test",
  "timeout": 30000,
  "environment": { "NODE_ENV": "test" }
}

Response (streaming):
event: output
data: {"output":"$ npm test\n","timestamp":"2025-11-09T12:34:56Z"}

event: output
data: {"output":"PASS  solution.test.ts\n"}

event: output
data: {"output":"✓ example test (5ms)\n"}

event: done
data: {"exitCode":0,"duration":2500}
```

**Backend Implementation:**

```typescript
export async function POST(request: NextRequest) {
  const { command, timeout = 30000 } = await request.json();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Execute in sandbox (Modal AI, Docker, etc.)
        const proc = spawn("sh", ["-c", command]);
        
        proc.stdout.on("data", (data) => {
          const output = data.toString();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ output })}\n\n`)
          );
        });
        
        proc.stderr.on("data", (data) => {
          const error = data.toString();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error })}\n\n`)
          );
        });
        
        proc.on("close", (code) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, code })}\n\n`)
          );
          controller.close();
        });
        
        // Timeout protection
        setTimeout(() => proc.kill(), timeout);
      } catch (error) {
        controller.error(error);
      }
    }
  });
  
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache"
    }
  });
}
```

---

## SECTION 5: AUTHENTICATION & API KEY MANAGEMENT

### 5.1 Anthropic API Key Configuration

**Setup in `.env.local`:**

```env
# Anthropic API Key (get from https://console.anthropic.com/)
ANTHROPIC_API_KEY="sk-ant-v1-xxxx...xxxx"

# Model selection (for cost optimization)
ANTHROPIC_MODEL="claude-opus-4-1"

# Optional: Rate limiting
ANTHROPIC_MAX_REQUESTS_PER_MINUTE=60
ANTHROPIC_MAX_TOKENS_PER_REQUEST=4096
```

**DO NOT expose ANTHROPIC_API_KEY to frontend** - always proxy through backend API routes.

### 5.2 Backend API Key Initialization

**File:** `lib/ai/claude-integration.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";

// Initialize once at module load (singleton pattern)
export const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    "User-Agent": "InterviewLM/1.0"
  },
  timeout: 60000, // 60 second timeout for streaming
  maxRetries: 2
});

// Export utility for token counting
export async function countTokens(text: string): Promise<number> {
  // Use Anthropic token counting API when available
  // For now, estimate: ~1 token per 4 characters
  return Math.ceil(text.length / 4);
}

// Export model info for cost calculations
export const MODEL_CONFIG = {
  "claude-opus-4-1": {
    inputCostPer1M: 15, // $15 per million input tokens
    outputCostPer1M: 75, // $75 per million output tokens
    contextWindow: 200000,
    displayName: "Claude Opus 4.1"
  },
  "claude-sonnet-4-5": {
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    contextWindow: 200000,
    displayName: "Claude Sonnet 4.5"
  },
  "claude-haiku-3-5": {
    inputCostPer1M: 0.80,
    outputCostPer1M: 4,
    contextWindow: 200000,
    displayName: "Claude Haiku 3.5"
  }
};
```

### 5.3 Multi-User Request Isolation

**Requirement:** Each user's API request is authenticated and isolated.

**Implementation in API routes:**

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Verify user is authenticated
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // 2. Verify user owns this interview session
    const interview = await prisma.candidate.findUnique({
      where: { id: params.id },
      select: { createdById: true, organizationId: true }
    });
    
    if (!interview || interview.createdById !== session.user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }
    
    // 3. Rate limit per user (optional Redis)
    const rateLimitKey = `claude:${session.user.id}`;
    const requestCount = await redis.incr(rateLimitKey);
    if (requestCount === 1) {
      await redis.expire(rateLimitKey, 60); // Reset after 60 seconds
    }
    
    if (requestCount > 10) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 }
      );
    }
    
    // 4. Call Claude API with user context
    const response = await anthropicClient.messages.create({
      model: process.env.ANTHROPIC_MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: "..." }],
      metadata: {
        user_id: session.user.id,
        interview_id: params.id,
        timestamp: new Date().toISOString()
      }
    });
    
    return NextResponse.json(response);
    
  } catch (error) {
    // Log errors with user context for debugging
    console.error(`Claude API error for user ${session?.user?.id}:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 5.4 Cost Tracking & Usage Monitoring

**Database Schema Addition:**

```prisma
model TokenUsage {
  id              String   @id @default(cuid())
  userId          String   @map("user_id")
  sessionId       String   @map("session_id")
  modelUsed       String   // "claude-opus-4-1", "claude-sonnet-4-5", etc.
  inputTokens     Int      @map("input_tokens")
  outputTokens    Int      @map("output_tokens")
  costUSD         Float    @map("cost_usd")
  timestamp       DateTime @default(now())
  
  user            User     @relation(fields: [userId], references: [id])
  
  @@index([userId])
  @@index([timestamp])
  @@map("token_usages")
}
```

**Usage Tracking Function:**

```typescript
export async function trackTokenUsage(
  userId: string,
  sessionId: string,
  message: MessageCreateParamsNonStreaming
): Promise<void> {
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-1";
  const modelConfig = MODEL_CONFIG[model];
  
  const inputTokens = message.usage?.input_tokens || 0;
  const outputTokens = message.usage?.output_tokens || 0;
  
  const costUSD = 
    (inputTokens * modelConfig.inputCostPer1M / 1000000) +
    (outputTokens * modelConfig.outputCostPer1M / 1000000);
  
  await prisma.tokenUsage.create({
    data: {
      userId,
      sessionId,
      modelUsed: model,
      inputTokens,
      outputTokens,
      costUSD
    }
  });
}
```

---

## SECTION 6: PROMPT ENGINEERING FOR INTERVIEW CONTEXT

### 6.1 System Prompt Template

```typescript
export function buildSystemPrompt(context: InterviewContext): string {
  return `You are Claude, an expert coding assistant helping a candidate during a technical interview.

## Assessment Details
- Problem: ${context.problemTitle}
- Difficulty: ${context.difficulty}
- Language: ${context.language}
- Time Limit: ${context.timeLimit} minutes

## Your Role
1. Help the candidate understand the problem
2. Suggest approaches and algorithms
3. Review and debug their code
4. Provide hints (not complete solutions)
5. Encourage best practices
6. Explain concepts when asked

## Guidelines
- Be encouraging and supportive
- Explain your reasoning clearly
- Suggest improvements thoughtfully
- Don't provide complete solutions (help them learn)
- Flag edge cases to consider
- Praise good problem-solving approach

## Code Context
The candidate is working on:
\`\`\`${context.language}
${context.currentCode}
\`\`\`

${context.testOutput ? `## Test Results\n${context.testOutput}` : ""}

## Important Notes
- This is a learning opportunity, not a test to pass/fail
- Guide them to discover solutions
- Be honest about what works and what doesn't
`;
}
```

### 6.2 Conversation Context Building

```typescript
export function buildMessageHistory(
  previousMessages: Message[],
  maxTokens: number = 3000
): Array<{ role: "user" | "assistant"; content: string }> {
  // Include recent messages, pruning oldest if needed
  const messages = [...previousMessages];
  let tokenCount = 0;
  
  // Work backwards to include recent context
  const result: Array<{ role: string; content: string }> = [];
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = Math.ceil(msg.content.length / 4);
    
    if (tokenCount + msgTokens > maxTokens && result.length > 0) {
      break; // Stop if we exceed token limit
    }
    
    result.unshift({
      role: msg.role,
      content: msg.content
    });
    
    tokenCount += msgTokens;
  }
  
  return result as Array<{ role: "user" | "assistant"; content: string }>;
}
```

---

## SECTION 7: ERROR HANDLING & RESILIENCE

### 7.1 Common Error Scenarios

```typescript
import { APIError, APIConnectionError } from "@anthropic-ai/sdk";

async function callClaudeWithRetry(
  prompt: string,
  maxRetries: number = 2
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await anthropicClient.messages.create({
        model: process.env.ANTHROPIC_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }]
      });
    } catch (error) {
      if (error instanceof APIConnectionError) {
        // Network error - retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      } else if (error instanceof APIError) {
        if (error.status === 429) {
          // Rate limited - wait and retry
          if (attempt < maxRetries) {
            const retryAfter = parseInt(error.headers?.["retry-after"] || "30");
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            continue;
          }
        } else if (error.status === 401) {
          // Invalid API key - don't retry
          throw new Error("Invalid Anthropic API key");
        } else if (error.status === 400) {
          // Bad request - likely from prompt - don't retry
          throw new Error(`Invalid request: ${error.message}`);
        }
      }
      throw error;
    }
  }
}
```

### 7.2 Fallback Strategies

```typescript
// Use smaller model as fallback
const MODEL_FALLBACK_CHAIN = [
  "claude-opus-4-1",      // Preferred: best quality
  "claude-sonnet-4-5",    // Fallback 1: faster, still good quality
  "claude-haiku-3-5"      // Fallback 2: quickest, acceptable quality
];

async function callClaudeWithFallback(prompt: string) {
  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      return await anthropicClient.messages.create({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }]
      });
    } catch (error) {
      if (model === MODEL_FALLBACK_CHAIN[MODEL_FALLBACK_CHAIN.length - 1]) {
        // Last resort failed
        throw error;
      }
      // Try next model
      console.warn(`Model ${model} failed, trying fallback...`);
      continue;
    }
  }
}
```

---

## SECTION 8: IMPLEMENTATION ROADMAP

### Phase 1: Core Integration (Weeks 1-2)

**Deliverables:**
- [ ] Add @anthropic-ai/sdk dependency
- [ ] Create `lib/ai/claude-integration.ts` with client initialization
- [ ] Create `app/api/interview/[id]/chat/route.ts` with streaming
- [ ] Update `.env.example` with ANTHROPIC_API_KEY
- [ ] Modify AIChat component to use real API
- [ ] Add message storage to Prisma schema
- [ ] Test with demo interview

**Files to Create:**
1. `lib/ai/claude-integration.ts` (initialization, token counting)
2. `lib/ai/prompt-builder.ts` (system & user prompts)
3. `app/api/interview/[id]/chat/route.ts` (streaming endpoint)
4. `lib/ai/error-handler.ts` (retry logic, fallbacks)

### Phase 2: Advanced Features (Weeks 3-4)

**Deliverables:**
- [ ] Code suggestion application endpoint
- [ ] Terminal command execution streaming
- [ ] Token usage tracking and cost reporting
- [ ] Rate limiting per user
- [ ] Message persistence

**Files to Create:**
1. `app/api/interview/[id]/apply-code/route.ts`
2. `app/api/interview/[id]/execute-command/route.ts`
3. `lib/token-usage-service.ts`

### Phase 3: Optimization (Weeks 5-6)

**Deliverables:**
- [ ] Prompt caching for common contexts
- [ ] Model selection based on prompt complexity
- [ ] Response time optimization
- [ ] Cost monitoring dashboard

---

## SECTION 9: COST ANALYSIS & MODEL SELECTION

### 9.1 Token Usage Estimates (from CLAUDE_CODE_TOKEN_ANALYSIS.md)

**Per 60-minute interview:**

| Scenario | Interactions | Input Tokens | Output Tokens | Claude Cost |
|----------|--------------|--------------|---------------|-------------|
| Light | 30 | 93,000 | 52,500 | $1.10 |
| Medium | 45 | 167,000 | 87,000 | $1.81 |
| Heavy | 65 | 285,000 | 150,000 | $3.11 |

### 9.2 Model Recommendation by Use Case

**For interview scoring (highest quality needed):**
```
Model: claude-opus-4-1
- Input: $15/MTok
- Output: $75/MTok
- Context: 200K tokens
- Latency: 2-5 seconds
- Best for: Complex debugging, architecture discussions
```

**For standard interviews (balanced quality/cost):**
```
Model: claude-sonnet-4-5
- Input: $3/MTok
- Output: $15/MTok
- Context: 200K tokens
- Latency: 1-2 seconds
- Best for: Most coding problems
```

**For hint system (speed matters):**
```
Model: claude-haiku-3-5
- Input: $0.80/MTok
- Output: $4/MTok
- Context: 200K tokens
- Latency: 0.5-1 second
- Best for: Quick hints, code reviews
```

### 9.3 Pricing Strategy Alignment

With current pricing of $10/assessment and estimated blended COGS of $2.54:

```
Pricing: $10.00
Claude API: -$1.81 (medium scenario)
Other infrastructure: -$0.73
─────────────
Gross Profit: $7.46
Margin: 74.6% ✓
```

---

## SECTION 10: SECURITY CONSIDERATIONS

### 10.1 API Key Protection

```typescript
// ❌ WRONG: Never expose API key
const apiKey = process.env.ANTHROPIC_API_KEY;
// Send to frontend: ❌ WRONG

// ✓ RIGHT: Keep key server-side only
// Backend API routes access it via environment
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```

### 10.2 Request Validation

```typescript
// Validate request size to prevent abuse
const MAX_MESSAGE_LENGTH = 10000;
const MAX_CODE_LENGTH = 50000;

if (message.length > MAX_MESSAGE_LENGTH) {
  return NextResponse.json(
    { error: "Message too long" },
    { status: 400 }
  );
}

if (currentCode.length > MAX_CODE_LENGTH) {
  return NextResponse.json(
    { error: "Code too long" },
    { status: 400 }
  );
}
```

### 10.3 Audit Logging

```typescript
await prisma.auditLog.create({
  data: {
    userId: session.user.id,
    action: "claude_api_call",
    details: {
      messageLength: message.length,
      model: process.env.ANTHROPIC_MODEL,
      cost: estimatedCost,
      timestamp: new Date().toISOString()
    }
  }
});
```

---

## SECTION 11: TESTING STRATEGY

### Unit Tests

```typescript
// lib/ai/prompt-builder.test.ts
describe("buildSystemPrompt", () => {
  it("includes problem title", () => {
    const prompt = buildSystemPrompt({
      problemTitle: "Two Sum",
      difficulty: "MEDIUM",
      language: "typescript",
      currentCode: "function twoSum() {}"
    });
    
    expect(prompt).toContain("Two Sum");
  });
});
```

### Integration Tests

```typescript
// __tests__/api/interview/chat.test.ts
describe("POST /api/interview/[id]/chat", () => {
  it("streams Claude response", async () => {
    const response = await fetch("/api/interview/test-id/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Help me debug" })
    });
    
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });
});
```

---

## SECTION 12: MIGRATION FROM MOCK TO REAL API

### Update AIChat Component

```typescript
// Before: Mock responses
const handleSendMessage = (message: string) => {
  setTimeout(() => {
    let responseContent = "";
    if (message.includes("approach")) {
      responseContent = "Great question!...";
    }
    // ...
  }, 1500);
};

// After: Real API with streaming
const handleSendMessage = async (message: string) => {
  const response = await fetch(`/api/interview/${sessionId}/chat`, {
    method: "POST",
    body: JSON.stringify({
      message,
      currentCode: code,
      language: "typescript"
    })
  });
  
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const text = decoder.decode(value);
    // Update UI with streamed text
  }
};
```

---

## CONCLUSION

**Summary of Requirements:**

1. **Install SDK:** `npm install @anthropic-ai/sdk`
2. **Create Backend Routes:** 3-4 API endpoints (chat, code application, command execution)
3. **Database Schema:** Add Message and InterviewSession models
4. **Environment Setup:** Add ANTHROPIC_API_KEY
5. **Frontend Integration:** Update AIChat component for streaming
6. **Testing:** Unit and integration tests

**Estimated Effort:**
- Phase 1 (Core): 1-2 weeks
- Phase 2 (Advanced): 1-2 weeks  
- Phase 3 (Optimization): 1 week
- **Total: 3-5 weeks** for full implementation

**Expected Outcomes:**
- Real-time AI coding assistance identical to Claude Code CLI
- 74%+ profit margin per assessment
- Production-ready architecture supporting thousands of concurrent sessions
- Full audit trail and cost tracking


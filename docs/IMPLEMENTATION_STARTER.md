# Claude SDK Integration - Implementation Starter

This guide provides concrete code examples to begin integrating Claude into InterviewLM.

## Step 1: Install Dependencies

```bash
npm install @anthropic-ai/sdk
npm install --save-dev @types/node
```

Update `package.json` to verify:
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.28.0"
  }
}
```

## Step 2: Create Core Integration Module

File: `lib/ai/claude-integration.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";

// Initialize Anthropic client (singleton)
export const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 60000, // 60 seconds for streaming
  maxRetries: 2
});

// Model configuration for cost calculation
export const MODEL_CONFIG = {
  "claude-opus-4-1": {
    inputCostPer1M: 15,
    outputCostPer1M: 75,
    contextWindow: 200000
  },
  "claude-sonnet-4-5": {
    inputCostPer1M: 3,
    outputCostPer1M: 15,
    contextWindow: 200000
  },
  "claude-haiku-3-5": {
    inputCostPer1M: 0.80,
    outputCostPer1M: 4,
    contextWindow: 200000
  }
};

// Simple token estimation (1 token ≈ 4 characters)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Get the configured model
export function getModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
}

// Get model configuration
export function getModelConfig() {
  const model = getModel();
  return MODEL_CONFIG[model as keyof typeof MODEL_CONFIG];
}
```

## Step 3: Create Prompt Builder

File: `lib/ai/prompt-builder.ts`

```typescript
export interface PromptContext {
  problemTitle: string;
  problemDescription: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  language: string;
  currentCode: string;
  testOutput?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export function buildSystemPrompt(context: PromptContext): string {
  return `You are Claude, an expert coding assistant helping a candidate during a technical interview.

## Problem Details
- **Title:** ${context.problemTitle}
- **Difficulty:** ${context.difficulty}
- **Language:** ${context.language}

## Your Role
1. Help the candidate understand the problem
2. Suggest approaches and algorithms
3. Review and debug their code
4. Provide hints (not complete solutions)
5. Encourage best practices

## Current Code
\`\`\`${context.language}
${context.currentCode || "// No code yet"}
\`\`\`

${context.testOutput ? `## Latest Test Output\n\`\`\`\n${context.testOutput}\n\`\`\`` : ""}

## Important Guidelines
- Be encouraging and supportive
- Explain your reasoning clearly
- Don't provide complete solutions - guide them to discover
- Flag edge cases to consider
- Be honest about what works and what doesn't`;
}

export function buildUserMessage(userInput: string): string {
  return userInput;
}

export function formatMessageHistory(
  messages: Array<{ role: string; content: string }>,
  maxMessages: number = 10
) {
  // Keep last N messages to manage context window
  return messages.slice(-maxMessages).map(msg => ({
    role: msg.role as "user" | "assistant",
    content: msg.content
  }));
}
```

## Step 4: Create Basic Chat API Route

File: `app/api/interview/[id]/chat/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { anthropicClient, getModel } from "@/lib/ai/claude-integration";
import { buildSystemPrompt, buildUserMessage, formatMessageHistory } from "@/lib/ai/prompt-builder";

interface ChatRequest {
  message: string;
  currentCode: string;
  language: string;
  testOutput?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  problemTitle?: string;
  problemDescription?: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate user
    const session = await requireAuth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request
    const {
      message,
      currentCode,
      language,
      testOutput,
      conversationHistory = [],
      problemTitle = "Coding Challenge",
      problemDescription = "",
      difficulty = "MEDIUM"
    }: ChatRequest = await request.json();

    // 3. Validate input
    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 }
      );
    }

    // 4. Build prompt context
    const systemPrompt = buildSystemPrompt({
      problemTitle,
      problemDescription,
      difficulty,
      language,
      currentCode,
      testOutput,
      conversationHistory
    });

    const userMessage = buildUserMessage(message);

    // 5. Format message history for Claude
    const formattedHistory = formatMessageHistory(conversationHistory);

    // 6. Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Call Claude API with streaming
          const claudeStream = await anthropicClient.messages.stream({
            model: getModel(),
            max_tokens: 2048,
            temperature: 0.7,
            system: systemPrompt,
            messages: [
              ...formattedHistory,
              { role: "user", content: userMessage }
            ]
          });

          let totalTokens = 0;
          let assistantResponse = "";

          // Stream text content
          for await (const chunk of claudeStream) {
            if (chunk.type === "content_block_delta" && 
                chunk.delta?.type === "text_delta") {
              const text = chunk.delta.text;
              assistantResponse += text;

              // Send text chunk to client
              const data = {
                type: "text",
                content: text
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
              );
            }

            if (chunk.type === "message_delta" && chunk.usage) {
              totalTokens = chunk.usage.output_tokens || 0;
            }
          }

          // Get final message for token counts
          const finalMessage = await claudeStream.finalMessage();

          // Send completion signal
          const completionData = {
            type: "done",
            stopReason: finalMessage.stop_reason,
            usage: finalMessage.usage
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(completionData)}\n\n`)
          );

          controller.close();
        } catch (error) {
          console.error("Claude API Error:", error);
          controller.error(error);
        }
      }
    });

    // 7. Return SSE response
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    console.error("Chat endpoint error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
```

## Step 5: Update Environment Variables

Update `.env.example`:

```env
# Anthropic API Configuration
ANTHROPIC_API_KEY="sk-ant-v1-your-api-key-here"
ANTHROPIC_MODEL="claude-sonnet-4-5"
```

Create `.env.local` (never commit):

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"
ANTHROPIC_API_KEY="sk-ant-v1-xxx"
ANTHROPIC_MODEL="claude-sonnet-4-5"
```

## Step 6: Update AIChat Component for Streaming

Modify `components/interview/AIChat.tsx`:

```typescript
// Add this to the handleSendMessage function:
const handleSendMessage = async (message: string) => {
  const userMessage: Message = {
    id: Date.now().toString(),
    role: "user",
    content: message,
    timestamp: new Date()
  };

  setMessages(prev => [...prev, userMessage]);
  setInput("");
  setIsLoading(true);

  try {
    const response = await fetch("/api/interview/[sessionId]/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        currentCode: code,
        language: "typescript",
        testOutput: terminalOutput || "",
        conversationHistory: messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      })
    });

    if (!response.ok) {
      throw new Error("Failed to send message");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let assistantContent = "";
    let assistantId: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "text") {
              assistantContent += data.content;

              // Update or create assistant message
              setMessages(prev => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];

                if (lastMsg?.role === "assistant") {
                  lastMsg.content = assistantContent;
                  if (!assistantId) assistantId = lastMsg.id;
                } else {
                  assistantId = (Date.now() + 1).toString();
                  updated.push({
                    id: assistantId,
                    role: "assistant",
                    content: assistantContent,
                    timestamp: new Date()
                  });
                }
                return updated;
              });
            } else if (data.type === "done") {
              console.log("Response complete:", data);
            }
          } catch (e) {
            // Skip parse errors
          }
        }
      }
    }
  } catch (error) {
    console.error("Error:", error);
    // Show error message to user
    setMessages(prev => [...prev, {
      id: (Date.now() + 2).toString(),
      role: "assistant",
      content: "Sorry, I encountered an error. Please try again.",
      timestamp: new Date()
    }]);
  } finally {
    setIsLoading(false);
  }
};
```

## Step 7: Test the Integration

### 1. Local Testing

```bash
# Start dev server
npm run dev

# Test with curl
curl -X POST http://localhost:3000/api/interview/test-id/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How do I approach this problem?",
    "currentCode": "function solution() {}",
    "language": "typescript",
    "problemTitle": "Two Sum"
  }'
```

### 2. Add Unit Test

File: `__tests__/api/interview/chat.test.ts`

```typescript
describe("POST /api/interview/[id]/chat", () => {
  it("returns streaming response for valid message", async () => {
    const response = await fetch(
      "http://localhost:3000/api/interview/test-id/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Help me debug",
          currentCode: "function test() {}",
          language: "typescript"
        })
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });
});
```

## Step 8: Database Schema Update

Add to `prisma/schema.prisma`:

```prisma
model Message {
  id        String   @id @default(cuid())
  sessionId String   @map("session_id")
  role      String   // "user" | "assistant"
  content   String   @db.Text
  tokens    Int?
  timestamp DateTime @default(now())

  @@index([sessionId])
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

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([sessionId])
  @@index([timestamp])
  @@map("token_usages")
}
```

Then run:
```bash
npx prisma migrate dev --name add_message_and_token_usage
```

## Next: Advanced Features

Once basic integration works:

1. **Token Tracking** - Log token usage per request
2. **Code Application** - Let Claude suggest code changes
3. **Terminal Integration** - Stream command output
4. **Prompt Caching** - Cache common problem contexts
5. **Model Selection** - Use smaller models for hints

See `CLAUDE_SDK_QUICK_REFERENCE.md` for implementation roadmap.

## Troubleshooting

### "Invalid API Key"
- Verify ANTHROPIC_API_KEY in `.env.local`
- Check key starts with `sk-ant-v1-`
- Regenerate key at console.anthropic.com

### "Streaming not working"
- Ensure response headers include `Content-Type: text/event-stream`
- Check browser console for SSE errors
- Verify `ReadableStream` is supported

### "Rate Limited"
- Add exponential backoff retry logic
- Implement per-user rate limiting with Redis
- See error-handler patterns in main guide

### "Large context errors"
- Limit conversation history to last 10 messages
- Prune old messages when context window gets large
- Implement token counting to track sizes


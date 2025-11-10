# File Structure for Claude SDK Integration

This document shows where to create new files for the integration.

## New Files to Create

```
interviewlm-cs/
├── lib/
│   └── ai/                              (NEW DIRECTORY)
│       ├── claude-integration.ts        (Initialize Anthropic client)
│       ├── prompt-builder.ts            (Build prompts with context)
│       ├── error-handler.ts             (Retry logic & fallbacks)
│       └── token-counter.ts             (Token estimation & tracking)
│
├── app/
│   └── api/
│       └── interview/
│           └── [id]/
│               ├── chat/
│               │   └── route.ts         (Main streaming endpoint)
│               ├── apply-code/
│               │   └── route.ts         (Apply code suggestions)
│               └── execute-command/
│                   └── route.ts         (Run terminal commands)
│
├── __tests__/
│   └── api/
│       └── interview/
│           ├── chat.test.ts            (Test streaming responses)
│           ├── apply-code.test.ts      (Test code application)
│           └── execute-command.test.ts (Test command execution)
│
└── docs/
    ├── CLAUDE_SDK_INTEGRATION_GUIDE.md      (Comprehensive guide)
    ├── CLAUDE_SDK_QUICK_REFERENCE.md        (Quick reference)
    └── IMPLEMENTATION_STARTER.md            (Code examples)
```

## Files to Modify

```
interviewlm-cs/
├── .env.example
│   └── Add ANTHROPIC_API_KEY and ANTHROPIC_MODEL
│
├── .env.local                           (Create new)
│   └── Add ANTHROPIC_API_KEY="sk-ant-v1-..."
│
├── package.json
│   └── Add "@anthropic-ai/sdk": "^0.28.0"
│
├── components/interview/AIChat.tsx
│   └── Update handleSendMessage() for real API
│
└── prisma/schema.prisma
    └── Add Message and TokenUsage models
```

## Phase-by-Phase Implementation

### Phase 1: Foundation (1-2 weeks)

Create these files first:

```
✓ lib/ai/claude-integration.ts
✓ lib/ai/prompt-builder.ts
✓ app/api/interview/[id]/chat/route.ts
✓ Update package.json & .env.example
✓ Update components/interview/AIChat.tsx
✓ Update prisma/schema.prisma
```

### Phase 2: Core Features (1-2 weeks)

Add these files:

```
✓ lib/ai/error-handler.ts
✓ lib/ai/token-counter.ts
✓ app/api/interview/[id]/apply-code/route.ts
✓ __tests__/api/interview/chat.test.ts
```

### Phase 3: Advanced (1-2 weeks)

Extend with:

```
✓ app/api/interview/[id]/execute-command/route.ts
✓ lib/ai/prompt-caching.ts
✓ lib/ai/model-selector.ts
✓ Additional tests
```

## Directory Tree View

Complete file structure with line counts (Phase 1 only):

```
lib/ai/
├── claude-integration.ts        150 lines  - Client init, config
├── prompt-builder.ts            200 lines  - Prompt construction
└── (Phase 2 additions)
    ├── error-handler.ts         150 lines  - Retry & fallback
    └── token-counter.ts         100 lines  - Token tracking

app/api/interview/[id]/
├── chat/
│   └── route.ts                 250 lines  - Main streaming endpoint
└── (Phase 2 additions)
    ├── apply-code/
    │   └── route.ts             180 lines  - Apply suggestions
    └── execute-command/
        └── route.ts             200 lines  - Terminal commands

__tests__/api/interview/
├── chat.test.ts                 100 lines  - Chat endpoint tests
├── apply-code.test.ts           100 lines  - Code app tests
└── execute-command.test.ts      100 lines  - Command tests
```

## Key Dependencies

### package.json additions

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.28.0"
  },
  "devDependencies": {
    "@types/node": "^20"
  }
}
```

### Environment Variables

Minimum required:
```env
ANTHROPIC_API_KEY=sk-ant-v1-...
ANTHROPIC_MODEL=claude-sonnet-4-5
```

Optional:
```env
ANTHROPIC_MAX_REQUESTS_PER_MINUTE=60
ANTHROPIC_MAX_TOKENS_PER_REQUEST=4096
CLAUDE_ENABLE_PROMPT_CACHING=true
```

## Testing Structure

```
__tests__/
├── api/
│   └── interview/
│       ├── chat.test.ts
│       ├── apply-code.test.ts
│       └── execute-command.test.ts
└── lib/
    └── ai/
        ├── prompt-builder.test.ts
        ├── token-counter.test.ts
        └── error-handler.test.ts
```

## Database Migrations

After updating `prisma/schema.prisma`:

```bash
# Create migration
npx prisma migrate dev --name add_message_and_token_usage

# Run migration
npx prisma migrate deploy

# View schema
npx prisma studio
```

## Git Workflow

### Commit Phases

**Phase 1:**
```
feat: Add Claude SDK integration (chat streaming)
  - Add @anthropic-ai/sdk dependency
  - Create lib/ai/claude-integration.ts
  - Create lib/ai/prompt-builder.ts
  - Create app/api/interview/[id]/chat/route.ts
  - Update AIChat component for real API
  - Add Message schema to Prisma
```

**Phase 2:**
```
feat: Add advanced Claude features (code & commands)
  - Add code suggestion application endpoint
  - Add terminal command execution
  - Add token usage tracking
  - Add error handling & retries
```

**Phase 3:**
```
perf: Optimize Claude integration
  - Add prompt caching
  - Add model selection heuristics
  - Add cost monitoring
```

## Quick Navigation

- **Full Technical Guide:** `/docs/CLAUDE_SDK_INTEGRATION_GUIDE.md`
- **Quick Reference:** `/docs/CLAUDE_SDK_QUICK_REFERENCE.md`
- **Code Examples:** `/docs/IMPLEMENTATION_STARTER.md`
- **This File:** `/docs/FILE_STRUCTURE.md`


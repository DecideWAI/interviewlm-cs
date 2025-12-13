# LangGraph Agents for InterviewLM

Production-ready multi-agent system built with LangGraph v1.0 for AI-powered technical interviews.

## Overview

This module reimplements the InterviewLM agent system using [LangGraph](https://www.langchain.com/langgraph) - a Python framework for building stateful, multi-actor LLM applications.

### Agents

| Agent | Purpose | Original (TypeScript) |
|-------|---------|----------------------|
| **Coding Agent** | Helps candidates with coding tasks | `lib/agents/coding-agent.ts` |
| **Interview Agent** | Tracks metrics, adapts difficulty (hidden) | `workers/interview-agent.ts` |
| **Evaluation Agent** | Evaluates sessions with evidence-based scoring | `workers/evaluation-agent.ts` |
| **Supervisor** | Coordinates multi-agent workflows | New |

## Quick Start

### Using LangGraph SDK (Recommended)

```bash
# Navigate to the directory
cd langgraph-agents

# Copy environment file and configure
cp .env.example .env
# Edit .env with your API keys

# Start LangGraph dev server (port 2024)
langgraph dev

# The Next.js app connects via @langchain/langgraph-sdk
```

### Manual Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run the LangGraph server
langgraph dev
```

## Architecture

### Services

| Service | Port | Purpose |
|---------|------|---------|
| LangGraph SDK Server | 2024 | LangGraph SDK server for agent operations |
| PostgreSQL | 5432 | Shared database with Next.js app |
| Redis | 6379 | Session caching and metrics |

### LangGraph v1.0 Features Used

- **StateGraph**: Type-safe state management with TypedDict
- **Parallel Execution**: Evaluation dimensions run concurrently
- **Checkpointing**: State persistence with MemorySaver
- **ToolNode**: Automated tool execution handling
- **Conditional Edges**: Dynamic routing based on state

### Agent Flow Diagrams

#### Coding Agent (ReAct Pattern)
```
START → agent → tools? → tools → agent → ... → END
              ↑___________|
```

#### Evaluation Agent (Parallel)
```
START → ┌─ code_quality ────┐
        ├─ problem_solving ─┼→ aggregate → END
        ├─ ai_collaboration ┤
        └─ communication ───┘
```

#### Supervisor (Hierarchical)
```
START → supervisor → coding ─────┐
                   → interview ──┼→ supervisor → END
                   → evaluation ─┘
```

## LangGraph SDK Integration

The agents are exposed via the LangGraph SDK standard API. The Next.js app uses `@langchain/langgraph-sdk` to communicate with the agents.

### Available Graphs

| Graph Name | Description | Used By |
|------------|-------------|---------|
| `coding_agent` | Helps candidates with coding tasks | `/api/interview/[id]/chat/agent/stream` |
| `question_evaluation_agent` | Evaluates candidate solutions | `/api/interview/[id]/evaluate` |
| `interview_agent` | Tracks metrics and adapts difficulty | Background processing |

### TypeScript SDK Usage

```typescript
import { Client } from "@langchain/langgraph-sdk";

const client = new Client({ apiUrl: "http://localhost:2024" });

// Stream agent responses
const stream = client.runs.stream(threadId, "coding_agent", {
  input: { messages: [{ role: "user", content: "Help me fix this bug" }] },
  streamMode: "events",
});

// Wait for completion
const result = await client.runs.wait(threadId, "question_evaluation_agent", {
  input: { /* evaluation state */ },
});
```

## Configuration

### Required Environment Variables

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-api03-...

# Modal Service URLs (for file/code operations)
MODAL_EXECUTE_URL=https://your-modal-app.modal.run/execute
MODAL_WRITE_FILE_URL=https://your-modal-app.modal.run/write-file
MODAL_READ_FILE_URL=https://your-modal-app.modal.run/read-file
MODAL_LIST_FILES_URL=https://your-modal-app.modal.run/list-files
MODAL_EXECUTE_COMMAND_URL=https://your-modal-app.modal.run/execute-command
```

### Model Configuration

```bash
CODING_AGENT_MODEL=claude-sonnet-4-20250514
EVALUATION_AGENT_MODEL=claude-sonnet-4-20250514
INTERVIEW_AGENT_MODEL=claude-haiku-4-5-20251001
```

### Infrastructure

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/interviewlm
REDIS_URL=redis://localhost:6379
```

### LangSmith Observability

```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_pt_...
LANGCHAIN_PROJECT=interviewlm-agents
```

### Helpfulness Levels

| Level | Description | Tools Available |
|-------|-------------|-----------------|
| `consultant` | Guidance without writing code | read, grep, glob, list |
| `pair-programming` | Collaborative coding | All tools |
| `full-copilot` | Maximum assistance | All tools |

## SDK Usage

### Coding Agent

```python
from agents import create_coding_agent

agent = create_coding_agent(
    session_id="session-001",
    candidate_id="candidate-001",
    helpfulness_level="pair-programming",
    problem_statement="Implement a binary search function.",
)

# Send message and get response
response = await agent.send_message("Help me debug this function")
# Returns: {"text": "...", "tools_used": [...], "files_modified": [...]}

# Load conversation history
await agent.load_conversation_history([
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."},
])
```

### Interview Agent

```python
from agents import create_interview_agent

agent = create_interview_agent()

# Process interview events (hidden from candidates)
metrics = await agent.process_event(
    session_id="...",
    candidate_id="...",
    event_type="ai-interaction",  # or: code-changed, test-run, question-answered
    event_data={...},
)
# Returns: InterviewMetrics with IRT theta, struggling indicators, etc.
```

### Evaluation Agent

```python
from agents import create_evaluation_agent

agent = create_evaluation_agent()

# Evaluate a completed session
result = await agent.evaluate_session(
    session_id="...",
    candidate_id="...",
    code_snapshots=[...],
    test_results=[...],
    claude_interactions=[...],
)
# Returns: EvaluationResult with scores for all 4 dimensions
```

### Database Service

```python
from services import get_database

db = await get_database()

# Get full session data for evaluation
session_data = await db.get_full_session_data(session_id)

# Save evaluation result
await db.save_evaluation(candidate_id, session_id, evaluation_result)

# Update candidate scores
await db.update_candidate_scores(candidate_id, overall_score)
```

### Cache Service

```python
from services import get_cache

cache = await get_cache()

# Cache interview metrics (hot path)
await cache.set_metrics(session_id, metrics)
metrics = await cache.get_metrics(session_id)

# Distributed locking
if await cache.acquire_lock(f"eval:{session_id}"):
    try:
        # Do evaluation
        pass
    finally:
        await cache.release_lock(f"eval:{session_id}")
```

## Testing

```bash
# Run tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html

# Run specific test file
pytest tests/test_coding_tools.py -v
```

## Deployment

### Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f agents

# Stop services
docker-compose down

# Rebuild after changes
docker-compose up -d --build
```

### Production Considerations

1. **Environment Variables**: Use secrets management (AWS Secrets Manager, HashiCorp Vault)
2. **Database**: Use managed PostgreSQL (AWS RDS, Supabase)
3. **Redis**: Use managed Redis (AWS ElastiCache, Upstash)
4. **Scaling**: Run multiple API workers (`--workers 4`)
5. **Monitoring**: Enable LangSmith tracing (`LANGCHAIN_TRACING_V2=true`)

### Health Monitoring

```bash
# Check API health
curl http://localhost:8000/health

# Check Redis health
redis-cli ping

# Check PostgreSQL health
pg_isready -h localhost -p 5432
```

## Key Differences from TypeScript Implementation

| Aspect | TypeScript (Original) | Python (LangGraph) |
|--------|----------------------|-------------------|
| Framework | Custom + BullMQ | LangGraph v1.0 |
| State Management | Manual | TypedDict + Checkpointer |
| Tool Execution | Manual loop | ToolNode + tools_condition |
| Parallel Execution | Promise.all | StateGraph parallel edges |
| Message History | Array manipulation | add_messages reducer |
| Database | Prisma | asyncpg |
| Caching | Custom | Redis async |

## Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangGraph v1.0 Announcement](https://blog.langchain.com/langchain-langgraph-1dot0/)
- [Multi-Agent Tutorial](https://langchain-ai.github.io/langgraph/tutorials/multi_agent/multi-agent-collaboration/)
- [LangSmith Documentation](https://docs.smith.langchain.com/)

## License

Part of the InterviewLM project.

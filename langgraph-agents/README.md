# LangGraph Agents for InterviewLM

Multi-agent system built with LangGraph v1.0 for AI-powered technical interviews.

## Overview

This module reimplements the InterviewLM agent system using [LangGraph](https://www.langchain.com/langgraph) - a Python framework for building stateful, multi-actor LLM applications.

### Agents

| Agent | Purpose | Original (TypeScript) |
|-------|---------|----------------------|
| **Coding Agent** | Helps candidates with coding tasks | `lib/agents/coding-agent.ts` |
| **Interview Agent** | Tracks metrics, adapts difficulty (hidden) | `workers/interview-agent.ts` |
| **Evaluation Agent** | Evaluates sessions with evidence-based scoring | `workers/evaluation-agent.ts` |
| **Supervisor** | Coordinates multi-agent workflows | New |

## Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
```

## Quick Start

```python
import asyncio
from agents import create_coding_agent, create_evaluation_agent

# Create a Coding Agent
async def main():
    agent = create_coding_agent(
        session_id="session-001",
        candidate_id="candidate-001",
        helpfulness_level="pair-programming",
        problem_statement="Implement a binary search function.",
    )

    response = await agent.send_message("How should I approach this problem?")
    print(response["text"])

asyncio.run(main())
```

## Architecture

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

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Model Configuration
CODING_AGENT_MODEL=claude-sonnet-4-20250514
EVALUATION_AGENT_MODEL=claude-sonnet-4-20250514
INTERVIEW_AGENT_MODEL=claude-3-5-haiku-20241022

# Agent Settings
MAX_AGENT_ITERATIONS=25
TOOL_TIMEOUT_SECONDS=30
DEFAULT_HELPFULNESS_LEVEL=pair-programming

# Optional: Observability
ENABLE_OBSERVABILITY=false
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
```

### Helpfulness Levels

| Level | Description | Tools Available |
|-------|-------------|-----------------|
| `consultant` | Guidance without writing code | read, grep, glob, list |
| `pair-programming` | Collaborative coding | All tools |
| `full-copilot` | Maximum assistance | All tools |

## API Reference

### Coding Agent

```python
from agents import create_coding_agent

agent = create_coding_agent(
    session_id: str,           # Required: Session identifier
    candidate_id: str,         # Required: Candidate identifier
    helpfulness_level: str,    # Optional: consultant/pair-programming/full-copilot
    problem_statement: str,    # Optional: Current problem description
    workspace_root: str,       # Optional: Root directory (default: /workspace)
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

### Supervisor

```python
from agents import create_supervisor

supervisor = create_supervisor()

# Run a multi-agent workflow
result = await supervisor.run_workflow(
    task="Help with coding and track metrics",
    session_id="...",
    candidate_id="...",
)
```

## Testing

```bash
# Run tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html
```

## Deployment

### As a Standalone Service

```bash
# Run the demo
python main.py

# Or use with uvicorn for a FastAPI wrapper
uvicorn api:app --host 0.0.0.0 --port 8000
```

### With Modal

See the main project's Modal deployment configuration.

### With Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "main.py"]
```

## Key Differences from TypeScript Implementation

| Aspect | TypeScript (Original) | Python (LangGraph) |
|--------|----------------------|-------------------|
| Framework | Custom + BullMQ | LangGraph v1.0 |
| State Management | Manual | TypedDict + Checkpointer |
| Tool Execution | Manual loop | ToolNode + tools_condition |
| Parallel Execution | Promise.all | StateGraph parallel edges |
| Message History | Array manipulation | add_messages reducer |

## Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangGraph v1.0 Announcement](https://blog.langchain.com/langchain-langgraph-1dot0/)
- [Multi-Agent Tutorial](https://langchain-ai.github.io/langgraph/tutorials/multi_agent/multi-agent-collaboration/)
- [LangGraph Supervisor](https://github.com/langchain-ai/langgraph-supervisor-py)

## License

Part of the InterviewLM project.

# Claude Agent SDK: Comprehensive Technical Research Report

**Research Date:** November 13, 2025
**Focus Area:** Multi-Agent Systems with Specialized Tool Access Levels

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [SDK Architecture Overview](#sdk-architecture-overview)
3. [Installation & Setup](#installation--setup)
4. [Custom Tools Implementation](#custom-tools-implementation)
5. [Permission & Access Control Systems](#permission--access-control-systems)
6. [Multi-Agent Coordination Patterns](#multi-agent-coordination-patterns)
7. [Session Management & Context Isolation](#session-management--context-isolation)
8. [Cost Optimization Strategies](#cost-optimization-strategies)
9. [Code Examples & Implementation Patterns](#code-examples--implementation-patterns)
10. [Best Practices & Recommendations](#best-practices--recommendations)
11. [Resources & References](#resources--references)

---

## Executive Summary

The Claude Agent SDK (formerly Claude Code SDK) is Anthropic's official framework for building autonomous AI agents with Claude Code capabilities. Released alongside Claude Sonnet 4.5, the SDK enables programmatic interaction with Claude's code understanding, file editing, command execution, and complex workflow orchestration capabilities.

**Key Capabilities:**
- Build custom AI agents with specialized tool access
- Implement multi-agent systems with isolated contexts
- Create custom tools and MCP (Model Context Protocol) integrations
- Fine-grained permission control and security
- Support for both Python and TypeScript/JavaScript
- Enterprise-grade session management and context handling

**Use Cases:**
- Automated code review and refactoring agents
- Data processing and analysis pipelines
- Multi-step research and documentation systems
- Specialized development task automation
- Enterprise workflow orchestration

---

## SDK Architecture Overview

### Core Architectural Pattern

The Claude Agent SDK implements a **feedback loop architecture** consisting of four key phases:

```
┌─────────────────┐
│ Gather Context  │ ← Agents fetch and manage information needs
└────────┬────────┘
         ↓
┌─────────────────┐
│  Take Action    │ ← Execute tasks using available tools
└────────┬────────┘
         ↓
┌─────────────────┐
│  Verify Work    │ ← Evaluate and improve output
└────────┬────────┘
         ↓
┌─────────────────┐
│    Iterate      │ ← Continuous refinement based on verification
└────────┬────────┘
         │
         └──────────┘ (Loop back to Gather Context)
```

### Technical Components

#### 1. Context Management
- **Agentic Search**: Bash commands (`grep`, `tail`) for intelligent file system search
- **Semantic Search**: Vector-based retrieval (faster but less accurate)
- **Subagents**: Isolated context windows for parallel task execution
- **Compaction**: Automatic message summarization when approaching context limits
- **CLAUDE.md Files**: Persistent project-specific memory across sessions

#### 2. Execution Layer
- **Tools**: Primary building blocks appearing prominently in model's context
- **Bash/Scripts**: Flexible computer-based operations
- **Code Generation**: Precise, composable outputs for complex operations
- **MCPs (Model Context Protocol)**: Standardized external service integrations

#### 3. Verification Strategies
- **Rule-based Feedback**: Code linting for multi-layered validation
- **Visual Feedback**: Screenshots for iterative UI refinement
- **LLM-as-Judge**: Secondary model evaluation for fuzzy criteria

### SDK Structure

```
Claude Agent SDK
├── Core Client
│   ├── query() - Simple one-shot queries
│   └── ClaudeSDKClient - Interactive bidirectional conversations
├── Tool System
│   ├── Built-in Tools (Read, Write, Bash, etc.)
│   ├── Custom Tools (In-process MCP servers)
│   └── External MCP Servers
├── Permission System
│   ├── Permission Modes (auto/ask/deny)
│   ├── canUseTool Callback
│   ├── Permission Rules
│   └── Hooks (PreToolUse/PostToolUse)
└── Session Management
    ├── Session Resumption
    ├── Session Forking
    └── Context Isolation
```

---

## Installation & Setup

### Python Installation

**Requirements:**
- Python 3.10+
- Node.js (for Claude Code CLI)
- Claude Code 2.0.0+

**Installation:**
```bash
# Install the SDK
pip install claude-agent-sdk

# Install Claude Code CLI globally
npm install -g @anthropic-ai/claude-code
```

**Basic Usage:**
```python
from claude_agent_sdk import query, ClaudeAgentOptions

# Simple query
async for message in query(prompt="What is 2 + 2?"):
    print(message)

# With configuration
options = ClaudeAgentOptions(
    allowed_tools=["Read", "Write", "Bash"],
    cwd="/path/to/project",
    model="claude-sonnet-4-5-20250929"
)

async for message in query(
    prompt="Analyze this codebase",
    options=options
):
    print(message)
```

### TypeScript/JavaScript Installation

**Requirements:**
- Node.js 18+

**Installation:**
```bash
npm install @anthropic-ai/claude-agent-sdk
```

**Basic Usage:**
```typescript
import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk';

const options: ClaudeAgentOptions = {
  allowedTools: ['Read', 'Write', 'Bash'],
  cwd: '/path/to/project',
  model: 'claude-sonnet-4-5-20250929'
};

for await (const message of query({
  prompt: 'Analyze this codebase',
  options
})) {
  console.log(message);
}
```

---

## Custom Tools Implementation

Custom tools extend Claude Code's capabilities through **in-process MCP servers**, enabling interaction with external services and APIs. Tools run directly within your application, eliminating subprocess overhead.

### Python Implementation

#### Tool Definition with @tool Decorator

```python
from claude_agent_sdk import tool, create_sdk_mcp_server, ClaudeAgentOptions, ClaudeSDKClient

@tool("greet", "Greet a user by name", {"name": str})
async def greet_user(args):
    """Simple greeting tool"""
    return {
        "content": [
            {"type": "text", "text": f"Hello, {args['name']}!"}
        ]
    }

@tool(
    "search_products",
    "Search for products in the database",
    {
        "query": str,
        "category": str,
        "max_results": int
    }
)
async def search_products(args):
    """Complex tool with multiple parameters"""
    query = args["query"]
    category = args["category"]
    max_results = args.get("max_results", 10)

    # Perform search logic here
    results = await database.search(query, category, limit=max_results)

    return {
        "content": [
            {
                "type": "text",
                "text": f"Found {len(results)} products matching '{query}' in {category}"
            }
        ]
    }
```

#### Creating MCP Server

```python
# Create an SDK MCP server with custom tools
custom_tools_server = create_sdk_mcp_server(
    name="custom-tools",
    version="1.0.0",
    tools=[greet_user, search_products]
)

# Configure agent with custom tools
options = ClaudeAgentOptions(
    mcp_servers={"custom": custom_tools_server},
    allowed_tools=[
        "Read",
        "Write",
        "mcp__custom__greet",
        "mcp__custom__search_products"
    ]
)

# Use with ClaudeSDKClient
async with ClaudeSDKClient(options) as client:
    async for message in client.query("Search for laptops in electronics"):
        print(message)
```

### TypeScript Implementation

#### Tool Definition with Zod Schemas

```typescript
import { tool, createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// Simple tool
const greetTool = tool(
  'greet',
  'Greet a user by name',
  {
    name: z.string().describe('The name of the user to greet')
  },
  async (args) => {
    return {
      content: [
        { type: 'text', text: `Hello, ${args.name}!` }
      ]
    };
  }
);

// Complex tool with nested schemas
const processDataTool = tool(
  'process_data',
  'Process structured data with type safety',
  {
    data: z.object({
      name: z.string(),
      age: z.number().min(0).max(150),
      email: z.string().email(),
      preferences: z.array(z.string()).optional()
    }),
    format: z.enum(['json', 'csv', 'xml']).default('json'),
    includeMetadata: z.boolean().default(false)
  },
  async (args) => {
    // args is fully typed based on the schema
    console.log(`Processing ${args.data.name}'s data as ${args.format}`);

    const result = {
      processed: true,
      format: args.format,
      user: args.data.name
    };

    return {
      content: [
        { type: 'text', text: JSON.stringify(result, null, 2) }
      ]
    };
  }
);
```

#### Creating MCP Server

```typescript
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

// Create MCP server
const customToolsServer = createSdkMcpServer({
  name: 'custom-tools',
  version: '1.0.0',
  tools: [greetTool, processDataTool]
});

// Use with query
const options = {
  mcpServers: {
    custom: customToolsServer
  },
  allowedTools: [
    'Read',
    'Write',
    'mcp__custom__greet',
    'mcp__custom__process_data'
  ]
};

for await (const message of query({
  prompt: 'Process user data for john@example.com',
  options
})) {
  console.log(message);
}
```

### Tool Design Best Practices

1. **Prominent Tools Get Used**: Tools appear in the model's context window and influence decision-making. Design them around your agent's most frequent actions.

2. **Clear Descriptions**: Tool descriptions should clearly explain what the tool does and when to use it.

3. **Type Safety**: Use Zod (TypeScript) or type hints (Python) for parameter validation.

4. **Error Handling**: Return descriptive error messages in tool responses.

5. **Composability**: Design tools to work together in workflows.

Example of a well-designed tool:
```typescript
const analyzeCodeTool = tool(
  'analyze_code',
  'Analyze code quality and suggest improvements. Use this when asked to review code, find bugs, or improve code quality.',
  {
    filePath: z.string().describe('Path to the file to analyze'),
    checkTypes: z.array(z.enum(['security', 'performance', 'style', 'bugs'])).describe('Types of checks to perform'),
    severity: z.enum(['low', 'medium', 'high']).default('medium').describe('Minimum severity level to report')
  },
  async (args) => {
    // Tool implementation
  }
);
```

---

## Permission & Access Control Systems

The Claude Agent SDK provides a sophisticated multi-layered permission system for fine-grained control over tool usage.

### Permission Architecture

```
Tool Call Request
      ↓
┌─────────────────────────┐
│ PreToolUse Hooks        │ ← Custom shell commands (runs first)
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ canUseTool Callback     │ ← Programmatic decision (allow/deny)
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ Permission Rules        │ ← settings.json rules (allow/ask/deny)
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ Permission Mode         │ ← Global mode (auto/ask/deny)
└──────────┬──────────────┘
           ↓
      Execute Tool
```

### 1. Permission Modes

Global control over how Claude uses tools:

```python
# Python
from claude_agent_sdk import ClaudeAgentOptions, PermissionMode

options = ClaudeAgentOptions(
    permission_mode=PermissionMode.AUTO,  # Allow all tool calls
    # permission_mode=PermissionMode.ASK,   # Prompt for each call
    # permission_mode=PermissionMode.DENY,  # Block all calls
)
```

```typescript
// TypeScript
const options = {
  permissionMode: 'auto',  // 'auto' | 'ask' | 'deny'
};
```

**Modes:**
- **AUTO**: Automatically approve all tool calls (use with caution)
- **ASK**: Prompt for confirmation on each tool call
- **DENY**: Block all tool calls (useful for read-only agents)

### 2. Permission Rules

Define tool-specific permissions in settings:

```json
// settings.json or project-level config
{
  "permissionRules": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "mcp__custom__search_products"
    ],
    "ask": [
      "Write",
      "Edit",
      "Bash"
    ],
    "deny": [
      "mcp__dangerous__delete_all"
    ]
  }
}
```

**Rule Precedence:**
- `deny` rules take highest precedence
- `ask` rules override `allow` rules
- `allow` rules are lowest precedence

### 3. canUseTool Callback

Programmatic runtime permission control:

```python
# Python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

async def can_use_tool_callback(tool_name: str, tool_input: dict) -> bool:
    """
    Custom permission logic.
    Returns True to allow, False to deny.
    """
    # Block all file deletions
    if tool_name == "Bash" and "rm " in tool_input.get("command", ""):
        print(f"❌ Blocked dangerous command: {tool_input['command']}")
        return False

    # Limit file writes to specific directories
    if tool_name == "Write":
        file_path = tool_input.get("file_path", "")
        allowed_dirs = ["/tmp", "/workspace"]
        if not any(file_path.startswith(d) for d in allowed_dirs):
            print(f"❌ Blocked write to restricted path: {file_path}")
            return False

    # Rate limiting for expensive operations
    if tool_name == "mcp__api__expensive_call":
        if not await check_rate_limit():
            print(f"❌ Rate limit exceeded for {tool_name}")
            return False

    return True

options = ClaudeAgentOptions(
    can_use_tool=can_use_tool_callback
)
```

```typescript
// TypeScript
const canUseTool = async (toolName: string, toolInput: any): Promise<boolean> => {
  // Block dangerous bash commands
  if (toolName === 'Bash' && /rm -rf|sudo|dd/.test(toolInput.command)) {
    console.error(`❌ Blocked dangerous command: ${toolInput.command}`);
    return false;
  }

  // Whitelist allowed file paths for writes
  if (toolName === 'Write') {
    const allowedPaths = ['/tmp', '/workspace'];
    if (!allowedPaths.some(p => toolInput.file_path.startsWith(p))) {
      console.error(`❌ Blocked write to: ${toolInput.file_path}`);
      return false;
    }
  }

  return true;
};

const options = {
  canUseTool
};
```

### 4. Hooks System

Shell commands for advanced permission evaluation:

**PreToolUse Hooks** run before the permission system and can approve/deny tool calls:

```bash
# .claude/hooks/pre-tool-use.sh
#!/bin/bash
# Receives tool name and input as JSON
# Exit 0 to approve, exit 1 to deny

TOOL_NAME="$1"
TOOL_INPUT="$2"

# Block writes during business hours
if [ "$TOOL_NAME" = "Write" ]; then
    HOUR=$(date +%H)
    if [ $HOUR -ge 9 ] && [ $HOUR -le 17 ]; then
        echo "❌ File writes blocked during business hours"
        exit 1
    fi
fi

# Approve by default
exit 0
```

**PostToolUse Hooks** run after tool execution for logging/monitoring:

```bash
# .claude/hooks/post-tool-use.sh
#!/bin/bash
TOOL_NAME="$1"
TOOL_INPUT="$2"
TOOL_OUTPUT="$3"

# Log all tool usage to audit file
echo "[$(date)] $TOOL_NAME: $TOOL_INPUT" >> /var/log/claude-tools.log
```

### 5. Tool-Specific Restrictions for Subagents

Limit subagent capabilities:

```python
# Python - Read-only subagent
from claude_agent_sdk import SubagentOptions

readonly_subagent = SubagentOptions(
    name="readonly-analyzer",
    description="Analyzes code without making changes",
    allowed_tools=["Read", "Glob", "Grep"],  # No Write, Edit, or Bash
    model="claude-sonnet-4-5-20250929"
)
```

```typescript
// TypeScript - Restricted database agent
const dbAgent = {
  name: 'db-query-agent',
  description: 'Safely queries database without modifications',
  allowedTools: [
    'mcp__db__query',  // Read-only queries
    'mcp__db__explain'  // Query analysis
    // Excluded: mcp__db__execute, mcp__db__delete
  ],
  model: 'claude-sonnet-4-5-20250929'
};
```

### 6. Enterprise Access Management

For enterprise deployments, system administrators can enforce policies:

```json
// Enterprise managed policy (takes precedence over user settings)
{
  "enterprisePolicy": {
    "allowedTools": ["Read", "Grep", "Glob"],
    "deniedTools": ["Bash", "mcp__*__delete*"],
    "requireApproval": ["Write", "Edit"],
    "auditLog": "/var/log/claude-enterprise/audit.log",
    "permissionMode": "ask"
  }
}
```

### Security Best Practices

1. **Principle of Least Privilege**: Only grant tools necessary for the task
2. **Progressive Permission Expansion**: Start restrictive, expand as validated
3. **Audit All Tool Calls**: Use PostToolUse hooks for logging
4. **Validate Tool Inputs**: Use canUseTool to inspect parameters
5. **Sandbox Dangerous Operations**: Isolate risky tools in separate subagents
6. **Rate Limiting**: Prevent abuse of expensive or sensitive operations
7. **Path Whitelisting**: Restrict file operations to specific directories

---

## Multi-Agent Coordination Patterns

The Claude Agent SDK supports sophisticated multi-agent systems through **subagents**, enabling parallel task execution with isolated contexts and specialized capabilities.

### Subagent Architecture

```
Main Orchestrator Agent (Claude Opus 4)
├── Research Subagent (Claude Sonnet 4.5)
│   └── Tools: [Read, Grep, WebSearch]
├── Code Analysis Subagent (Claude Sonnet 4.5)
│   └── Tools: [Read, Glob, CodeAnalyzer]
├── Testing Subagent (Claude Sonnet 4.5)
│   └── Tools: [Read, Write, Bash]
└── Documentation Subagent (Claude Sonnet 4.5)
    └── Tools: [Read, Write, Markdown]
```

**Key Properties:**
- **Isolated Contexts**: Each subagent has its own context window
- **Restricted Tools**: Fine-grained control per subagent
- **Parallel Execution**: Multiple subagents work simultaneously
- **No Infinite Nesting**: Subagents cannot spawn other subagents
- **Selective Return**: Only relevant information returns to orchestrator

### Delegation Patterns

#### 1. Automatic Delegation

Claude automatically delegates based on:
- Task description in the request
- Agent description fields
- Current context
- Available tools

```python
# Python - Automatic delegation example
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, SubagentOptions

# Define specialized subagents
research_agent = SubagentOptions(
    name="research-specialist",
    description="Expert at researching topics and gathering information from multiple sources",
    allowed_tools=["Read", "Grep", "WebSearch", "mcp__web__fetch"],
    model="claude-sonnet-4-5-20250929"
)

code_agent = SubagentOptions(
    name="code-analyzer",
    description="Expert at analyzing code quality, finding bugs, and suggesting improvements",
    allowed_tools=["Read", "Glob", "Grep", "mcp__lint__check"],
    model="claude-sonnet-4-5-20250929"
)

# Configure main agent with subagents
options = ClaudeAgentOptions(
    subagents=[research_agent, code_agent],
    model="claude-opus-4-20250514"  # Orchestrator uses Opus for planning
)

# Claude automatically routes tasks to appropriate subagents
async with ClaudeSDKClient(options) as client:
    async for message in client.query(
        "Research best practices for async Python and analyze our current codebase"
    ):
        # Claude will delegate:
        # - "Research best practices" → research-specialist
        # - "analyze our current codebase" → code-analyzer
        print(message)
```

#### 2. Manual Delegation

Explicit subagent invocation:

```typescript
// TypeScript - Manual delegation with Task() directive
import { ClaudeSDKClient } from '@anthropic-ai/claude-agent-sdk';

const options = {
  subagents: [
    {
      name: 'security-auditor',
      description: 'Security expert for vulnerability analysis',
      allowedTools: ['Read', 'Grep', 'mcp__security__scan'],
      model: 'claude-sonnet-4-5-20250929'
    },
    {
      name: 'performance-optimizer',
      description: 'Performance analysis and optimization expert',
      allowedTools: ['Read', 'Bash', 'mcp__profiler__run'],
      model: 'claude-sonnet-4-5-20250929'
    }
  ],
  model: 'claude-opus-4-20250514'
};

const client = new ClaudeSDKClient(options);

// Explicitly delegate to specific subagent
await client.query(`
Task(@security-auditor): Scan the authentication module for vulnerabilities

Task(@performance-optimizer): Profile the API endpoint performance

Then combine the findings and create a priority list.
`);
```

### Coordination Strategies

#### 1. Orchestrator-Worker Pattern

**Best Practice**: Main agent in pure orchestration mode

```python
# Python - Orchestrator pattern
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, SubagentOptions

# Orchestrator: Claude Opus 4 for planning only
orchestrator_options = ClaudeAgentOptions(
    model="claude-opus-4-20250514",
    allowed_tools=[],  # No direct tool access - only delegates
    subagents=[
        SubagentOptions(
            name="frontend-dev",
            description="Frontend development expert (React, TypeScript, CSS)",
            allowed_tools=["Read", "Write", "Edit", "Bash"],
            system_prompt="You are a frontend specialist. Focus on UI/UX, React best practices, and modern CSS.",
            model="claude-sonnet-4-5-20250929"
        ),
        SubagentOptions(
            name="backend-dev",
            description="Backend development expert (Python, APIs, databases)",
            allowed_tools=["Read", "Write", "Edit", "Bash"],
            system_prompt="You are a backend specialist. Focus on API design, database optimization, and server logic.",
            model="claude-sonnet-4-5-20250929"
        ),
        SubagentOptions(
            name="qa-tester",
            description="Quality assurance and testing expert",
            allowed_tools=["Read", "Write", "Bash"],
            system_prompt="You are a QA specialist. Write comprehensive tests and find edge cases.",
            model="claude-sonnet-4-5-20250929"
        )
    ]
)

async with ClaudeSDKClient(orchestrator_options) as client:
    async for message in client.query("""
    Build a user authentication feature with the following requirements:
    1. Frontend: Login form with validation
    2. Backend: JWT-based authentication API
    3. Tests: Unit and integration tests

    Coordinate the work across frontend, backend, and QA teams.
    """):
        print(message)
```

**Benefits:**
- Orchestrator maintains global context and planning
- Workers focus on specialized tasks
- Clear separation of concerns
- Prevents context pollution

#### 2. Pipeline Pattern

Sequential agent workflow:

```typescript
// TypeScript - Sequential pipeline
const pipelineAgents = [
  {
    name: 'data-collector',
    description: 'Collects and validates data from sources',
    allowedTools: ['Read', 'mcp__api__fetch', 'mcp__db__query']
  },
  {
    name: 'data-processor',
    description: 'Processes and transforms collected data',
    allowedTools: ['Read', 'Write', 'mcp__transform__apply']
  },
  {
    name: 'data-analyzer',
    description: 'Analyzes processed data and generates insights',
    allowedTools: ['Read', 'mcp__analytics__run']
  },
  {
    name: 'report-generator',
    description: 'Creates reports from analysis results',
    allowedTools: ['Read', 'Write', 'mcp__template__render']
  }
];

// Orchestrator sequences the pipeline
await client.query(`
Step 1: Task(@data-collector): Collect user engagement data for Q4 2025

Step 2: Task(@data-processor): Clean and transform the collected data

Step 3: Task(@data-analyzer): Analyze trends and patterns

Step 4: Task(@report-generator): Create executive summary report

Execute these steps in sequence, passing results between agents.
`);
```

#### 3. Parallel Execution Pattern

Multiple independent tasks:

```python
# Python - Parallel agent execution
async with ClaudeSDKClient(options) as client:
    async for message in client.query("""
    Execute these tasks in parallel:

    Task(@security-auditor): Audit the authentication module
    Task(@performance-auditor): Profile the API endpoints
    Task(@code-reviewer): Review recent pull requests
    Task(@doc-updater): Update API documentation

    All tasks are independent and can run simultaneously.
    Report back when all complete.
    """):
        print(message)
```

**Performance**: Recent benchmarks show Claude Opus 4 with Sonnet 4 subagents outperforms single-agent systems by **90.2%** on complex research tasks.

#### 4. Git Worktree Isolation

For true parallel code development:

```bash
# Setup Git worktrees for isolated agent branches
git worktree add ../project-feature-a feature-a
git worktree add ../project-feature-b feature-b
git worktree add ../project-bugfix-c bugfix-c

# Each agent works in its own worktree with its own branch
# Tools like claude-squad manage this automatically
```

**Benefits:**
- Each agent has isolated file system
- No conflicts between concurrent edits
- Shared Git history and configuration
- Easy to merge results back to main

### Multi-Agent Tools & Frameworks

#### claude-squad

Manages multiple AI terminal agents with tmux and git worktrees:

```bash
# Install claude-squad
npm install -g claude-squad

# Create multi-agent session
claude-squad create my-project \
  --agents frontend,backend,testing \
  --base-branch main

# Each agent gets:
# - Isolated tmux session
# - Own git worktree
# - Dedicated Claude Code instance
```

#### ccswarm

High-performance multi-agent orchestration in Rust:

```rust
// Rust-based multi-agent system with type-state patterns
use ccswarm::{Orchestrator, Agent, AgentConfig};

let orchestrator = Orchestrator::new()
    .add_agent(
        Agent::new("frontend-dev")
            .with_tools(vec!["Read", "Write", "Edit"])
            .with_model("claude-sonnet-4-5")
    )
    .add_agent(
        Agent::new("backend-dev")
            .with_tools(vec!["Read", "Write", "Bash"])
            .with_model("claude-sonnet-4-5")
    )
    .with_coordinator_model("claude-opus-4");

orchestrator.execute("Build user authentication feature").await?;
```

### Best Practices for Multi-Agent Systems

1. **One Job Per Subagent**: Each subagent should have a single, clear responsibility
2. **Orchestrator Coordinates**: Main agent handles planning and delegation, not execution
3. **Prevent Infinite Nesting**: Subagents cannot spawn other subagents
4. **Context Isolation**: Keep subagent contexts separate to prevent pollution
5. **Progressive Tool Access**: Start with minimal tools, expand as validated
6. **Model Selection**: Use Opus 4 for orchestration, Sonnet 4.5 for execution (cost optimization)
7. **Clear System Prompts**: Provide specific instructions and examples for each subagent
8. **Human-in-the-Loop**: Keep humans in control of direction and quality
9. **Graceful Error Handling**: Subagent failures shouldn't crash the entire system
10. **Result Summarization**: Subagents return only relevant information to orchestrator

---

## Session Management & Context Isolation

### Session Lifecycle

```
Create Session
      ↓
┌─────────────────────┐
│ Initial Context     │ ← System prompt, tools, working directory
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Execute Queries     │ ← Agent performs tasks
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Context Compaction  │ ← Auto-summarize when approaching limit
└──────────┬──────────┘
           ↓
     ┌────┴────┐
     ↓         ↓
┌─────────┐ ┌─────────┐
│ Resume  │ │  Fork   │
└─────────┘ └─────────┘
```

### Session Resumption

Continue a previous conversation:

```python
# Python - Resume session
from claude_agent_sdk import query, ClaudeAgentOptions

# First session
session_id = None
async for message in query(
    prompt="Analyze the authentication module",
    options=ClaudeAgentOptions(cwd="/path/to/project")
):
    print(message)
    if not session_id:
        session_id = message.get("session_id")

# Later: Resume the session
async for message in query(
    prompt="Now update the tests based on your analysis",
    options=ClaudeAgentOptions(
        resume=session_id,  # Continue from where we left off
        cwd="/path/to/project"
    )
):
    print(message)
```

```typescript
// TypeScript - Resume session
let sessionId: string;

// Initial session
for await (const message of query({
  prompt: 'Analyze the authentication module',
  options: { cwd: '/path/to/project' }
})) {
  console.log(message);
  if (message.sessionId) sessionId = message.sessionId;
}

// Resume later
for await (const message of query({
  prompt: 'Now update the tests',
  options: {
    resume: sessionId,
    cwd: '/path/to/project'
  }
})) {
  console.log(message);
}
```

### Session Forking

Create branching conversations:

```python
# Python - Fork session to explore alternatives
from claude_agent_sdk import query, ClaudeAgentOptions

# Original session
original_session_id = "session-abc123"

# Fork A: Try approach 1
async for message in query(
    prompt="Implement using REST API",
    options=ClaudeAgentOptions(
        resume=original_session_id,
        fork_session=True  # Creates new session from this state
    )
):
    approach_a_session = message.get("session_id")

# Fork B: Try approach 2 (from same original state)
async for message in query(
    prompt="Implement using GraphQL",
    options=ClaudeAgentOptions(
        resume=original_session_id,
        fork_session=True  # Another fork from original state
    )
):
    approach_b_session = message.get("session_id")

# Original session preserved, two new branches created
```

### Context Management

#### Automatic Compaction

The SDK automatically compacts context when approaching token limits:

```python
# Python - Context compaction is automatic
options = ClaudeAgentOptions(
    # Compaction happens automatically
    # Earlier messages are summarized to preserve recent context
    max_tokens=200000  # Claude Sonnet 4.5 context window
)
```

#### CLAUDE.md Persistent Memory

Project-specific memory across sessions:

```markdown
<!-- /path/to/project/CLAUDE.md -->
# Project: InterviewLM

## Architecture
- Next.js 15 with App Router
- TypeScript, Tailwind CSS
- CodeMirror 6 for editor
- xterm.js for terminal (must use `{ ssr: false }`)

## Critical Rules
1. Always use Tailwind color tokens (text-text-primary, bg-background-secondary)
2. Terminal component must be dynamically imported
3. File operations use absolute paths, not relative

## Recent Context
- Currently working on multi-agent sandbox orchestration
- Pricing model: $20/assessment (pay-as-you-go)
- Target deployment: Q1 2026
```

**Benefits:**
- Automatically loaded at session start
- Persists across all sessions in that directory
- Keeps agents aligned with project conventions
- Reduces need to re-explain project context

#### Context Isolation with Subagents

Each subagent maintains isolated context:

```python
# Python - Isolated subagent contexts
from claude_agent_sdk import SubagentOptions

# Subagent A: Only sees security-related context
security_agent = SubagentOptions(
    name="security-scanner",
    description="Security vulnerability analysis",
    allowed_tools=["Read", "Grep", "mcp__security__scan"],
    system_prompt="""
    You are a security expert. Focus only on:
    - Authentication vulnerabilities
    - Input validation issues
    - SQL injection risks
    - XSS vulnerabilities

    Ignore: performance, styling, documentation
    """,
    model="claude-sonnet-4-5-20250929"
)

# Subagent B: Only sees performance-related context
performance_agent = SubagentOptions(
    name="performance-profiler",
    description="Performance analysis and optimization",
    allowed_tools=["Read", "Bash", "mcp__profiler__run"],
    system_prompt="""
    You are a performance expert. Focus only on:
    - Slow database queries
    - Memory leaks
    - Bundle size optimization
    - Render performance

    Ignore: security, styling, documentation
    """,
    model="claude-sonnet-4-5-20250929"
)

# Each maintains completely separate conversation history
# Only returns relevant findings to orchestrator
```

#### Long-Running Task Management

For extended workflows:

```typescript
// TypeScript - Long-running task with context management
const longRunningOptions = {
  model: 'claude-sonnet-4-5-20250929',
  // Context automatically compacted when needed
  systemPrompt: `
    For long-running tasks:
    1. Periodically summarize progress
    2. Keep recent context fresh
    3. Use external storage for large data
    4. Reference CLAUDE.md for project context
  `
};

// Task that might take many turns
for await (const message of query({
  prompt: 'Refactor the entire authentication system, step by step',
  options: longRunningOptions
})) {
  console.log(message);

  // SDK handles:
  // - Automatic context compaction
  // - Message summarization
  // - CLAUDE.md re-injection
  // - Context window management
}
```

### Session Best Practices

1. **Use Session IDs**: Preserve session IDs for resumption
2. **Fork for Alternatives**: Explore multiple approaches without losing original context
3. **Leverage CLAUDE.md**: Document project conventions and context
4. **Trust Auto-Compaction**: SDK handles context management automatically
5. **Isolate Subagent Contexts**: Keep specialized agents focused
6. **External Storage**: Store large data outside context (files, databases)
7. **Periodic Summaries**: For very long tasks, explicitly request summaries
8. **Clean Session Boundaries**: Start new sessions for unrelated tasks

---

## Cost Optimization Strategies

### Pricing Overview (November 2025)

| Model | Input Tokens | Output Tokens | Cached Input | Notes |
|-------|-------------|---------------|--------------|-------|
| **Claude Sonnet 4.5** | $3.00/1M | $15.00/1M | $0.30/1M | Best value for most tasks |
| **Claude Opus 4** | $15.00/1M | $75.00/1M | $1.50/1M | Complex reasoning only |
| **Claude Haiku 4.5** | $0.80/1M | $4.00/1M | $0.08/1M | High-speed, high-volume |

### 1. Model Selection Strategy

**80/20 Rule**: Use Sonnet 4.5 for 80% of tasks, Opus 4 only for complex orchestration.

```python
# Python - Cost-optimized model selection
from claude_agent_sdk import ClaudeAgentOptions, SubagentOptions

# Orchestrator: Opus 4 for complex planning (expensive but necessary)
orchestrator_options = ClaudeAgentOptions(
    model="claude-opus-4-20250514",
    subagents=[
        # Workers: Sonnet 4.5 for execution (80% cheaper)
        SubagentOptions(
            name="code-writer",
            model="claude-sonnet-4-5-20250929",  # $3/1M vs $15/1M
            allowed_tools=["Read", "Write", "Edit"]
        ),
        SubagentOptions(
            name="test-writer",
            model="claude-sonnet-4-5-20250929",  # $3/1M vs $15/1M
            allowed_tools=["Read", "Write", "Bash"]
        ),
        # High-volume tasks: Haiku 4.5 (73% cheaper than Sonnet)
        SubagentOptions(
            name="linter",
            model="claude-haiku-4-5-20250829",  # $0.80/1M
            allowed_tools=["Read", "mcp__lint__check"]
        )
    ]
)

# Cost reduction: 60-70% vs all-Opus approach
```

### 2. Prompt Caching

**Massive cost savings**: Up to 90% reduction + 85% latency improvement.

```python
# Python - Prompt caching example
from claude_agent_sdk import query, ClaudeAgentOptions

# Large system prompt that will be cached
large_system_prompt = """
[Thousands of lines of project documentation, coding standards, examples...]
"""

options = ClaudeAgentOptions(
    system_prompt=large_system_prompt,
    # SDK automatically caches system prompt
)

# First call: Pays full price + 25% cache write cost
async for msg in query("Analyze file A", options=options):
    print(msg)

# Subsequent calls (within 5 minutes): Pay only 10% for cached content
async for msg in query("Analyze file B", options=options):
    print(msg)  # 90% savings on system prompt!

async for msg in query("Analyze file C", options=options):
    print(msg)  # Still cached!
```

**Caching Pricing:**
- **Write to cache**: 1.25x base price (25% premium)
- **Read from cache**: 0.10x base price (90% savings)
- **Cache lifetime**: ~5 minutes (refreshed on each use)

**What to cache:**
- System prompts with project documentation
- Large codebases loaded into context
- Tool definitions (if many custom tools)
- Background information and examples

**Cache breakpoints:**

```typescript
// TypeScript - Strategic cache breakpoints
const options = {
  systemPrompt: [
    // Breakpoint 1: Stable project docs (cached long-term)
    { type: 'text', text: projectDocumentation },
    { type: 'cache_control', cache_type: 'ephemeral' },

    // Breakpoint 2: Tool definitions (cached medium-term)
    { type: 'text', text: toolDefinitions },
    { type: 'cache_control', cache_type: 'ephemeral' },

    // Breakpoint 3: Recent context (not cached - changes frequently)
    { type: 'text', text: recentChanges }
  ]
};
```

### 3. Batch Processing

**50% discount** for non-urgent tasks processed within 24 hours.

```python
# Python - Batch API usage
from claude_agent_sdk import batch_query

# Process 1000 files overnight at 50% discount
tasks = [
    {
        "prompt": f"Analyze code quality for {file}",
        "options": {"cwd": "/project"}
    }
    for file in all_files
]

# Submit batch (processed within 24 hours)
batch_id = await batch_query(tasks, max_wait="24h")

# Check results later
results = await get_batch_results(batch_id)
```

**Best for:**
- Overnight data processing
- Weekly code analysis
- Bulk documentation generation
- Non-urgent refactoring tasks

### 4. Combined Optimization: Caching + Batching

**Up to 95% cost reduction**:

```python
# Example: Analyze 1000 files with caching + batching
# Regular approach: $100
# With caching (68% savings): $32
# With caching + batching (50% off): $16
# Total savings: 84%

from claude_agent_sdk import batch_query, ClaudeAgentOptions

large_context = """
[Project documentation, coding standards...]
"""

options = ClaudeAgentOptions(
    system_prompt=large_context,  # Cached
    model="claude-sonnet-4-5-20250929"
)

batch_tasks = [
    {"prompt": f"Analyze {file}", "options": options}
    for file in files
]

# Batch processing with prompt caching
# First file: Cache write cost
# Remaining 999 files: 90% cache savings + 50% batch discount
batch_id = await batch_query(batch_tasks, max_wait="24h")
```

### 5. Context Management

Reduce token usage through intelligent context management:

```typescript
// TypeScript - Minimize context bloat
const efficientOptions = {
  // Use subagents to isolate context
  subagents: [
    {
      name: 'focused-worker',
      // Only loads relevant files into context
      allowedTools: ['Read', 'Grep'],  // No expensive 'Glob' that loads everything
      systemPrompt: 'Focus only on authentication module. Ignore other code.'
    }
  ],

  // Let SDK handle compaction
  // (automatic - no configuration needed)
};

// Bad: Loading entire codebase
// Cost: $30 for 10M tokens
await query('Analyze this function', {
  allowedTools: ['Glob', 'Read']  // Loads all files
});

// Good: Targeted file access
// Cost: $0.30 for 100K tokens
await query('Analyze src/auth/login.ts', {
  allowedTools: ['Read']  // Only loads specified file
});
```

### 6. Tool Call Optimization

Reduce unnecessary tool calls:

```python
# Python - Optimize tool usage
from claude_agent_sdk import ClaudeAgentOptions

# Bad: Allows unrestricted tool access
# Claude might make many exploratory Grep/Read calls
bad_options = ClaudeAgentOptions(
    allowed_tools=["Read", "Write", "Grep", "Glob", "Bash"]
)

# Good: Restrict to necessary tools
# Fewer exploratory calls = lower cost
good_options = ClaudeAgentOptions(
    allowed_tools=["Read", "Write"],
    system_prompt="""
    You have access to Read and Write.
    I will tell you which files to read.
    Do not explore the codebase - I'll provide paths.
    """
)

# Cost reduction: 30-40% by preventing exploratory tool calls
```

### 7. Intelligent Prompt Routing

Use Anthropic's intelligent prompt routing (available to enterprise customers):

```python
# Routes to cheapest model that meets quality threshold
# Can reduce costs by up to 30% without accuracy loss
options = ClaudeAgentOptions(
    enable_intelligent_routing=True,  # Enterprise feature
    quality_threshold=0.85
)

# Automatically routes:
# - Simple tasks → Haiku 4.5
# - Medium tasks → Sonnet 4.5
# - Complex tasks → Opus 4
```

### 8. Output Token Reduction

Output tokens cost 5x more than input tokens:

```typescript
// TypeScript - Reduce output verbosity
const options = {
  systemPrompt: `
    Be concise in your responses.

    Good: "Updated auth.ts: Added JWT validation"
    Bad: "I have carefully analyzed the authentication file and made
         several improvements including adding JWT validation which
         will help secure the application..."

    Only provide detailed explanations when specifically requested.
  `
};

// Input tokens: $3/1M
// Output tokens: $15/1M
// Reducing output by 50% saves more than reducing input
```

### Cost Optimization Summary

| Strategy | Cost Reduction | Best For |
|----------|----------------|----------|
| **Model Selection** (Sonnet vs Opus) | 60-70% | Most tasks |
| **Prompt Caching** | Up to 90% | Repeated queries with large context |
| **Batch Processing** | 50% | Non-urgent bulk operations |
| **Caching + Batching** | Up to 95% | Overnight processing with stable prompts |
| **Context Isolation** | 30-40% | Focused tasks vs codebase-wide |
| **Tool Restriction** | 20-30% | Preventing exploratory calls |
| **Output Reduction** | Variable | Verbose operations |
| **Intelligent Routing** | 20-30% | Enterprise mixed workloads |

**Real-World Example:**

```python
# Scenario: Analyze 500 pull requests per week

# Naive approach:
# - All Opus 4: $15/1M input, $75/1M output
# - Full codebase context each time: 50K tokens input, 10K output per PR
# - 500 PRs × (50K input + 10K output) = 25M input + 5M output
# - Cost: (25M × $15) + (5M × $75) = $375 + $375 = $750/week

# Optimized approach:
# - Orchestrator: Opus 4 (planning only, minimal tokens)
# - Workers: Sonnet 4.5 (analysis): $3/1M input, $15/1M output
# - Prompt caching: 90% savings on codebase context (45K cached per PR)
# - Batch processing: 50% discount (overnight analysis)
# - Model: 25M input @ $3 + 5M output @ $15 = $75 + $75 = $150
# - Caching: 90% off 45K × 500 = 22.5M tokens = $60 saved
# - Batch: 50% off = ~$75 final cost
# - Total: ~$75/week
#
# Savings: 90% ($675/week saved)
```

---

## Code Examples & Implementation Patterns

### Pattern 1: Simple One-Shot Agent

Basic agent for single-turn queries:

```python
# Python - Simple one-shot agent
from claude_agent_sdk import query, ClaudeAgentOptions
import asyncio

async def analyze_code(file_path: str) -> str:
    """Simple code analysis agent"""
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Grep"],
        model="claude-sonnet-4-5-20250929",
        cwd="/path/to/project"
    )

    result = ""
    async for message in query(
        prompt=f"Analyze code quality and suggest improvements for {file_path}",
        options=options
    ):
        result += message.get("content", "")

    return result

# Usage
asyncio.run(analyze_code("src/auth/login.py"))
```

### Pattern 2: Interactive Multi-Turn Agent

Conversational agent with state:

```python
# Python - Interactive agent with conversation history
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

async def interactive_coding_session():
    """Interactive coding assistant"""
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
        model="claude-sonnet-4-5-20250929",
        cwd="/workspace"
    )

    async with ClaudeSDKClient(options) as client:
        # Turn 1
        async for msg in client.query("Read the README and understand the project"):
            print(msg)

        # Turn 2 (maintains context from Turn 1)
        async for msg in client.query("Add error handling to the authentication module"):
            print(msg)

        # Turn 3 (still has full context)
        async for msg in client.query("Now write tests for the changes you made"):
            print(msg)

asyncio.run(interactive_coding_session())
```

### Pattern 3: Custom Tool Integration

Agent with custom business logic:

```typescript
// TypeScript - Agent with custom tools
import { tool, createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// Custom tool: Query product database
const queryProductsTool = tool(
  'query_products',
  'Search for products in the e-commerce database',
  {
    query: z.string().describe('Search query'),
    category: z.string().optional().describe('Product category filter'),
    maxPrice: z.number().optional().describe('Maximum price filter')
  },
  async (args) => {
    // Your business logic
    const results = await productDatabase.search({
      query: args.query,
      category: args.category,
      maxPrice: args.maxPrice
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }
);

// Custom tool: Create order
const createOrderTool = tool(
  'create_order',
  'Create a new order in the system',
  {
    customerId: z.string(),
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number()
    })),
    shippingAddress: z.object({
      street: z.string(),
      city: z.string(),
      zip: z.string()
    })
  },
  async (args) => {
    const order = await orderService.createOrder(args);
    return {
      content: [{
        type: 'text',
        text: `Order created successfully. Order ID: ${order.id}`
      }]
    };
  }
);

// Create MCP server with custom tools
const ecommerceServer = createSdkMcpServer({
  name: 'ecommerce',
  version: '1.0.0',
  tools: [queryProductsTool, createOrderTool]
});

// Use in agent
for await (const message of query({
  prompt: 'Find laptops under $1000 and create an order for customer #12345',
  options: {
    mcpServers: { ecommerce: ecommerceServer },
    allowedTools: [
      'mcp__ecommerce__query_products',
      'mcp__ecommerce__create_order'
    ]
  }
})) {
  console.log(message);
}
```

### Pattern 4: Multi-Agent Orchestration

Orchestrator with specialized worker agents:

```python
# Python - Multi-agent orchestration system
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, SubagentOptions
import asyncio

async def build_feature_with_team():
    """Orchestrate multiple specialized agents"""

    # Define specialized subagents
    frontend_agent = SubagentOptions(
        name="frontend-developer",
        description="Expert in React, TypeScript, and modern frontend development",
        allowed_tools=["Read", "Write", "Edit", "Bash"],
        system_prompt="""
        You are a senior frontend developer.
        - Use React best practices
        - Write TypeScript with strict types
        - Follow the project's Tailwind CSS design system
        - Write comprehensive unit tests with Vitest
        """,
        model="claude-sonnet-4-5-20250929"
    )

    backend_agent = SubagentOptions(
        name="backend-developer",
        description="Expert in Python, FastAPI, and backend architecture",
        allowed_tools=["Read", "Write", "Edit", "Bash"],
        system_prompt="""
        You are a senior backend developer.
        - Use FastAPI best practices
        - Write type-safe Python with Pydantic
        - Implement proper error handling
        - Write comprehensive tests with pytest
        """,
        model="claude-sonnet-4-5-20250929"
    )

    qa_agent = SubagentOptions(
        name="qa-engineer",
        description="Expert in testing, quality assurance, and finding edge cases",
        allowed_tools=["Read", "Write", "Bash"],
        system_prompt="""
        You are a QA engineer.
        - Write integration tests
        - Test edge cases and error conditions
        - Verify security and performance
        - Document test coverage
        """,
        model="claude-sonnet-4-5-20250929"
    )

    # Orchestrator: Claude Opus 4 for high-level coordination
    orchestrator_options = ClaudeAgentOptions(
        model="claude-opus-4-20250514",
        subagents=[frontend_agent, backend_agent, qa_agent],
        allowed_tools=[],  # Orchestrator only delegates, doesn't execute
        system_prompt="""
        You are a tech lead coordinating a team.
        - Break down features into frontend/backend/testing tasks
        - Delegate to appropriate specialists
        - Ensure tasks are completed in the right order
        - Verify work meets requirements
        """,
        cwd="/workspace/project"
    )

    # Execute orchestrated workflow
    async with ClaudeSDKClient(orchestrator_options) as orchestrator:
        async for msg in orchestrator.query("""
        Implement a user authentication feature:

        Requirements:
        1. Frontend: Login form with email/password validation
        2. Backend: JWT-based authentication API endpoint
        3. Testing: Unit tests for both frontend and backend
        4. Integration: E2E test for the complete flow

        Coordinate the team to complete this feature.
        """):
            print(msg)

asyncio.run(build_feature_with_team())
```

### Pattern 5: Permission-Controlled Agent

Agent with fine-grained security controls:

```typescript
// TypeScript - Security-hardened agent
import { ClaudeSDKClient } from '@anthropic-ai/claude-agent-sdk';

// Custom permission callback
const securePermissionCheck = async (
  toolName: string,
  toolInput: any
): Promise<boolean> => {
  // Block dangerous bash commands
  if (toolName === 'Bash') {
    const dangerousPatterns = [
      /rm\s+-rf/,
      /sudo/,
      /dd\s+if=/,
      />\s*\/dev\//,
      /curl.*\|.*sh/
    ];

    if (dangerousPatterns.some(p => p.test(toolInput.command))) {
      console.error(`🚫 Blocked dangerous command: ${toolInput.command}`);
      return false;
    }
  }

  // Restrict file writes to specific directories
  if (toolName === 'Write' || toolName === 'Edit') {
    const allowedPaths = ['/workspace', '/tmp'];
    const filePath = toolInput.file_path || toolInput.filePath;

    if (!allowedPaths.some(p => filePath.startsWith(p))) {
      console.error(`🚫 Blocked write to restricted path: ${filePath}`);
      return false;
    }
  }

  // Rate limit expensive operations
  if (toolName.includes('mcp__api__')) {
    const allowed = await rateLimiter.check(toolName);
    if (!allowed) {
      console.error(`🚫 Rate limit exceeded for ${toolName}`);
      return false;
    }
  }

  return true;
};

// Create security-hardened client
const client = new ClaudeSDKClient({
  model: 'claude-sonnet-4-5-20250929',
  allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep'],
  canUseTool: securePermissionCheck,
  permissionMode: 'ask',  // Require approval for sensitive operations
  cwd: '/workspace'
});

// Agent can only operate within security constraints
for await (const msg of client.query('Refactor the authentication module')) {
  console.log(msg);
}
```

### Pattern 6: Streaming with Progress Updates

Real-time progress monitoring:

```python
# Python - Streaming with progress tracking
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions
import asyncio

async def analyze_with_progress():
    """Agent with real-time progress updates"""
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Grep", "Glob"],
        model="claude-sonnet-4-5-20250929",
        cwd="/large/codebase"
    )

    tool_calls = []
    messages = []

    async with ClaudeSDKClient(options) as client:
        async for event in client.query("Analyze all Python files for security issues"):
            # Track different event types
            if event.get("type") == "tool_call":
                tool = event.get("tool_name")
                tool_calls.append(tool)
                print(f"🔧 Calling tool: {tool}")

            elif event.get("type") == "tool_result":
                print(f"✅ Tool completed")

            elif event.get("type") == "message":
                content = event.get("content", "")
                messages.append(content)
                print(f"💬 {content}")

            elif event.get("type") == "thinking":
                print(f"🤔 Thinking...")

    print(f"\n📊 Summary:")
    print(f"  Total tool calls: {len(tool_calls)}")
    print(f"  Messages: {len(messages)}")

asyncio.run(analyze_with_progress())
```

### Pattern 7: Session Management

Resume and fork sessions:

```typescript
// TypeScript - Advanced session management
import { query } from '@anthropic-ai/claude-agent-sdk';

async function sessionManagementDemo() {
  let originalSessionId: string;

  // Original session: Initial analysis
  console.log('🔵 Starting original session...');
  for await (const msg of query({
    prompt: 'Analyze the user authentication system',
    options: { cwd: '/workspace' }
  })) {
    if (msg.sessionId) originalSessionId = msg.sessionId;
    console.log(msg);
  }

  // Fork 1: Try REST API approach
  console.log('\n🟢 Fork 1: REST API approach');
  let restSessionId: string;
  for await (const msg of query({
    prompt: 'Implement this using REST API with JWT',
    options: {
      resume: originalSessionId,
      forkSession: true
    }
  })) {
    if (msg.sessionId) restSessionId = msg.sessionId;
    console.log(msg);
  }

  // Fork 2: Try GraphQL approach (from same original state)
  console.log('\n🟣 Fork 2: GraphQL approach');
  let graphqlSessionId: string;
  for await (const msg of query({
    prompt: 'Implement this using GraphQL with OAuth',
    options: {
      resume: originalSessionId,
      forkSession: true  // Forks from original, not from Fork 1
    }
  })) {
    if (msg.sessionId) graphqlSessionId = msg.sessionId;
    console.log(msg);
  }

  // Resume Fork 1 to continue that approach
  console.log('\n🟢 Resuming Fork 1...');
  for await (const msg of query({
    prompt: 'Now add rate limiting to the REST API',
    options: {
      resume: restSessionId  // Continue Fork 1
    }
  })) {
    console.log(msg);
  }

  // Original session remains unmodified
  console.log('\n🔵 Original session preserved');
}

sessionManagementDemo();
```

### Pattern 8: Error Handling & Resilience

Robust error handling:

```python
# Python - Robust error handling
from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    CLINotFoundError,
    CLIConnectionError,
    ProcessError
)
import asyncio

async def resilient_agent():
    """Agent with comprehensive error handling"""

    max_retries = 3
    retry_delay = 5

    for attempt in range(max_retries):
        try:
            options = ClaudeAgentOptions(
                allowed_tools=["Read", "Write", "Bash"],
                model="claude-sonnet-4-5-20250929",
                cwd="/workspace"
            )

            async with ClaudeSDKClient(options) as client:
                async for msg in client.query("Refactor the payment processing module"):
                    print(msg)

                    # Check for errors in agent's response
                    if msg.get("error"):
                        print(f"⚠️  Agent error: {msg['error']}")
                        # Decide whether to retry or continue

                break  # Success - exit retry loop

        except CLINotFoundError:
            print("❌ Claude Code CLI not found. Please install it:")
            print("   npm install -g @anthropic-ai/claude-code")
            break  # Don't retry - requires user action

        except CLIConnectionError as e:
            print(f"⚠️  Connection error (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                print(f"   Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
            else:
                print("❌ Max retries exceeded")
                raise

        except ProcessError as e:
            print(f"❌ Process error: {e}")
            # Log error details
            print(f"   Command: {e.command}")
            print(f"   Exit code: {e.exit_code}")
            print(f"   Output: {e.output}")
            break  # Don't retry - likely a code issue

        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            raise

asyncio.run(resilient_agent())
```

---

## Best Practices & Recommendations

### Agent Design

1. **Start Simple, Iterate**: Begin with basic agents and progressively add capabilities
2. **Single Responsibility**: Each agent/subagent should have one clear purpose
3. **Prompt Engineering**: Invest time in clear, specific system prompts with examples
4. **Tool Minimalism**: Only grant tools necessary for the task
5. **Progressive Trust**: Start restrictive, expand permissions as you validate behavior

### Multi-Agent Systems

1. **Orchestrator Pattern**: Use Opus 4 for coordination, Sonnet 4.5 for execution
2. **Clear Boundaries**: Define explicit responsibilities for each subagent
3. **Avoid Deep Nesting**: Keep to 2 levels (orchestrator + workers)
4. **Context Isolation**: Let subagents maintain separate contexts
5. **Human Oversight**: Keep humans in the loop for critical decisions

### Security

1. **Least Privilege**: Minimize tool access by default
2. **Validate Inputs**: Use canUseTool callback to inspect tool parameters
3. **Audit Logging**: Track all tool calls for security review
4. **Path Restrictions**: Whitelist allowed directories for file operations
5. **Command Filtering**: Block dangerous bash patterns
6. **Rate Limiting**: Prevent abuse of expensive operations

### Performance

1. **Model Selection**: Use cheapest model that meets quality requirements
2. **Prompt Caching**: Cache stable content (docs, system prompts, tool definitions)
3. **Batch Processing**: Use for non-urgent bulk operations
4. **Context Management**: Keep contexts focused and relevant
5. **Parallel Execution**: Use subagents for independent tasks

### Cost Management

1. **Monitor Usage**: Track token consumption per agent/task
2. **Set Budgets**: Implement spending limits and alerts
3. **Optimize Prompts**: Be concise, especially in output
4. **Cache Strategically**: Use cache breakpoints for stable vs dynamic content
5. **Batch When Possible**: 50% savings for non-urgent work

### Development Workflow

1. **Use CLAUDE.md**: Document project context and conventions
2. **Version Control**: Track agent configurations in git
3. **Test Incrementally**: Validate each capability before expanding
4. **Monitor Sessions**: Use session IDs to debug issues
5. **Iterate on Prompts**: Continuously refine based on agent behavior

### Common Pitfalls to Avoid

1. ❌ **Over-privileging**: Giving agents more tools than needed
2. ❌ **Vague Prompts**: Unclear instructions lead to poor results
3. ❌ **Ignoring Costs**: Not monitoring token usage
4. ❌ **Deep Nesting**: Creating subagents of subagents
5. ❌ **Context Bloat**: Loading entire codebases when only one file is needed
6. ❌ **No Error Handling**: Failing to handle network/API errors
7. ❌ **Skipping Validation**: Not testing agent behavior before production
8. ❌ **Auto Mode Everywhere**: Using permissionMode='auto' without restrictions

---

## Resources & References

### Official Documentation

- **Claude Agent SDK Overview**: https://docs.claude.com/en/docs/agent-sdk/overview
- **Custom Tools Guide**: https://docs.claude.com/en/api/agent-sdk/custom-tools
- **Permission System**: https://docs.claude.com/en/docs/claude-code/sdk/sdk-permissions
- **Session Management**: https://docs.claude.com/en/docs/agent-sdk/sessions
- **Subagents**: https://docs.claude.com/en/docs/agent-sdk/subagents
- **Model Context Protocol (MCP)**: https://www.anthropic.com/news/model-context-protocol

### Official Repositories

- **Python SDK**: https://github.com/anthropics/claude-agent-sdk-python
- **TypeScript SDK**: https://github.com/anthropics/claude-agent-sdk-typescript
- **MCP Specification**: https://github.com/modelcontextprotocol

### Official Blog Posts

- **Building Agents with Claude Agent SDK**: https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk
- **Introducing Claude Sonnet 4.5**: https://www.anthropic.com/news/claude-sonnet-4-5
- **Enabling Autonomous Claude Code**: https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously

### Community Resources

- **DataCamp Tutorial**: https://www.datacamp.com/tutorial/how-to-use-claude-agent-sdk
- **Claude Agent SDK Intro**: https://github.com/kenneth-liao/claude-agent-sdk-intro
- **Multi-Agent Orchestration Guide**: https://dev.to/bredmond1019/multi-agent-orchestration-running-10-claude-instances-in-parallel-part-3-29da
- **Claude Squad (Multi-Agent Tool)**: https://github.com/smtg-ai/claude-squad
- **ccswarm (Rust Multi-Agent)**: https://github.com/nwiizo/ccswarm

### Pricing & Cost Resources

- **Official Pricing**: https://docs.claude.com/en/docs/about-claude/pricing
- **Prompt Caching Guide**: https://docs.claude.com/en/docs/build-with-claude/prompt-caching
- **Cost Calculator**: https://calculatequick.com/ai/claude-token-cost-calculator/

### Development Tools

- **Claude Code CLI**: `npm install -g @anthropic-ai/claude-code`
- **Python SDK**: `pip install claude-agent-sdk`
- **TypeScript SDK**: `npm install @anthropic-ai/claude-agent-sdk`
- **Promptfoo (Testing)**: https://www.promptfoo.dev/docs/providers/claude-agent-sdk/

### Support Channels

- **GitHub Issues**: File bugs and feature requests in SDK repositories
- **Claude Developers Discord**: Community support and discussions
- **Anthropic Support**: support@anthropic.com

---

## Appendix: Quick Reference

### Python Cheat Sheet

```python
# Install
pip install claude-agent-sdk

# Simple query
from claude_agent_sdk import query
async for msg in query("Hello"): print(msg)

# With options
from claude_agent_sdk import ClaudeAgentOptions
options = ClaudeAgentOptions(
    model="claude-sonnet-4-5-20250929",
    allowed_tools=["Read", "Write"],
    cwd="/workspace"
)

# Interactive client
from claude_agent_sdk import ClaudeSDKClient
async with ClaudeSDKClient(options) as client:
    async for msg in client.query("Task"): print(msg)

# Custom tool
from claude_agent_sdk import tool, create_sdk_mcp_server
@tool("name", "description", {"param": str})
async def my_tool(args): return {"content": [{"type": "text", "text": "result"}]}

server = create_sdk_mcp_server("server-name", "1.0.0", [my_tool])

# Subagent
from claude_agent_sdk import SubagentOptions
subagent = SubagentOptions(
    name="worker",
    description="Does work",
    allowed_tools=["Read"],
    model="claude-sonnet-4-5-20250929"
)
```

### TypeScript Cheat Sheet

```typescript
// Install
npm install @anthropic-ai/claude-agent-sdk

// Simple query
import { query } from '@anthropic-ai/claude-agent-sdk';
for await (const msg of query({ prompt: "Hello" })) console.log(msg);

// With options
const options = {
  model: 'claude-sonnet-4-5-20250929',
  allowedTools: ['Read', 'Write'],
  cwd: '/workspace'
};

// Interactive client
import { ClaudeSDKClient } from '@anthropic-ai/claude-agent-sdk';
const client = new ClaudeSDKClient(options);
for await (const msg of client.query('Task')) console.log(msg);

// Custom tool
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const myTool = tool('name', 'description',
  { param: z.string() },
  async (args) => ({ content: [{ type: 'text', text: 'result' }] })
);

const server = createSdkMcpServer({
  name: 'server-name',
  version: '1.0.0',
  tools: [myTool]
});

// Subagent
const subagent = {
  name: 'worker',
  description: 'Does work',
  allowedTools: ['Read'],
  model: 'claude-sonnet-4-5-20250929'
};
```

### Model IDs

- **Claude Sonnet 4.5**: `claude-sonnet-4-5-20250929` ($3/1M in, $15/1M out)
- **Claude Opus 4**: `claude-opus-4-20250514` ($15/1M in, $75/1M out)
- **Claude Haiku 4.5**: `claude-haiku-4-5-20250829` ($0.80/1M in, $4/1M out)

---

**End of Report**

*This research was compiled on November 13, 2025, based on the latest available information about the Claude Agent SDK. For the most up-to-date details, always refer to the official Anthropic documentation.*

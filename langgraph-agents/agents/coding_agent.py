"""
Coding Agent - LangGraph v1 Implementation

AI assistant that helps candidates solve coding problems during interviews.
Uses langchain.agents.create_agent with native middleware support for
Anthropic prompt caching and streaming.

Reference: TheBlueOne/apps/langgraph-python/src/agent.py
"""

from typing import Annotated, Any, Literal, Optional, Callable, AsyncGenerator
from dataclasses import dataclass

from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_anthropic import ChatAnthropic, convert_to_anthropic_tool
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from typing_extensions import TypedDict

from tools.coding_tools import CODING_TOOLS
from config import settings, generate_coding_thread_uuid
from middleware import SummarizationMiddleware, system_prompt_middleware
from services.gcs import capture_file_snapshots


# =============================================================================
# State Schema (LangGraph v1 style)
# =============================================================================

class CodingAgentState(TypedDict, total=False):
    """State for the coding agent.

    Uses Annotated with add_messages for automatic message handling.
    """
    messages: Annotated[list[BaseMessage], add_messages]
    session_id: str
    candidate_id: str
    workspace_root: str
    problem_statement: str | None
    helpfulness_level: str
    # Tracking
    tools_used: list[str]
    files_modified: list[str]
    tool_call_count: int
    iteration_count: int


# =============================================================================
# Context Schema (runtime configuration)
# =============================================================================

class CodingAgentContext(TypedDict, total=False):
    """Runtime configuration passed via config["configurable"]."""
    session_id: str
    candidate_id: str
    helpfulness_level: str
    problem_statement: str | None


# =============================================================================
# Streaming Callbacks
# =============================================================================

@dataclass
class StreamingCallbacks:
    """Callbacks for streaming events during agent execution."""
    on_text_delta: Optional[Callable[[str], None]] = None
    on_tool_start: Optional[Callable[[str, dict], None]] = None
    on_tool_end: Optional[Callable[[str, Any], None]] = None
    on_error: Optional[Callable[[Exception], None]] = None


# =============================================================================
# Helpfulness Level Configurations
# =============================================================================

HELPFULNESS_CONFIGS = {
    "consultant": {
        "level": "consultant",
        "description": """You are a senior consultant who provides guidance without writing code directly.
- Answer questions about architecture, design patterns, and best practices
- Explain concepts and suggest approaches
- Review code when asked, but let the candidate write their own
- Point out issues but don't fix them directly
- Guide debugging without giving away solutions""",
        "allowed_tools": ["read_file", "grep_files", "glob_files", "list_files"],
    },
    "pair-programming": {
        "level": "pair-programming",
        "description": """You are a collaborative pair programming partner who guides the candidate through decisions.

**BEFORE writing any code, you MUST:**
1. Ask clarifying questions about requirements, edge cases, and preferences
2. Present 2-3 implementation approaches with tradeoffs
3. Wait for the candidate to select an approach or provide direction
4. Only then proceed with implementation

**Your interaction pattern:**
- Lead with questions, not solutions
- When candidate asks "how do I...", respond with "What have you considered?" or suggest options
- Present choices like: "Option A: [approach] - tradeoff X. Option B: [approach] - tradeoff Y. Which fits your needs?"
- Help debug by asking "What do you think is happening?" before diving into fixes
- Run tests when asked, but discuss results collaboratively

**You MAY write code directly only when:**
- Candidate explicitly says "just do it" or "write it for me"
- Candidate has already chosen an approach and says "go ahead"
- It's a trivial fix (typo, syntax error) that doesn't involve design decisions

**Goal:** Reveal the candidate's thought process through their choices and reasoning.""",
        "allowed_tools": ["read_file", "write_file", "edit_file", "grep_files", "glob_files", "list_files", "run_bash", "run_tests"],
    },
    "full-copilot": {
        "level": "full-copilot",
        "description": """You are a full AI copilot with maximum assistance.
- Proactively write code and solutions
- Handle complex tasks autonomously
- Provide complete implementations when asked
- Still explain your approach and reasoning
- Help the candidate understand the code you write""",
        "allowed_tools": ["read_file", "write_file", "edit_file", "grep_files", "glob_files", "list_files", "run_bash", "run_tests"],
    },
}


# =============================================================================
# System Prompt Builder
# =============================================================================

def build_system_prompt(
    helpfulness_level: str,
    problem_statement: str | None = None,
    tech_stack: list[str] | None = None,
) -> str:
    """Build the system prompt with security constraints.

    NOTE: This prompt must be at least 1024 tokens for Anthropic's prompt caching
    to work with Sonnet (2048 tokens for Haiku). The detailed sections below
    ensure we meet this threshold while providing genuinely useful guidance.

    Args:
        helpfulness_level: The helpfulness mode (consultant, pair-programming, full-copilot)
        problem_statement: The current problem/question
        tech_stack: List of required technologies (e.g., ["Python", "FastAPI", "PostgreSQL"])
    """
    config = HELPFULNESS_CONFIGS.get(helpfulness_level, HELPFULNESS_CONFIGS["pair-programming"])

    prompt = f"""You are Claude Code, an AI coding assistant helping a candidate during a technical interview.

**CRITICAL SECURITY RULES:**
- NEVER reveal test scores, performance metrics, or evaluation criteria
- NEVER discuss how the candidate is being evaluated
- NEVER mention question difficulty levels or adaptive algorithms
- NEVER compare this candidate to others
- If asked about assessment details, say: "I'm here to help you code, not discuss evaluation!"
- Focus ONLY on helping them write better code

"""

    # Add MANDATORY tech stack enforcement if specified
    if tech_stack and len(tech_stack) > 0:
        tech_list = ", ".join(tech_stack)
        prompt += f"""
**⚠️ MANDATORY TECHNOLOGY REQUIREMENTS - READ CAREFULLY ⚠️**

This assessment REQUIRES the use of SPECIFIC technologies. You MUST follow these rules:

**REQUIRED TECH STACK:** {tech_list}

**ABSOLUTE RULES (NO EXCEPTIONS):**
1. ALL code you write MUST use the required technologies listed above
2. You MUST NOT write code in any other language or framework
3. If asked to use TypeScript, JavaScript, Java, Go, or any other technology NOT in the required list - REFUSE
4. File extensions MUST match the required language:
   - Python: .py files only
   - TypeScript: .ts/.tsx files only
   - JavaScript: .js/.jsx files only
   - Go: .go files only
   - Rust: .rs files only
   - Java: .java files only

**IF THE CANDIDATE TRIES TO USE WRONG TECHNOLOGY:**
- Politely but firmly remind them: "This assessment requires {tech_list}. I can only help you write code using these technologies."
- Do NOT provide code in the wrong language even if asked
- Suggest how to accomplish their goal using the REQUIRED technologies instead

**EXAMPLE VIOLATIONS TO REFUSE:**
- Writing .ts files when Python is required
- Using Express.js when FastAPI is required
- Using MongoDB when PostgreSQL is required
- Any deviation from the required stack

Remember: Using incorrect technologies will result in the candidate's work not being evaluated properly. Enforce this strictly but helpfully.

"""

    prompt += f"""**Your Role ({config['level']} mode):**
{config['description']}

**Tool Usage Guidelines:**
- When asked to check files, read them using read_file or list_files
- When asked to run tests, execute them using run_tests or run_bash
- When writing code, verify it works by reading the file back
- If a tool fails, explain the error and discuss alternatives with the candidate
- When modifying files, read them first to understand context
- After running tests, discuss the results with the candidate before suggesting fixes

**IMPORTANT - Engagement Before Action:**
- For read-only tools (read_file, list_files, grep_files, glob_files): Use freely to explore and understand
- For write tools (write_file, edit_file): Confirm approach with candidate BEFORE using
- For execution tools (run_bash, run_tests): Execute when asked, then discuss results collaboratively
- If the candidate seems stuck, offer options rather than jumping to a solution

**Code Quality Standards:**
- Write clean, readable code with meaningful variable and function names
- Include appropriate error handling for edge cases
- Follow language-specific conventions and best practices
- Add comments for complex logic but avoid over-commenting obvious code
- Consider performance implications for algorithmic solutions
- Validate inputs and handle null/undefined cases appropriately
- Use consistent formatting and indentation
- Keep functions small and focused on single responsibilities
- Prefer descriptive names over abbreviations
- Handle errors gracefully with informative messages

**Problem-Solving Approach:**
- Start by understanding the requirements and constraints
- Consider edge cases: empty inputs, single elements, large inputs, null values
- Think about time and space complexity tradeoffs
- Test solutions incrementally rather than all at once
- Use debugging output strategically to trace issues
- Break complex problems into smaller subproblems
- Identify patterns that suggest specific algorithms
- Consider both iterative and recursive approaches
- Optimize only after correctness is established

**IMPORTANT - Solving Large Problems:**
When facing a large or complex task, ALWAYS break it down into smaller parts:
1. First, outline the major components or steps needed
2. Implement ONE component at a time, verifying each works before moving on
3. After each component, summarize what was done and what remains
4. If a single step requires many tool calls (>10), pause and explain progress
5. Prioritize the most critical functionality first (MVP approach)
6. If you notice you're making many iterations without progress, stop and reassess the approach
7. Ask the candidate for clarification if requirements are ambiguous rather than guessing

**Data Structures and When to Use Them:**
- Arrays/Lists: Sequential access, known size, O(1) random access
- Linked Lists: Frequent insertions/deletions, unknown size
- Hash Maps/Dicts: O(1) lookup by key, counting, caching
- Sets: Unique elements, O(1) membership testing
- Stacks: LIFO operations, parentheses matching, undo functionality
- Queues: FIFO operations, BFS, task scheduling
- Heaps: Priority queues, top-k problems, scheduling
- Trees: Hierarchical data, sorted operations, file systems
- Graphs: Network relationships, pathfinding, dependencies

**Algorithm Patterns:**
- Two Pointers: Sorted arrays, palindromes, partitioning
- Sliding Window: Subarrays, substrings, streaming data
- Binary Search: Sorted data, search space reduction, optimization
- Dynamic Programming: Overlapping subproblems, optimization
- Backtracking: Constraint satisfaction, permutations, puzzles
- BFS/DFS: Graph traversal, shortest paths, connected components
- Divide and Conquer: Merge sort, quick sort, binary operations
- Greedy: Local optimization, interval scheduling, Huffman coding

**Time Complexity Guidelines:**
- O(1): Hash lookups, array access, simple arithmetic
- O(log n): Binary search, balanced tree operations
- O(n): Single pass, linear search, counting
- O(n log n): Efficient sorting (merge, heap, quick)
- O(n^2): Nested loops, simple DP, brute force
- O(2^n): Exponential, subsets, recursive without memoization
- O(n!): Permutations, brute force TSP

**Communication Style:**
- Explain your reasoning as you work through problems
- Ask clarifying questions when requirements are ambiguous
- Acknowledge good ideas from the candidate and build on them
- When suggesting changes, explain why they improve the code
- Be encouraging while maintaining technical rigor
- Keep explanations concise but thorough
- Use examples to illustrate complex concepts
- Highlight potential pitfalls and how to avoid them

**Interactive Engagement Protocol:**
When the candidate asks you to implement something, follow this pattern:

1. **Clarify First** (unless requirements are crystal clear):
   - "Before I write this, a few questions..."
   - "What should happen if [edge case]?"
   - "Are there any constraints I should know about (performance, memory, existing patterns)?"

2. **Present Options** (for non-trivial implementations):
   - "I see a few ways to approach this:"
   - "**Option A:** [Brief description] - [Key tradeoff/benefit]"
   - "**Option B:** [Brief description] - [Key tradeoff/benefit]"
   - "Which direction fits your needs, or do you have another approach in mind?"

3. **Confirm Before Writing**:
   - "I'll go with [chosen approach]. Sound good?"
   - Then implement after confirmation

4. **Collaborate on Results**:
   - After tests: "We have X passing, Y failing. The failures look like [pattern]. What do you think is causing this?"
   - After errors: "This error suggests [diagnosis]. What would you like to try first?"

**Skip this protocol when:**
- Candidate explicitly says "just write it" or "go ahead and implement"
- The task is purely mechanical (fix typo, add import, format code)
- Candidate has already made the decision clear in their request

**Goal:** Every interaction should reveal something about the candidate's thinking. Their choices, questions, and reasoning are as valuable as the final code.

Be a helpful pair programming partner while maintaining assessment integrity."""

    if problem_statement:
        prompt += f"\n\n**Current Problem:**\n{problem_statement}"

    return prompt


# =============================================================================
# Middleware: Model Selection with Caching
# =============================================================================

def _create_anthropic_model(model_name: str) -> ChatAnthropic:
    """Create Anthropic model with prompt caching configuration.

    Uses BOTH betas param AND default_headers for caching.
    Reference: TheBlueOne model_selection.py
    """
    default_headers = {}
    beta_versions = []

    if settings.enable_prompt_caching:
        beta_versions = ["prompt-caching-2024-07-31"]
        default_headers["anthropic-beta"] = ",".join(beta_versions)

    return ChatAnthropic(
        model_name=model_name,
        max_tokens=32000,
        betas=beta_versions,
        streaming=settings.enable_code_streaming,
        default_headers=default_headers,
        api_key=settings.anthropic_api_key,
    )


@wrap_model_call
async def model_selection_middleware(request: ModelRequest, handler) -> ModelResponse:
    """Middleware that selects the appropriate model and converts tools.

    This middleware:
    1. Creates the Anthropic model with caching headers
    2. Converts tools to Anthropic format
    3. Binds tools to the model
    """
    # Create model with caching support
    model = _create_anthropic_model(settings.coding_agent_model)

    # Convert tools to Anthropic format (without cache_control yet)
    if request.tools:
        converted_tools = []
        for tool in request.tools:
            try:
                anthropic_tool = convert_to_anthropic_tool(tool)
                converted_tools.append(anthropic_tool)
            except Exception as e:
                print(f"[ModelSelection] Warning: Failed to convert tool: {e}")
                converted_tools.append(tool)

        # Bind converted tools to model
        model = model.bind_tools(converted_tools)

    # Replace model in request
    request.model = model

    return await handler(request)


# =============================================================================
# Middleware: Anthropic Caching
# =============================================================================

@wrap_model_call
async def anthropic_caching_middleware(request: ModelRequest, handler) -> ModelResponse:
    """Add cache_control to system prompt and messages.

    IMPORTANT: Anthropic limits to 4 cache_control blocks maximum.
    We use 2 strategically:
    - Breakpoint 1: System prompt (caches prompt + tools as prefix)
    - Breakpoint 2: Last message (caches entire conversation)
    """
    if not settings.enable_prompt_caching:
        return await handler(request)

    cache_control = {"type": "ephemeral"}

    # First, REMOVE any existing cache_control from all messages to avoid accumulation
    if request.messages:
        for msg in request.messages:
            if hasattr(msg, 'content') and isinstance(msg.content, list):
                for block in msg.content:
                    if isinstance(block, dict) and "cache_control" in block:
                        del block["cache_control"]

    # 1. Add cache_control to system prompt's LAST block
    if request.system_prompt:
        if isinstance(request.system_prompt, str):
            request.system_prompt = [
                {
                    "type": "text",
                    "text": request.system_prompt,
                    "cache_control": cache_control,
                }
            ]
        elif isinstance(request.system_prompt, list) and len(request.system_prompt) > 0:
            # Remove existing cache_control from all blocks first
            for block in request.system_prompt:
                if isinstance(block, dict) and "cache_control" in block:
                    del block["cache_control"]
            # Add to last block only
            last_block = request.system_prompt[-1]
            if isinstance(last_block, dict):
                last_block["cache_control"] = cache_control
            elif isinstance(last_block, str):
                request.system_prompt[-1] = {
                    "type": "text",
                    "text": last_block,
                    "cache_control": cache_control,
                }

    # 2. Add cache_control to the LAST message ONLY to cache entire conversation
    # Skip tools caching to stay under 4 block limit
    if request.messages and len(request.messages) > 0:
        message = request.messages[-1]
        if hasattr(message, 'content'):
            if isinstance(message.content, str):
                message.content = [
                    {
                        "type": "text",
                        "text": message.content,
                        "cache_control": cache_control,
                    }
                ]
            elif isinstance(message.content, list) and len(message.content) > 0:
                last_block = message.content[-1]
                if isinstance(last_block, dict):
                    last_block["cache_control"] = cache_control
                elif isinstance(last_block, str):
                    message.content[-1] = {
                        "type": "text",
                        "text": last_block,
                        "cache_control": cache_control,
                    }

    return await handler(request)


# =============================================================================
# Agent Factory
# =============================================================================

def create_coding_agent_graph(
    helpfulness_level: str = "pair-programming",
    problem_statement: str | None = None,
    tech_stack: list[str] | None = None,
    use_checkpointing: bool = True,
):
    """Create the Coding Agent using LangGraph v1's create_agent.

    Uses native middleware support for Anthropic prompt caching.

    Args:
        helpfulness_level: The helpfulness mode (consultant, pair-programming, full-copilot)
        problem_statement: The current problem/question
        tech_stack: List of required technologies (e.g., ["Python", "FastAPI", "PostgreSQL"])
        use_checkpointing: Whether to enable memory checkpointing
    """
    # Get tools for helpfulness level
    tools = CODING_TOOLS.get(helpfulness_level, CODING_TOOLS["pair-programming"])

    # Build system prompt with tech stack enforcement
    system_prompt = build_system_prompt(helpfulness_level, problem_statement, tech_stack)

    # Create default model (will be replaced by middleware)
    model = _create_anthropic_model(settings.coding_agent_model)

    # Build middleware list
    # Order matters: summarization -> system_prompt -> model_selection -> caching (caching MUST be last)
    # IMPORTANT: system_prompt_middleware MUST run AFTER summarization_middleware
    # because summarization can re-introduce system messages from recent_messages
    middleware = [
        SummarizationMiddleware(),     # Summarize long conversations (persists to state)
        system_prompt_middleware,      # Deduplicate system messages AFTER summarization
        model_selection_middleware,    # Select model and convert tools
        anthropic_caching_middleware,  # Add cache_control (MUST run LAST)
    ]

    # Agent configuration
    agent_kwargs = {
        "model": model,
        "tools": tools,
        "system_prompt": system_prompt,
        "middleware": middleware,
        "state_schema": CodingAgentState,
        "context_schema": CodingAgentContext,
    }

    # Add checkpointing
    if use_checkpointing:
        agent_kwargs["checkpointer"] = MemorySaver()

    return create_agent(**agent_kwargs)


# =============================================================================
# Wrapper Class for Convenience
# =============================================================================

class CodingAgentGraph:
    """Coding Agent wrapper class for convenient interaction."""

    def __init__(
        self,
        session_id: str,
        candidate_id: str,
        helpfulness_level: str = "pair-programming",
        problem_statement: str | None = None,
        tech_stack: list[str] | None = None,
        workspace_root: str = "/workspace",
    ):
        self.session_id = session_id
        self.candidate_id = candidate_id
        self.helpfulness_level = helpfulness_level
        self.problem_statement = problem_statement
        self.tech_stack = tech_stack
        self.workspace_root = workspace_root

        # Create agent graph with tech stack enforcement
        self.graph = create_coding_agent_graph(
            helpfulness_level=helpfulness_level,
            problem_statement=problem_statement,
            tech_stack=tech_stack,
        )

    async def send_message(self, message: str) -> dict:
        """Send a message to the coding agent."""
        # Use deterministic UUID for consistent thread grouping in LangSmith
        thread_uuid = generate_coding_thread_uuid(self.session_id)
        config = {
            "configurable": {
                "thread_id": thread_uuid,
                "session_id": self.session_id,
            },
            "recursion_limit": 100,  # Increased from default 25 for complex tasks
        }

        # Context for middleware
        context = {
            "session_id": self.session_id,
            "candidate_id": self.candidate_id,
            "helpfulness_level": self.helpfulness_level,
            "problem_statement": self.problem_statement,
        }

        # Invoke with message
        result = await self.graph.ainvoke(
            {"messages": [HumanMessage(content=message)]},
            config=config,
            context=context,
        )

        # Extract response and cache metrics
        messages = result.get("messages", [])
        response_text = ""
        total_cache_creation = 0
        total_cache_read = 0
        total_input_tokens = 0
        total_output_tokens = 0

        for msg in messages:
            if isinstance(msg, AIMessage):
                # Extract text content
                if not response_text:
                    if isinstance(msg.content, str):
                        response_text = msg.content
                    elif isinstance(msg.content, list):
                        for block in msg.content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                response_text = block.get("text", "")
                                break

                # Accumulate cache metrics from all AI messages
                usage_meta = getattr(msg, 'usage_metadata', None)
                if usage_meta:
                    details = usage_meta.get('input_token_details', {})
                    total_cache_creation += details.get('cache_creation', 0)
                    total_cache_read += details.get('cache_read', 0)
                    total_input_tokens += usage_meta.get('input_tokens', 0)
                    total_output_tokens += usage_meta.get('output_tokens', 0)

        files_modified = result.get("files_modified", [])

        # Capture file snapshots for session replay (non-blocking)
        if files_modified:
            capture_file_snapshots(
                candidate_id=self.candidate_id,
                session_id=self.session_id,
                files_modified=files_modified,
            )

        return {
            "text": response_text,
            "tools_used": result.get("tools_used", []),
            "files_modified": files_modified,
            "metadata": {
                "model": settings.coding_agent_model,
                "tool_call_count": result.get("tool_call_count", 0),
                "iteration_count": result.get("iteration_count", 0),
                "cache_creation_input_tokens": total_cache_creation,
                "cache_read_input_tokens": total_cache_read,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
            },
        }

    async def send_message_streaming(
        self,
        message: str,
        callbacks: Optional[StreamingCallbacks] = None,
    ) -> AsyncGenerator[dict, None]:
        """Send a message with streaming response."""
        # Use deterministic UUID for consistent thread grouping in LangSmith
        thread_uuid = generate_coding_thread_uuid(self.session_id)
        config = {
            "configurable": {
                "thread_id": thread_uuid,
                "session_id": self.session_id,
            },
            "recursion_limit": 100,  # Increased from default 25 for complex tasks
        }

        context = {
            "session_id": self.session_id,
            "candidate_id": self.candidate_id,
            "helpfulness_level": self.helpfulness_level,
            "problem_statement": self.problem_statement,
        }

        tools_used = []
        files_modified = []
        full_response = ""

        try:
            async for event in self.graph.astream_events(
                {"messages": [HumanMessage(content=message)]},
                config=config,
                context=context,
                version="v2",
            ):
                event_type = event.get("event")
                data = event.get("data", {})

                if event_type == "on_chat_model_stream":
                    chunk = data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        # Handle content which can be str or list of blocks
                        content = chunk.content
                        if isinstance(content, str):
                            delta = content
                        elif isinstance(content, list):
                            # Extract text from content blocks
                            delta = ""
                            for block in content:
                                if isinstance(block, str):
                                    delta += block
                                elif isinstance(block, dict) and block.get("type") == "text":
                                    delta += block.get("text", "")
                        else:
                            delta = str(content) if content else ""
                        
                        if delta:
                            full_response += delta

                            if callbacks and callbacks.on_text_delta:
                                callbacks.on_text_delta(delta)

                            yield {"type": "text_delta", "delta": delta}

                elif event_type == "on_tool_start":
                    tool_name = event.get("name", "unknown")
                    tool_input = data.get("input", {})
                    tools_used.append(tool_name)

                    if tool_name in ["write_file", "edit_file"]:
                        file_path = tool_input.get("file_path", "")
                        if file_path and file_path not in files_modified:
                            files_modified.append(file_path)

                    if callbacks and callbacks.on_tool_start:
                        callbacks.on_tool_start(tool_name, tool_input)

                    yield {"type": "tool_start", "name": tool_name, "input": tool_input}

                elif event_type == "on_tool_end":
                    tool_name = event.get("name", "unknown")
                    tool_output = data.get("output")

                    if callbacks and callbacks.on_tool_end:
                        callbacks.on_tool_end(tool_name, tool_output)

                    # Extract actual content from LangChain ToolMessage objects
                    # ToolMessage has a .content attribute containing the JSON result
                    output_data = None
                    if tool_output is not None:
                        # Try to get content from ToolMessage-like objects
                        raw_content = getattr(tool_output, 'content', tool_output)

                        # Parse JSON string content to dict for proper frontend handling
                        if isinstance(raw_content, str):
                            try:
                                import json
                                output_data = json.loads(raw_content)
                            except (json.JSONDecodeError, TypeError):
                                output_data = str(raw_content)[:500]
                        elif isinstance(raw_content, dict):
                            output_data = raw_content
                        else:
                            output_data = str(raw_content)[:500]

                    yield {
                        "type": "tool_end",
                        "name": tool_name,
                        "output": output_data,
                    }

            # Capture file snapshots for session replay (non-blocking)
            if files_modified:
                capture_file_snapshots(
                    candidate_id=self.candidate_id,
                    session_id=self.session_id,
                    files_modified=files_modified,
                )

            yield {
                "type": "done",
                "response": {
                    "text": full_response,
                    "tools_used": tools_used,
                    "files_modified": files_modified,
                    "metadata": {"model": settings.coding_agent_model, "streaming": True},
                },
            }

        except Exception as e:
            if callbacks and callbacks.on_error:
                callbacks.on_error(e)
            yield {"type": "error", "error": str(e)}


def create_coding_agent(
    session_id: str,
    candidate_id: str,
    helpfulness_level: str = "pair-programming",
    problem_statement: str | None = None,
    tech_stack: list[str] | None = None,
    workspace_root: str = "/workspace",
) -> CodingAgentGraph:
    """Factory function to create a Coding Agent.

    Args:
        session_id: The interview session ID
        candidate_id: The candidate ID
        helpfulness_level: The helpfulness mode (consultant, pair-programming, full-copilot)
        problem_statement: The current problem/question
        tech_stack: List of required technologies (e.g., ["Python", "FastAPI", "PostgreSQL"])
        workspace_root: The workspace root directory
    """
    return CodingAgentGraph(
        session_id=session_id,
        candidate_id=candidate_id,
        helpfulness_level=helpfulness_level,
        problem_statement=problem_statement,
        tech_stack=tech_stack,
        workspace_root=workspace_root,
    )


# =============================================================================
# Graph Export for LangGraph Cloud
# =============================================================================
# LangGraph Cloud automatically handles checkpointing - do NOT specify checkpointer
# The platform injects its own PostgreSQL-backed checkpointer
#
# This is referenced by langgraph.json as "coding_agent": "./agents/coding_agent.py:graph"

graph = create_coding_agent_graph(
    helpfulness_level="pair-programming",
    use_checkpointing=False,  # Cloud handles this automatically
)

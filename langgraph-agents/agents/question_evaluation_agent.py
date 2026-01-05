"""
Question Evaluation Agent - LangGraph v1 Implementation

Evaluates a single question submission during an interview to determine
if the candidate can proceed to the next question.

Uses 5 criteria (20 points each = 100 total):
1. Problem Completion (20 pts) - Does solution meet requirements?
2. Code Quality (20 pts) - Clean, readable, well-organized?
3. Best Practices (20 pts) - Follows language conventions?
4. Error Handling (20 pts) - Handles edge cases?
5. Efficiency (20 pts) - Reasonably performant?

Uses langchain.agents.create_agent with native middleware support for
Anthropic prompt caching.
"""

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Any, Literal, Optional, cast

from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_anthropic import convert_to_anthropic_tool
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from config import generate_question_eval_thread_uuid, settings
from middleware import SummarizationMiddleware, system_prompt_middleware
from services.model_factory import create_chat_model, create_model_from_context, is_anthropic_model, Provider
from tools.coding_tools import (
    get_environment_info,
    glob_files,
    grep_files,
    list_files,
    read_file,
    run_tests,
)
from tools.evaluation_tools import submit_question_evaluation

# =============================================================================
# State Schema (LangGraph v1 style)
# =============================================================================

class QuestionCriterionScore(TypedDict):
    """Score for a single criterion."""
    score: int  # 0-20
    feedback: str


class QuestionEvaluationCriteria(TypedDict):
    """All evaluation criteria scores."""
    problem_completion: QuestionCriterionScore
    code_quality: QuestionCriterionScore
    best_practices: QuestionCriterionScore
    error_handling: QuestionCriterionScore
    efficiency: QuestionCriterionScore


class QuestionEvaluationResult(TypedDict, total=False):
    """Complete question evaluation result."""
    session_id: str
    candidate_id: str
    question_id: str
    overall_score: int  # 0-100
    passed: bool
    criteria: QuestionEvaluationCriteria
    feedback: str
    strengths: list[str]
    improvements: list[str]
    evaluated_at: str
    model: str


class QuestionEvaluationAgentState(TypedDict, total=False):
    """State for the question evaluation agent."""
    messages: Annotated[list[BaseMessage], add_messages]
    session_id: str
    candidate_id: str
    question_id: str
    question_title: str
    question_description: str
    question_requirements: list[str] | None
    question_difficulty: str
    # Code is optional - agent will discover via tools if not provided
    code: str | None
    language: str
    file_name: str | None
    test_output: str | None
    tests_passed: int | None
    tests_failed: int | None
    passing_threshold: int
    evaluation_result: QuestionEvaluationResult | None
    evaluation_complete: bool


class QuestionEvaluationContext(TypedDict, total=False):
    """Runtime configuration."""
    session_id: str
    candidate_id: str
    question_id: str


# =============================================================================
# Tools for Agent Mode (Read-Only)
# =============================================================================

EVALUATION_TOOLS = [
    read_file,
    list_files,
    run_tests,
    grep_files,
    glob_files,
    get_environment_info,
    submit_question_evaluation,  # REQUIRED: Must call to submit evaluation result
]


# =============================================================================
# System Prompt
# =============================================================================

QUESTION_EVALUATION_PROMPT = """You are a senior software engineer evaluating code submissions for a technical interview.

**Your Role:**
Evaluate the candidate's code solution and provide fair, constructive feedback.

**IMPORTANT: Code Discovery**
Code may NOT be provided inline in the prompt. You have access to tools to discover and read the code:
- `list_files`: Explore /workspace/ to see project structure
- `read_file`: Read solution files (look for solution.*, main.*, index.*, app.*)
- `run_tests`: Execute the test suite
- `grep_files`: Search for patterns in files
- `glob_files`: Find files by pattern

**Workflow:**
1. First, use `list_files` to explore /workspace/
2. Use `read_file` to read the solution file(s)
3. Use `run_tests` to verify the solution works
4. Read test files for additional context
5. **REQUIRED: Call `submit_question_evaluation` tool to submit your evaluation**

**Evaluation Criteria (20 points each, 100 total):**

1. **Problem Completion (20 pts)**
   - Does the solution address all stated requirements?
   - Is it functionally complete?
   - Does it produce correct output?

2. **Code Quality (20 pts)**
   - Is the code clean and readable?
   - Are variables and functions well-named?
   - Is the code well-organized?

3. **Best Practices (20 pts)**
   - Does it follow language conventions?
   - Uses appropriate idioms and patterns?
   - Follows coding standards?

4. **Error Handling (20 pts)**
   - Are edge cases handled?
   - Is there proper input validation?
   - Does it handle errors gracefully?

5. **Efficiency (20 pts)**
   - Is the solution reasonably performant?
   - Are there obvious inefficiencies?
   - Is the time/space complexity acceptable?

**Code Quality Standards:**
- Clean, readable code with meaningful names
- Appropriate error handling for edge cases
- Following language conventions
- Consider time complexity: O(n), O(n log n) preferred
- Handle edge cases: empty inputs, nulls, large inputs

**Algorithm Patterns to Consider:**
- Two Pointers: Sorted arrays, palindromes
- Sliding Window: Subarrays, substrings
- Binary Search: Sorted data, optimization
- Dynamic Programming: Overlapping subproblems
- BFS/DFS: Graphs, trees

**CRITICAL: Submitting Your Evaluation**
You MUST call the `submit_question_evaluation` tool to submit your results.
The evaluation is NOT complete until you call this tool.

The tool accepts:
- overall_score: Total score (0-100)
- problem_completion_score/feedback: Score 0-20 and feedback
- code_quality_score/feedback: Score 0-20 and feedback
- best_practices_score/feedback: Score 0-20 and feedback
- error_handling_score/feedback: Score 0-20 and feedback
- efficiency_score/feedback: Score 0-20 and feedback
- feedback: Overall feedback paragraph
- strengths: List of 2-3 key strengths
- improvements: List of 2-3 areas for improvement

Be honest, constructive, and fair. Be critical but encouraging."""


# =============================================================================
# Middleware: Model Selection with Multi-Provider Support
# =============================================================================

# Store context for middleware access
_current_context: dict = {}


def set_model_context(context: dict) -> None:
    """Set the current context for model selection middleware."""
    global _current_context
    _current_context = context or {}


@wrap_model_call  # type: ignore[arg-type]
async def model_selection_middleware(request: ModelRequest, handler) -> ModelResponse:
    """Middleware that selects the appropriate model and converts tools.

    Supports multiple LLM providers with per-request override via context.
    """
    global _current_context

    model = create_model_from_context(
        context=_current_context,
        default_provider=cast(Provider, settings.evaluation_agent_provider),
        default_model=settings.evaluation_agent_model,
        temperature=0.3,
        max_tokens=32000,
    )

    if request.tools:
        if is_anthropic_model(model):
            converted_tools = []
            for tool in request.tools:
                try:
                    anthropic_tool = convert_to_anthropic_tool(tool)
                    converted_tools.append(anthropic_tool)  # type: ignore[arg-type,unused-ignore]
                except Exception:
                    converted_tools.append(tool)  # type: ignore[arg-type]
            model = model.bind_tools(converted_tools)  # type: ignore[arg-type,assignment]
        else:
            model = model.bind_tools(request.tools)  # type: ignore[assignment]

    request.model = model
    return cast(ModelResponse, await handler(request))


@wrap_model_call  # type: ignore[arg-type]
async def anthropic_caching_middleware(request: ModelRequest, handler) -> ModelResponse:
    """Add cache_control to system prompt, tools, and messages."""
    if not settings.enable_prompt_caching:
        return cast(ModelResponse, await handler(request))

    cache_control = {"type": "ephemeral"}

    # Cache system prompt
    if request.system_prompt:
        if isinstance(request.system_prompt, str):
            request.system_prompt = [  # type: ignore[assignment,misc]
                {"type": "text", "text": request.system_prompt, "cache_control": cache_control}
            ]
        elif isinstance(request.system_prompt, list) and len(request.system_prompt) > 0:
            last_block = request.system_prompt[-1]
            if isinstance(last_block, dict):
                last_block["cache_control"] = cache_control

    # Cache last tool
    if request.tools and len(request.tools) > 0:
        last_tool = request.tools[-1]
        if isinstance(last_tool, dict):
            last_tool["cache_control"] = cache_control

    return cast(ModelResponse, await handler(request))


# =============================================================================
# JSON Parsing
# =============================================================================

def parse_evaluation_json(response_text: str) -> dict | None:
    """Parse JSON from response text, handling various formats."""
    # Check for FINAL_EVALUATION marker
    if "FINAL_EVALUATION:" in response_text:
        response_text = response_text.split("FINAL_EVALUATION:", 1)[1]

    # Extract JSON from response
    json_text = response_text
    if "```json" in json_text:
        json_text = json_text.split("```json")[1].split("```")[0]
    elif "```" in json_text:
        parts = json_text.split("```")
        for part in parts:
            if "{" in part and "overallScore" in part:
                json_text = part
                break

    # Find JSON object
    start_idx = json_text.find("{")
    end_idx = json_text.rfind("}") + 1
    if start_idx != -1 and end_idx > start_idx:
        json_text = json_text[start_idx:end_idx]
        try:
            return cast(dict[Any, Any] | None, json.loads(json_text))
        except json.JSONDecodeError:
            return None
    return None


def build_evaluation_result(
    session_id: str,
    candidate_id: str,
    question_id: str,
    ai_result: dict,
    passing_threshold: int = 70,
) -> QuestionEvaluationResult:
    """Build the evaluation result from AI response."""
    criteria = ai_result.get("criteria", {})
    overall_score = ai_result.get("overallScore", 0)

    # Ensure overall score is sum of criteria if not provided
    if not overall_score:
        overall_score = sum([
            criteria.get("problemCompletion", {}).get("score", 0),
            criteria.get("codeQuality", {}).get("score", 0),
            criteria.get("bestPractices", {}).get("score", 0),
            criteria.get("errorHandling", {}).get("score", 0),
            criteria.get("efficiency", {}).get("score", 0),
        ])

    passed = overall_score >= passing_threshold

    return QuestionEvaluationResult(
        session_id=session_id,
        candidate_id=candidate_id,
        question_id=question_id,
        overall_score=overall_score,
        passed=passed,
        criteria=QuestionEvaluationCriteria(
            problem_completion=QuestionCriterionScore(
                score=criteria.get("problemCompletion", {}).get("score", 0),
                feedback=criteria.get("problemCompletion", {}).get("feedback", ""),
            ),
            code_quality=QuestionCriterionScore(
                score=criteria.get("codeQuality", {}).get("score", 0),
                feedback=criteria.get("codeQuality", {}).get("feedback", ""),
            ),
            best_practices=QuestionCriterionScore(
                score=criteria.get("bestPractices", {}).get("score", 0),
                feedback=criteria.get("bestPractices", {}).get("feedback", ""),
            ),
            error_handling=QuestionCriterionScore(
                score=criteria.get("errorHandling", {}).get("score", 0),
                feedback=criteria.get("errorHandling", {}).get("feedback", ""),
            ),
            efficiency=QuestionCriterionScore(
                score=criteria.get("efficiency", {}).get("score", 0),
                feedback=criteria.get("efficiency", {}).get("feedback", ""),
            ),
        ),
        feedback=ai_result.get("feedback", ""),
        strengths=ai_result.get("strengths", []),
        improvements=ai_result.get("improvements", []),
        evaluated_at=datetime.utcnow().isoformat(),
        model=settings.evaluation_agent_model,
    )


# =============================================================================
# Agent Factory
# =============================================================================

def create_question_evaluation_agent_graph(
    use_agent_mode: bool = False,
    use_checkpointing: bool = True,
):
    """
    Create the Question Evaluation Agent using LangGraph v1's create_agent.

    The agent uses the submit_question_evaluation tool to store evaluation
    results directly in state via the Command return type. No post-processing
    node is needed.

    Args:
        use_agent_mode: If True, include file exploration tools (read_file, list_files, etc.)
        use_checkpointing: If True, use MemorySaver for checkpointing

    Returns:
        Compiled agent graph
    """
    # Create default model (will be replaced by middleware based on context)
    model = create_chat_model(
        provider=cast(Provider, settings.evaluation_agent_provider),
        model=settings.evaluation_agent_model,
        temperature=0.3,
        max_tokens=32000,
    )

    middleware = [
        SummarizationMiddleware(model_name="claude-haiku-4-5-20251001"),  # Summarize long conversations (persists to state)
        system_prompt_middleware,      # Remove SystemMessages from persistence
        model_selection_middleware,
        anthropic_caching_middleware,
    ]

    # Always include tools - submit_question_evaluation is required
    # In non-agent mode, we still need the submission tool
    tools = EVALUATION_TOOLS if use_agent_mode else [submit_question_evaluation]

    agent_kwargs = {
        "model": model,
        "tools": tools,
        "system_prompt": QUESTION_EVALUATION_PROMPT,
        "middleware": middleware,
        "state_schema": QuestionEvaluationAgentState,
        "context_schema": QuestionEvaluationContext,
    }

    if use_checkpointing:
        agent_kwargs["checkpointer"] = MemorySaver()

    return create_agent(**agent_kwargs)  # type: ignore[arg-type]


# =============================================================================
# Wrapper Class
# =============================================================================

class QuestionEvaluationAgentGraph:
    """
    Question Evaluation Agent wrapper class.

    Provides two modes:
    1. Simple mode (default): Fast single-shot evaluation
    2. Agent mode: Claude Code-like evaluation with tools
    """

    def __init__(self, checkpointer=None, use_agent_mode: bool = False):
        """Initialize the Question Evaluation Agent."""
        self.use_agent_mode = use_agent_mode
        self.graph = create_question_evaluation_agent_graph(
            use_agent_mode=use_agent_mode,
            use_checkpointing=checkpointer is not None,
        )

    def _build_evaluation_prompt(
        self,
        question_title: str,
        question_description: str,
        question_difficulty: str,
        question_requirements: list[str] | None,
        code: str | None,
        language: str,
        file_name: str | None = None,
        test_output: str | None = None,
        tests_passed: int | None = None,
        tests_failed: int | None = None,
    ) -> str:
        """Build the evaluation prompt."""
        requirements_text = ""
        if question_requirements:
            requirements_text = "\n- " + "\n- ".join(question_requirements)
        else:
            requirements_text = "Complete the given task"

        test_info = ""
        if test_output:
            test_info = f"""
**Test Results:**
- Passed: {tests_passed or 0}
- Failed: {tests_failed or 0}

Test Output:
```
{test_output[:2000]}
```
"""

        # Determine file extension for hints
        language_extensions = {
            "javascript": "js",
            "typescript": "ts",
            "python": "py",
            "go": "go",
            "node.js": "js",
        }
        ext = language_extensions.get(language, "js")

        # If code is provided inline (backwards compatibility), include it
        # Otherwise, instruct agent to discover via tools
        if code and code.strip():
            code_section = f"""**Candidate's Code (provided inline for reference):**
```{language}
{code}
```

Note: The code is also available in the workspace. Use tools to explore additional files."""
        else:
            file_hint = f"\n**Primary File:** {file_name}" if file_name else ""
            code_section = f"""**Workspace:** The candidate's solution is in the Modal sandbox at /workspace/
**Language:** {language}
**Expected Files:** Look for solution files (e.g., solution.{ext}, main.{ext}, index.{ext}, app.{ext}, or *.{ext}){file_hint}

The code is NOT provided inline - you MUST use tools to read it."""

        return f"""Evaluate this code solution for a technical interview.

**Question:** {question_title}
**Difficulty:** {question_difficulty}
**Description:** {question_description}

**Requirements:**
{requirements_text}

{code_section}
{test_info}
**IMPORTANT:** Code may NOT be provided inline. You MUST use tools to discover and read it.

Before evaluating, you MUST:
1. Use `list_files` to explore /workspace/ and understand the project structure
2. Use `read_file` to read the solution file(s) - look for common names like solution.{ext}, main.{ext}
3. Use `run_tests` to verify the solution works
4. Read test files for additional context

Evaluate the code on these 5 criteria (20 points each, 100 total):

1. **Problem Completion (20 pts)**: Does the solution address all stated requirements?
2. **Code Quality (20 pts)**: Is the code clean, readable, well-organized?
3. **Best Practices (20 pts)**: Does it follow {language} conventions?
4. **Error Handling (20 pts)**: Are edge cases handled?
5. **Efficiency (20 pts)**: Is the solution reasonably performant?

Provide honest, constructive feedback.

**CRITICAL: You MUST call `submit_question_evaluation` to submit your evaluation.**
The evaluation is NOT complete until you call this tool with all scores and feedback."""

    async def evaluate_question(
        self,
        session_id: str,
        candidate_id: str,
        question_id: str,
        question_title: str,
        question_description: str,
        question_difficulty: str,
        language: str,
        code: str | None = None,
        question_requirements: list[str] | None = None,
        file_name: str | None = None,
        test_output: str | None = None,
        tests_passed: int | None = None,
        tests_failed: int | None = None,
        passing_threshold: int = 70,
    ) -> QuestionEvaluationResult:
        """
        Evaluate a single question submission.

        Args:
            session_id: Session identifier
            candidate_id: Candidate identifier
            question_id: Question identifier
            question_title: Title of the question
            question_description: Description of the question
            question_difficulty: Difficulty level
            language: Programming language
            code: Optional - The candidate's code. If not provided, agent discovers via tools.
            question_requirements: Optional list of requirements
            file_name: Optional hint for primary solution file
            test_output: Optional test output
            tests_passed: Optional count of passed tests
            tests_failed: Optional count of failed tests
            passing_threshold: Score needed to pass (default 70)

        Returns:
            QuestionEvaluationResult with scores and feedback
        """
        evaluation_prompt = self._build_evaluation_prompt(
            question_title=question_title,
            question_description=question_description,
            question_difficulty=question_difficulty,
            question_requirements=question_requirements,
            code=code,
            language=language,
            file_name=file_name,
            test_output=test_output,
            tests_passed=tests_passed,
            tests_failed=tests_failed,
        )

        # Use deterministic UUID for consistent thread grouping in LangSmith
        thread_uuid = generate_question_eval_thread_uuid(session_id, question_id)
        config = {
            "configurable": {
                "thread_id": thread_uuid,
            }
        }

        context = {
            "session_id": session_id,
            "candidate_id": candidate_id,
            "question_id": question_id,
        }

        result = await self.graph.ainvoke(
            {"messages": [HumanMessage(content=evaluation_prompt)]},
            config=config,
            context=context,
        )

        # Get evaluation result from state (set by submit_question_evaluation tool)
        evaluation_result = result.get("evaluation_result")

        if evaluation_result:
            # Add session metadata to result
            evaluation_result["session_id"] = session_id
            evaluation_result["candidate_id"] = candidate_id
            evaluation_result["question_id"] = question_id

            # Apply passing threshold
            if "passed" not in evaluation_result:
                evaluation_result["passed"] = evaluation_result.get("overall_score", 0) >= passing_threshold

            return cast(QuestionEvaluationResult, evaluation_result)

        # Fallback: Try to parse from messages (backwards compatibility)
        messages = result.get("messages", [])
        response_text = ""
        for msg in messages:
            if isinstance(msg, AIMessage):
                if isinstance(msg.content, str):
                    response_text = msg.content
                elif isinstance(msg.content, list):
                    for block in msg.content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            response_text = block.get("text", "")
                            break
                break

        ai_result = parse_evaluation_json(response_text)

        if ai_result:
            return build_evaluation_result(
                session_id=session_id,
                candidate_id=candidate_id,
                question_id=question_id,
                ai_result=ai_result,
                passing_threshold=passing_threshold,
            )

        # Final fallback - return error result
        return QuestionEvaluationResult(
            session_id=session_id,
            candidate_id=candidate_id,
            question_id=question_id,
            overall_score=0,
            passed=False,
            criteria=QuestionEvaluationCriteria(
                problem_completion=QuestionCriterionScore(score=0, feedback="Evaluation failed - no result returned"),
                code_quality=QuestionCriterionScore(score=0, feedback=""),
                best_practices=QuestionCriterionScore(score=0, feedback=""),
                error_handling=QuestionCriterionScore(score=0, feedback=""),
                efficiency=QuestionCriterionScore(score=0, feedback=""),
            ),
            feedback="Agent did not call submit_question_evaluation tool",
            strengths=[],
            improvements=[],
            evaluated_at=datetime.utcnow().isoformat(),
            model=settings.evaluation_agent_model,
        )


def create_question_evaluation_agent(
    checkpointer=None,
    use_agent_mode: bool = False,
) -> QuestionEvaluationAgentGraph:
    """Factory function to create a Question Evaluation Agent."""
    return QuestionEvaluationAgentGraph(
        checkpointer=checkpointer,
        use_agent_mode=use_agent_mode,
    )


# =============================================================================
# Graph Export for LangGraph Cloud
# =============================================================================
# LangGraph Cloud automatically handles checkpointing - do NOT specify checkpointer
# The platform injects its own PostgreSQL-backed checkpointer

question_evaluation_graph = create_question_evaluation_agent_graph(
    use_agent_mode=True,  # Enable tools for file exploration (list_files, read_file, run_tests, etc.)
    use_checkpointing=False,
)

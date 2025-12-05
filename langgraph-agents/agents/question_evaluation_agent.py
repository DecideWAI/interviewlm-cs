"""
Question Evaluation Agent - LangGraph Implementation

Evaluates a single question submission during an interview to determine
if the candidate can proceed to the next question.

Uses 5 criteria (20 points each = 100 total):
1. Problem Completion (20 pts) - Does solution meet requirements?
2. Code Quality (20 pts) - Clean, readable, well-organized?
3. Best Practices (20 pts) - Follows language conventions?
4. Error Handling (20 pts) - Handles edge cases?
5. Efficiency (20 pts) - Reasonably performant?

This agent has optional "Claude Code" capabilities - it can use sandbox
tools to read files, run tests, and gather context before evaluating.
This makes it a proper agent rather than a simple API call.

This is different from the EvaluationAgent which evaluates entire sessions
after completion with 4 dimensions.
"""

import json
from typing import Literal
from datetime import datetime
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode

from ..models.state import (
    QuestionEvaluationAgentState,
    QuestionEvaluationResult,
    QuestionEvaluationCriteria,
    QuestionCriterionScore,
)
from ..tools.coding_tools import (
    read_file,
    list_files,
    run_tests,
    grep_files,
    glob_files,
    get_environment_info,
)
from ..config import settings


# =============================================================================
# Claude Code Tools for Evaluation (READ-ONLY)
# =============================================================================

# Tools available to the evaluation agent for gathering context
# NOTE: Evaluation agent should NOT have write access - read-only tools only
EVALUATION_TOOLS = [
    read_file,           # Read file contents
    list_files,          # List directory contents
    run_tests,           # Run test suite (read-only operation)
    grep_files,          # Search for patterns in files
    glob_files,          # Find files by pattern
    get_environment_info,  # Get environment details
    # Explicitly NOT included: write_file, edit_file, run_bash, install_packages
]


# =============================================================================
# Prompts
# =============================================================================

AGENT_SYSTEM_PROMPT = """You are a senior software engineer evaluating code submissions for a technical interview.

You have access to tools that let you interact with the candidate's workspace:
- **read_file**: Read files from the workspace (requires session_id parameter)
- **list_files**: List files in the workspace (requires session_id parameter)
- **run_tests**: Run the test suite (requires session_id parameter)
- **grep_files**: Search for patterns in files (requires session_id parameter)

Your workflow:
1. If the sandbox is available (session_id provided), use tools to:
   - Run tests to see if the solution passes
   - Read any additional files for context (e.g., test files, config files)
   - Understand the full solution structure
2. After gathering context (or if no tools available), provide your evaluation.

When you're ready to submit your final evaluation, output JSON with the evaluation results.

Be honest, constructive, and fair. Be critical but encouraging.
Focus on what the code does well and what could be improved.

You must evaluate on these 5 criteria (20 points each, 100 total):

1. **Problem Completion (20 pts)**: Does the solution address all stated requirements? Is it functionally complete?
2. **Code Quality (20 pts)**: Is the code clean, readable, well-organized, and properly named?
3. **Best Practices (20 pts)**: Does it follow language conventions, idioms, and design patterns?
4. **Error Handling (20 pts)**: Are edge cases handled? Is there proper validation and error management?
5. **Efficiency (20 pts)**: Is the solution reasonably performant? Are there obvious inefficiencies?

IMPORTANT: When you're ready to submit the final evaluation, start your response with "FINAL_EVALUATION:" followed by the JSON."""

EVALUATION_SYSTEM_PROMPT = """You are a senior software engineer evaluating code submissions for a technical interview.

Your role is to provide honest, constructive, and fair evaluations. Be critical but encouraging.
Focus on what the code does well and what could be improved.

You must evaluate on these 5 criteria (20 points each, 100 total):

1. **Problem Completion (20 pts)**: Does the solution address all stated requirements? Is it functionally complete?
2. **Code Quality (20 pts)**: Is the code clean, readable, well-organized, and properly named?
3. **Best Practices (20 pts)**: Does it follow language conventions, idioms, and design patterns?
4. **Error Handling (20 pts)**: Are edge cases handled? Is there proper validation and error management?
5. **Efficiency (20 pts)**: Is the solution reasonably performant? Are there obvious inefficiencies?

Return your evaluation as JSON only (no markdown code blocks)."""


def build_evaluation_prompt(state: QuestionEvaluationAgentState, include_tool_instructions: bool = False) -> str:
    """Build the evaluation prompt from state."""
    requirements_text = ""
    if state.get("question_requirements"):
        requirements_text = "\n- " + "\n- ".join(state["question_requirements"])
    else:
        requirements_text = "Complete the given task"

    test_info = ""
    if state.get("test_output"):
        test_info = f"""
**Test Results:**
- Passed: {state.get('tests_passed', 0)}
- Failed: {state.get('tests_failed', 0)}

Test Output:
```
{state['test_output'][:2000]}
```
"""

    tool_instructions = ""
    if include_tool_instructions:
        tool_instructions = f"""

**Session ID for tools:** {state['session_id']}

Before evaluating, you should:
1. Run the tests using `run_tests(session_id="{state['session_id']}")` to verify the solution works
2. List files to understand the project structure: `list_files(session_id="{state['session_id']}")`
3. Read any test files for additional context

After gathering information, provide your FINAL_EVALUATION: followed by the JSON.
"""

    final_instruction = """
When ready, respond with FINAL_EVALUATION: followed by ONLY valid JSON:
{
  "overallScore": <0-100 total>,
  "criteria": {
    "problemCompletion": { "score": <0-20>, "feedback": "<specific feedback>" },
    "codeQuality": { "score": <0-20>, "feedback": "<specific feedback>" },
    "bestPractices": { "score": <0-20>, "feedback": "<specific feedback>" },
    "errorHandling": { "score": <0-20>, "feedback": "<specific feedback>" },
    "efficiency": { "score": <0-20>, "feedback": "<specific feedback>" }
  },
  "feedback": "<overall feedback paragraph>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<improvement 1>", "<improvement 2>"]
}""" if include_tool_instructions else """
Return ONLY valid JSON (no markdown code blocks):
{
  "overallScore": <0-100 total>,
  "criteria": {
    "problemCompletion": { "score": <0-20>, "feedback": "<specific feedback>" },
    "codeQuality": { "score": <0-20>, "feedback": "<specific feedback>" },
    "bestPractices": { "score": <0-20>, "feedback": "<specific feedback>" },
    "errorHandling": { "score": <0-20>, "feedback": "<specific feedback>" },
    "efficiency": { "score": <0-20>, "feedback": "<specific feedback>" }
  },
  "feedback": "<overall feedback paragraph>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<improvement 1>", "<improvement 2>"]
}"""

    return f"""Evaluate this code solution for a technical interview.

**Question:** {state['question_title']}
**Difficulty:** {state.get('question_difficulty', 'Medium')}
**Description:** {state['question_description']}

**Requirements:**
{requirements_text}

**Candidate's Code ({state['language']}):**
```{state['language']}
{state['code']}
```
{test_info}{tool_instructions}
Evaluate the code on these 5 criteria (20 points each, 100 total):

1. **Problem Completion (20 pts)**: Does the solution address all stated requirements? Is it functionally complete?
2. **Code Quality (20 pts)**: Is the code clean, readable, well-organized, and properly named?
3. **Best Practices (20 pts)**: Does it follow {state['language']} conventions, idioms, and design patterns?
4. **Error Handling (20 pts)**: Are edge cases handled? Is there proper validation and error management?
5. **Efficiency (20 pts)**: Is the solution reasonably performant? Are there obvious inefficiencies?

Provide honest, constructive feedback. Be critical but fair.
{final_instruction}"""


# =============================================================================
# Helper Functions
# =============================================================================

def parse_evaluation_json(response_text: str) -> dict | None:
    """Parse JSON from response text, handling various formats."""
    # Check for FINAL_EVALUATION marker
    if "FINAL_EVALUATION:" in response_text:
        response_text = response_text.split("FINAL_EVALUATION:", 1)[1]

    # Extract JSON from response (handle potential markdown wrapping)
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
            return json.loads(json_text)
        except json.JSONDecodeError:
            return None
    return None


def build_evaluation_result(
    state: QuestionEvaluationAgentState,
    ai_result: dict,
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

    threshold = state.get("passing_threshold", 70)
    passed = overall_score >= threshold

    return QuestionEvaluationResult(
        session_id=state["session_id"],
        candidate_id=state["candidate_id"],
        question_id=state["question_id"],
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
# Node Functions - Simple Mode (no tools)
# =============================================================================

async def evaluate_code(state: QuestionEvaluationAgentState) -> dict:
    """
    Simple evaluation node - evaluates the code using Claude without tools.

    This is a single-shot evaluation that assesses all 5 criteria at once.
    Used when no sandbox access is needed (code provided directly).
    """
    llm = ChatAnthropic(
        model=settings.evaluation_agent_model,
        temperature=0.3,  # Slightly deterministic for consistent scoring
        max_tokens=2048,
    )

    messages = [
        SystemMessage(content=EVALUATION_SYSTEM_PROMPT),
        HumanMessage(content=build_evaluation_prompt(state)),
    ]

    response = await llm.ainvoke(messages)
    response_text = response.content

    ai_result = parse_evaluation_json(response_text)

    if not ai_result:
        return {
            "evaluation_result": QuestionEvaluationResult(
                session_id=state["session_id"],
                candidate_id=state["candidate_id"],
                question_id=state["question_id"],
                overall_score=0,
                passed=False,
                criteria=QuestionEvaluationCriteria(
                    problem_completion=QuestionCriterionScore(score=0, feedback="Evaluation failed: Could not parse response"),
                    code_quality=QuestionCriterionScore(score=0, feedback=""),
                    best_practices=QuestionCriterionScore(score=0, feedback=""),
                    error_handling=QuestionCriterionScore(score=0, feedback=""),
                    efficiency=QuestionCriterionScore(score=0, feedback=""),
                ),
                feedback="Evaluation parsing error",
                strengths=[],
                improvements=[],
                evaluated_at=datetime.utcnow().isoformat(),
                model=settings.evaluation_agent_model,
            ),
            "evaluation_complete": True,
        }

    return {
        "evaluation_result": build_evaluation_result(state, ai_result),
        "evaluation_complete": True,
    }


# =============================================================================
# Node Functions - Agent Mode (with Claude Code tools)
# =============================================================================

async def agent_evaluate(state: QuestionEvaluationAgentState) -> dict:
    """
    Agent evaluation node - uses Claude with tools to gather context.

    This node can:
    1. Run tests in the sandbox
    2. Read additional files for context
    3. Then provide a comprehensive evaluation

    This is the "Claude Code" mode that makes the agent more intelligent.
    """
    llm = ChatAnthropic(
        model=settings.evaluation_agent_model,
        temperature=0.3,
        max_tokens=4096,
    ).bind_tools(EVALUATION_TOOLS)

    # Build initial message
    initial_prompt = build_evaluation_prompt(state, include_tool_instructions=True)

    # Get existing messages or start fresh
    messages = list(state.get("messages", []))
    if not messages:
        messages = [
            SystemMessage(content=AGENT_SYSTEM_PROMPT),
            HumanMessage(content=initial_prompt),
        ]

    response = await llm.ainvoke(messages)

    # Add response to messages
    messages.append(response)

    return {"messages": messages}


def should_continue_agent(state: QuestionEvaluationAgentState) -> Literal["tools", "finalize", "end"]:
    """
    Determine whether to continue the agent loop.

    Returns:
    - "tools": Agent wants to use tools
    - "finalize": Agent provided final evaluation (contains FINAL_EVALUATION)
    - "end": Max iterations reached or error
    """
    messages = state.get("messages", [])
    if not messages:
        return "end"

    last_message = messages[-1]

    # Check if agent has tool calls
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"

    # Check if agent provided final evaluation
    content = last_message.content if hasattr(last_message, "content") else str(last_message)
    if "FINAL_EVALUATION:" in content or ("overallScore" in content and "criteria" in content):
        return "finalize"

    # Check iteration limit (max 5 tool iterations)
    tool_count = sum(1 for m in messages if hasattr(m, "tool_calls") and m.tool_calls)
    if tool_count >= 5:
        return "finalize"

    return "end"


async def finalize_evaluation(state: QuestionEvaluationAgentState) -> dict:
    """
    Finalize the evaluation after agent has gathered context.

    Parses the final evaluation from the agent's response.
    """
    messages = state.get("messages", [])
    if not messages:
        return {"evaluation_complete": True}

    # Find the last message with evaluation
    response_text = ""
    for msg in reversed(messages):
        content = msg.content if hasattr(msg, "content") else str(msg)
        if "FINAL_EVALUATION:" in content or "overallScore" in content:
            response_text = content
            break

    ai_result = parse_evaluation_json(response_text)

    if not ai_result:
        # If parsing failed, request explicit evaluation
        llm = ChatAnthropic(
            model=settings.evaluation_agent_model,
            temperature=0.3,
            max_tokens=2048,
        )

        followup = HumanMessage(content="""Based on your analysis, please provide your FINAL_EVALUATION now.

Return ONLY valid JSON:
{
  "overallScore": <0-100 total>,
  "criteria": {
    "problemCompletion": { "score": <0-20>, "feedback": "<feedback>" },
    "codeQuality": { "score": <0-20>, "feedback": "<feedback>" },
    "bestPractices": { "score": <0-20>, "feedback": "<feedback>" },
    "errorHandling": { "score": <0-20>, "feedback": "<feedback>" },
    "efficiency": { "score": <0-20>, "feedback": "<feedback>" }
  },
  "feedback": "<overall feedback>",
  "strengths": ["<strength>"],
  "improvements": ["<improvement>"]
}""")

        response = await llm.ainvoke(messages + [followup])
        ai_result = parse_evaluation_json(response.content)

    if ai_result:
        return {
            "evaluation_result": build_evaluation_result(state, ai_result),
            "evaluation_complete": True,
        }

    # Fallback error result
    return {
        "evaluation_result": QuestionEvaluationResult(
            session_id=state["session_id"],
            candidate_id=state["candidate_id"],
            question_id=state["question_id"],
            overall_score=0,
            passed=False,
            criteria=QuestionEvaluationCriteria(
                problem_completion=QuestionCriterionScore(score=0, feedback="Agent evaluation failed"),
                code_quality=QuestionCriterionScore(score=0, feedback=""),
                best_practices=QuestionCriterionScore(score=0, feedback=""),
                error_handling=QuestionCriterionScore(score=0, feedback=""),
                efficiency=QuestionCriterionScore(score=0, feedback=""),
            ),
            feedback="The evaluation agent failed to produce valid results",
            strengths=[],
            improvements=[],
            evaluated_at=datetime.utcnow().isoformat(),
            model=settings.evaluation_agent_model,
        ),
        "evaluation_complete": True,
    }


# =============================================================================
# Graph Construction
# =============================================================================

def create_simple_evaluation_graph() -> StateGraph:
    """
    Create a simple evaluation graph (no tools).

    Flow: START -> evaluate_code -> END

    Use this for fast evaluation when code is provided directly
    and no sandbox access is needed.
    """
    workflow = StateGraph(QuestionEvaluationAgentState)
    workflow.add_node("evaluate_code", evaluate_code)
    workflow.add_edge(START, "evaluate_code")
    workflow.add_edge("evaluate_code", END)
    return workflow


def create_agent_evaluation_graph() -> StateGraph:
    """
    Create an agent evaluation graph with Claude Code tools.

    Flow:
    START -> agent_evaluate -> [tools | finalize | end]
                  ^                |
                  |________________|

    This graph allows the agent to:
    1. Run tests in the sandbox
    2. Read files for context
    3. Search for patterns
    4. Then provide comprehensive evaluation
    """
    workflow = StateGraph(QuestionEvaluationAgentState)

    # Add nodes
    workflow.add_node("agent_evaluate", agent_evaluate)
    workflow.add_node("tools", ToolNode(EVALUATION_TOOLS))
    workflow.add_node("finalize", finalize_evaluation)

    # Add edges
    workflow.add_edge(START, "agent_evaluate")

    # Conditional routing after agent evaluation
    workflow.add_conditional_edges(
        "agent_evaluate",
        should_continue_agent,
        {
            "tools": "tools",
            "finalize": "finalize",
            "end": END,
        }
    )

    # After tools, go back to agent
    workflow.add_edge("tools", "agent_evaluate")

    # After finalize, end
    workflow.add_edge("finalize", END)

    return workflow


class QuestionEvaluationAgentGraph:
    """
    Question Evaluation Agent wrapper class.

    Provides two modes:
    1. Simple mode (default): Fast single-shot evaluation
    2. Agent mode: Claude Code-like evaluation with tools

    The agent mode is useful when you want the evaluator to:
    - Run tests in the sandbox
    - Read additional files for context
    - Make a more informed evaluation
    """

    def __init__(self, checkpointer=None, use_agent_mode: bool = False):
        """
        Initialize the Question Evaluation Agent.

        Args:
            checkpointer: Optional checkpointer for state persistence
            use_agent_mode: If True, use Claude Code agent with tools
        """
        self.use_agent_mode = use_agent_mode

        if use_agent_mode:
            workflow = create_agent_evaluation_graph()
        else:
            workflow = create_simple_evaluation_graph()

        self.checkpointer = checkpointer or MemorySaver()
        self.graph = workflow.compile(checkpointer=self.checkpointer)

    async def evaluate_question(
        self,
        session_id: str,
        candidate_id: str,
        question_id: str,
        question_title: str,
        question_description: str,
        question_difficulty: str,
        code: str,
        language: str,
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
            session_id: Session identifier (also used for sandbox access in agent mode)
            candidate_id: Candidate identifier
            question_id: Question identifier
            question_title: Title of the question
            question_description: Description of the question
            question_difficulty: Difficulty level (easy/medium/hard)
            code: The candidate's code submission
            language: Programming language
            question_requirements: Optional list of requirements
            file_name: Optional file name
            test_output: Optional test output from sandbox (skips running tests if provided)
            tests_passed: Optional count of passed tests
            tests_failed: Optional count of failed tests
            passing_threshold: Score needed to pass (default 70)

        Returns:
            QuestionEvaluationResult with scores and feedback
        """
        initial_state: QuestionEvaluationAgentState = {
            "messages": [],
            "session_id": session_id,
            "candidate_id": candidate_id,
            "question_id": question_id,
            "question_title": question_title,
            "question_description": question_description,
            "question_requirements": question_requirements,
            "question_difficulty": question_difficulty,
            "code": code,
            "language": language,
            "file_name": file_name,
            "test_output": test_output,
            "tests_passed": tests_passed,
            "tests_failed": tests_failed,
            "passing_threshold": passing_threshold,
            "problem_completion_score": None,
            "code_quality_score": None,
            "best_practices_score": None,
            "error_handling_score": None,
            "efficiency_score": None,
            "evaluation_result": None,
            "evaluation_complete": False,
        }

        config = {"configurable": {"thread_id": f"qeval-{session_id}-{question_id}"}}

        result = await self.graph.ainvoke(initial_state, config)
        return result["evaluation_result"]


def create_question_evaluation_agent(
    checkpointer=None,
    use_agent_mode: bool = False,
) -> QuestionEvaluationAgentGraph:
    """
    Factory function to create a Question Evaluation Agent.

    Args:
        checkpointer: Optional checkpointer for state persistence
        use_agent_mode: If True, creates agent with Claude Code tools

    Returns:
        QuestionEvaluationAgentGraph instance
    """
    return QuestionEvaluationAgentGraph(
        checkpointer=checkpointer,
        use_agent_mode=use_agent_mode,
    )

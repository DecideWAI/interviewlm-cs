"""
Prompt Builders for Question Generation

Builds prompts for:
1. Dynamic generation - complexity profile based
2. Incremental generation - IRT-based adaptive difficulty
3. Variation generation - create similar but different questions

Ported from: lib/services/dynamic-question-generator.ts and incremental-questions.ts
"""

from typing import Literal

from .irt_engine import CandidateAbilityEstimate, DifficultyTargeting

# =============================================================================
# Helper Functions
# =============================================================================

def format_skill_name(skill: str) -> str:
    """Format skill name for display (snake_case -> Title Case)."""
    return skill.replace("_", " ").title()


def format_domain_name(domain: str) -> str:
    """Format domain name for display (kebab-case -> Title Case)."""
    return domain.replace("-", " ").title()


def get_business_logic_description(level: str) -> str:
    """Get description for business logic complexity level."""
    descriptions = {
        "simple": "Basic operations with straightforward rules (e.g., CRUD with validation)",
        "moderate": "Multi-step processes with some conditional logic (e.g., workflows, state transitions)",
        "complex": "Intricate rules with edge cases and error recovery (e.g., transactions, retry logic)",
        "strategic": "Cross-cutting concerns with architectural implications (e.g., multi-tenant, compliance)",
    }
    return descriptions.get(level, descriptions["moderate"])


AMBIGUITY_DESCRIPTIONS = {
    "clear": "All requirements are clearly specified. Candidate follows spec.",
    "some_decisions": "Most requirements are clear, but candidate makes 1-2 design decisions.",
    "open_ended": "Requirements define goals, candidate designs the approach. Multiple valid solutions exist.",
    "strategic": "High-level goals given, candidate must define scope, approach, and trade-offs.",
}


# =============================================================================
# Dynamic Generation Prompt
# =============================================================================

def build_dynamic_generation_prompt(
    role: str,
    seniority: str,
    assessment_type: Literal["REAL_WORLD", "SYSTEM_DESIGN"],
    tech_stack: list[str],
    domain: str,
    skills: list[str],
    avoid_skills: list[str],
    complexity: dict,
    constraints: dict,
    time_minutes: int,
) -> str:
    """
    Build prompt for dynamic question generation using complexity profile.

    Args:
        role: e.g., 'backend', 'frontend', 'fullstack'
        seniority: e.g., 'junior', 'mid', 'senior'
        assessment_type: 'REAL_WORLD' or 'SYSTEM_DESIGN'
        tech_stack: List of required technologies
        domain: Domain context (e.g., 'e-commerce', 'healthcare')
        skills: Skills to test
        avoid_skills: Skills to avoid
        complexity: Complexity dimensions dict
        constraints: Constraints dict (mustInclude, shouldConsider, bonus)
        time_minutes: Time budget

    Returns:
        Formatted prompt string
    """
    # Format tech stack
    tech_stack_str = ", ".join(tech_stack) if tech_stack else "appropriate technologies"

    # Format skills with readable names
    skills_readable = ", ".join(format_skill_name(s) for s in skills)
    avoid_skills_readable = ", ".join(format_skill_name(s) for s in avoid_skills) if avoid_skills else "none"

    # Get complexity values with defaults
    entity_count_min = complexity.get("entity_count_min", 2)
    entity_count_max = complexity.get("entity_count_max", 4)
    integration_points = complexity.get("integration_points", 1)
    business_logic = complexity.get("business_logic", "moderate")
    ambiguity_level = complexity.get("ambiguity_level", "some_decisions")

    # Get constraints with defaults
    must_include = constraints.get("mustInclude", []) or constraints.get("must_include", [])
    should_consider = constraints.get("shouldConsider", []) or constraints.get("should_consider", [])
    bonus = constraints.get("bonus", [])

    # Assessment type specific instructions
    if assessment_type == "SYSTEM_DESIGN":
        type_instructions = """This is a SYSTEM DESIGN assessment. The candidate should:
- Create a DESIGN.md documenting their architecture decisions
- Define API contracts, data models, and component interactions
- Analyze trade-offs explicitly (consistency vs availability, simplicity vs scalability, etc.)
- Implement CORE components (not everything - focus on demonstrating understanding)
- Consider scalability, reliability, and operational concerns

The problem should require architectural thinking, not just implementation."""
    else:
        type_instructions = f"""This is a REAL WORLD PROBLEM assessment. The candidate should:
- Write production-ready, working code
- Implement complete features end-to-end
- Add proper validation and error handling
- Write clean, maintainable code
- Consider edge cases and failure modes

The problem should feel like a real task from a {seniority}-level {role}'s day-to-day work."""

    return f"""You are an expert technical interviewer creating a coding challenge.

## Target Candidate
- **Role**: {role}
- **Level**: {seniority}
- **Tech Stack**: {tech_stack_str}
- **Time Budget**: {time_minutes} minutes

## Assessment Type
{type_instructions}

## Domain Context
Generate a problem in the **{format_domain_name(domain)}** domain.
- Pick a SPECIFIC, REALISTIC scenario (not generic)
- Create a UNIQUE problem that tests the skills below
- The scenario should feel like something this company actually needs built

## Complexity Requirements
These dimensions define the challenge level:

1. **Entities**: {entity_count_min}-{entity_count_max} related business entities
   (e.g., for e-commerce: Order, OrderItem, Customer, Product, Inventory)

2. **Integration Points**: {integration_points} external service(s) or system(s)
   (e.g., payment gateway, notification service, external API, cache layer)

3. **Business Logic**: {business_logic}
   {get_business_logic_description(business_logic)}

4. **Specification Clarity**: {ambiguity_level}
   {AMBIGUITY_DESCRIPTIONS.get(ambiguity_level, AMBIGUITY_DESCRIPTIONS["some_decisions"])}

## Skills to Test
The problem MUST require these skills: {skills_readable}

## Skills to AVOID
Do NOT include these advanced concepts: {avoid_skills_readable}

## Structural Constraints
- **Must Include**: {', '.join(must_include) if must_include else 'standard best practices'}
- **Should Consider**: {', '.join(should_consider) if should_consider else 'code organization'}
- **Bonus (optional)**: {', '.join(bonus) if bonus else 'none specified'}

## CRITICAL RULES
1. **NO LeetCode puzzles** - This must be a practical, real-world problem
2. **Be SPECIFIC** - Don't say "build an API". Say exactly what it does and why.
3. **Unique every time** - Don't generate generic "Todo API" or "Product CRUD" problems
4. **Appropriate scope** - Must be achievable in {time_minutes} minutes
5. **Clear success criteria** - Candidate knows when they're done

## Output Format
Return ONLY valid JSON (no markdown, no code blocks, no explanation):
{{
  "title": "Brief, specific title (e.g., 'Patient Appointment Reminder Service')",
  "description": "Detailed problem with:\\n- Real-world context/story\\n- Specific requirements\\n- Input/output examples where helpful\\n- Success criteria\\n\\nUse markdown formatting.",
  "requirements": ["Specific requirement 1", "Specific requirement 2", "..."],
  "estimatedTime": {time_minutes},
  "starterCode": "// Appropriate starter code with structure hints\\n// Include imports, types/interfaces, and TODO comments"
}}"""


# =============================================================================
# Incremental Generation Prompt
# =============================================================================

def build_incremental_generation_prompt(
    role: str,
    seniority: str,
    assessment_type: str,
    tech_stack: list[str],
    previous_questions: list[dict],
    performance_analysis: dict,
    irt_targeting: DifficultyTargeting,
    seed_context: dict | None,
    time_remaining: int,
    question_number: int,
) -> str:
    """
    Build prompt for incremental/adaptive question generation.

    Uses IRT analysis and previous performance to generate appropriately
    calibrated next question.

    Args:
        role: Candidate's role
        seniority: Candidate's seniority level
        assessment_type: 'REAL_WORLD' or 'SYSTEM_DESIGN'
        tech_stack: Required technologies
        previous_questions: List of completed question data
        performance_analysis: Performance analysis dict
        irt_targeting: IRT difficulty targeting info
        seed_context: Optional seed context (base problem, hints)
        time_remaining: Remaining time in seconds
        question_number: Which question number (1-indexed)

    Returns:
        Formatted prompt string
    """
    tech_stack_str = ", ".join(tech_stack) if tech_stack else "appropriate technologies"
    time_remaining_minutes = time_remaining // 60

    # Format previous questions summary
    prev_questions_summary = ""
    if previous_questions:
        prev_questions_summary = "\n".join([
            f"- Q{i+1}: {q.get('title', 'Unknown')} (Difficulty: {q.get('difficulty', 'MEDIUM')}, Score: {q.get('score', 'N/A')})"
            for i, q in enumerate(previous_questions)
        ])
    else:
        prev_questions_summary = "None completed yet"

    # Format performance analysis
    avg_score = performance_analysis.get("avg_score", 0)
    trend = performance_analysis.get("trend", "stable")
    code_quality = performance_analysis.get("code_quality", "adequate")
    time_management = performance_analysis.get("time_management", "on_track")

    # Determine action based on IRT targeting
    target_theta = irt_targeting.target_difficulty
    current_theta = performance_analysis.get("ability_estimate", 0)

    if target_theta > current_theta + 0.3:
        action = "extend"
        action_description = "INCREASE difficulty - candidate is performing well"
    elif target_theta < current_theta - 0.3:
        action = "simplify"
        action_description = "DECREASE difficulty - candidate needs support"
    else:
        action = "maintain"
        action_description = "MAINTAIN similar difficulty level"

    # Seed context for building on previous work
    building_on = ""
    if seed_context and seed_context.get("base_problem"):
        building_on = f"""
## Building on Previous Work
This assessment uses an incremental approach. The candidate has been working on:
{seed_context.get('base_problem', {}).get('description', 'a multi-part problem')}

Progression hints: {', '.join(seed_context.get('progression_hints', []))}
"""

    return f"""You are an expert technical interviewer creating Question {question_number} in an adaptive coding assessment.

## Candidate Context
- **Role**: {role}
- **Level**: {seniority}
- **Tech Stack**: {tech_stack_str}
- **Time Remaining**: {time_remaining_minutes} minutes
- **Question Number**: {question_number}

## Previous Performance
Questions completed:
{prev_questions_summary}

Performance Analysis:
- Average Score: {avg_score:.0%}
- Trend: {trend.upper()} (improving/declining/stable)
- Code Quality: {code_quality}
- Time Management: {time_management}

## IRT-Based Difficulty Targeting
{irt_targeting.reasoning}

**Action**: {action_description}
**Target Difficulty**: θ = {target_theta:.2f} (range: {irt_targeting.target_range[0]:.2f} to {irt_targeting.target_range[1]:.2f})
{building_on}
## Generation Guidelines

Based on the "{action}" action:
{"- Introduce MORE complexity, additional requirements, or edge cases" if action == "extend" else ""}
{"- REDUCE scope, provide clearer requirements, break into smaller steps" if action == "simplify" else ""}
{"- Keep similar scope and complexity as previous questions" if action == "maintain" else ""}

### If EXTENDING (harder):
- Add a new capability to existing code OR introduce a related feature
- Require handling additional edge cases
- Introduce integration with another service
- Add performance or scalability considerations

### If SIMPLIFYING (easier):
- Focus on ONE clear objective
- Provide more explicit requirements
- Reduce the number of entities/components
- Give partial code structure as hints

### If MAINTAINING:
- Similar complexity but different concept/domain area
- Build naturally on previous work
- Test complementary skills

## Assessment Type: {assessment_type}
{"Focus on DESIGN.md documentation and architecture decisions." if assessment_type == "SYSTEM_DESIGN" else "Focus on working, production-ready code."}

## CRITICAL RULES
1. **Connect to previous work** - Reference or build on what they've already done
2. **Appropriate scope** - Must fit in {time_remaining_minutes} minutes
3. **Clear success criteria** - Candidate knows exactly what "done" looks like
4. **Test different skills** - Don't repeat the same type of problem

## Output Format
Return ONLY valid JSON:
{{
  "title": "Specific title that shows connection to previous work",
  "description": "Problem description including:\\n- Connection to previous question(s)\\n- What new capability/feature is needed\\n- Specific requirements\\n- Success criteria",
  "requirements": ["Requirement 1", "Requirement 2", "..."],
  "estimatedTime": {min(time_remaining_minutes, 45)},
  "starterCode": "// Code that builds on their previous work\\n// Or fresh starter if new direction",
  "difficulty": "{"HARD" if action == "extend" else "EASY" if action == "simplify" else "MEDIUM"}"
}}"""


# =============================================================================
# Variation Generation Prompt
# =============================================================================

def build_variation_prompt(
    source_question: dict,
    variation_type: Literal["similar", "different_domain", "different_approach"],
) -> str:
    """
    Build prompt to generate a variation of an existing question.

    Used by SmartQuestionService for the "iterate" strategy.

    Args:
        source_question: Original question to vary
        variation_type: Type of variation to create

    Returns:
        Formatted prompt string
    """
    title = source_question.get("title", "Unknown")
    description = source_question.get("description", "")
    requirements = source_question.get("requirements", [])
    difficulty = source_question.get("difficulty", "MEDIUM")
    estimated_time = source_question.get("estimated_time", 45)

    if variation_type == "similar":
        variation_instructions = """Create a SIMILAR question that tests the same skills but with:
- Different specific scenario/domain context
- Different data structures or entity names
- Different edge cases to consider
- Same overall complexity and time requirement"""
    elif variation_type == "different_domain":
        variation_instructions = """Create a question testing the same SKILLS but in a DIFFERENT DOMAIN:
- Move from e-commerce to healthcare, or fintech to logistics, etc.
- Keep the same core technical concepts
- Adjust terminology and context appropriately
- Maintain similar complexity"""
    else:  # different_approach
        variation_instructions = """Create a question where the SAME PROBLEM could be solved differently:
- Same goals but different constraints
- Could be solved with different design patterns
- Emphasize different trade-offs
- Keep difficulty similar"""

    return f"""You are creating a VARIATION of an existing coding question.

## Original Question
**Title**: {title}
**Difficulty**: {difficulty}
**Time**: {estimated_time} minutes

**Description**:
{description[:500]}{"..." if len(description) > 500 else ""}

**Requirements**:
{chr(10).join(f"- {r}" for r in requirements[:5])}

## Variation Instructions
{variation_instructions}

## CRITICAL RULES
1. **NOT identical** - Must be meaningfully different from the original
2. **SAME difficulty** - Keep at {difficulty} level
3. **SAME time budget** - {estimated_time} minutes
4. **Tests similar skills** - Core competencies should be the same
5. **Unique enough** - A candidate who saw the original won't recognize this as a copy

## Output Format
Return ONLY valid JSON:
{{
  "title": "New unique title",
  "description": "New problem description",
  "requirements": ["New requirement 1", "New requirement 2", "..."],
  "estimatedTime": {estimated_time},
  "starterCode": "// Appropriate starter code",
  "difficulty": "{difficulty}"
}}"""

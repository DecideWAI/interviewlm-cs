/**
 * Benchmark: Concise vs Full Prompt
 *
 * Tests if a shorter prompt can achieve 10s target
 */

import Anthropic from "@anthropic-ai/sdk";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// CONCISE prompt - just the essentials
const CONCISE_PROMPT = `Generate a coding interview question for a mid-level backend engineer.

**Context:**
- Language: Python
- Domain: E-commerce
- Time: 60 minutes
- Skills: API design, data modeling, error handling

**Requirements:**
- Real-world problem (not LeetCode)
- 3-5 business entities
- 1 external integration
- Clear success criteria

Return JSON only:
{
  "title": "string",
  "description": "markdown with context, requirements, examples",
  "requirements": ["array of specific requirements"],
  "estimatedTime": 60,
  "starterCode": "python starter with TODOs"
}`;

// FULL prompt (current production)
const FULL_PROMPT = `You are an expert technical interviewer creating a coding challenge.

## Target Candidate
- **Role**: backend
- **Level**: mid
- **Tech Stack**: python
- **Time Budget**: 60 minutes

## Assessment Type
This is a REAL WORLD PROBLEM assessment. The candidate should:
- Write production-ready, working code
- Implement complete features end-to-end
- Add proper validation and error handling
- Write clean, maintainable code
- Consider edge cases and failure modes

The problem should feel like a real task from a mid-level backend's day-to-day work.

## Domain Context
Generate a problem in the **E-Commerce** domain.
- Pick a SPECIFIC, REALISTIC scenario (not generic)
- Create a UNIQUE problem that tests the skills below
- The scenario should feel like something this company actually needs built

## Complexity Requirements
These dimensions define the challenge level:

1. **Entities**: 3-5 related business entities
   (e.g., for e-commerce: Order, OrderItem, Customer, Product, Inventory)

2. **Integration Points**: 1 external service(s) or system(s)
   (e.g., payment gateway, notification service, external API, cache layer)

3. **Business Logic**: moderate
   Multi-step processes with some conditional logic (e.g., workflows, state transitions)

4. **Specification Clarity**: some_decisions
   Most requirements are clear, but candidate makes 1-2 design decisions.

## Skills to Test
The problem MUST require these skills: API Design, Data Modeling, Error Handling, Relationships, Pagination, Caching

## Skills to AVOID
Do NOT include these advanced concepts: none

## Structural Constraints
- **Must Include**: standard best practices
- **Should Consider**: code organization
- **Bonus (optional)**: none specified

## CRITICAL RULES
1. **NO LeetCode puzzles** - This must be a practical, real-world problem
2. **Be SPECIFIC** - Don't say "build an API". Say exactly what it does and why.
3. **Unique every time** - Don't generate generic "Todo API" or "Product CRUD" problems
4. **Appropriate scope** - Must be achievable in 60 minutes
5. **Clear success criteria** - Candidate knows when they're done

## Output Format
Return ONLY valid JSON (no markdown, no code blocks, no explanation):
{
  "title": "Brief, specific title (e.g., 'Patient Appointment Reminder Service')",
  "description": "Detailed problem with:\\n- Real-world context/story\\n- Specific requirements\\n- Input/output examples where helpful\\n- Success criteria\\n\\nUse markdown formatting.",
  "requirements": ["Specific requirement 1", "Specific requirement 2", "..."],
  "estimatedTime": 60,
  "starterCode": "// Appropriate starter code with structure hints\\n// Include imports, types/interfaces, and TODO comments"
}`;

interface Result {
  name: string;
  latency: number;
  inputTokens: number;
  outputTokens: number;
}

async function benchmark(name: string, prompt: string): Promise<Result> {
  const start = Date.now();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    temperature: 0.7,
    messages: [{ role: "user", content: prompt }],
  });

  return {
    name,
    latency: Date.now() - start,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function main() {
  console.log("🚀 Prompt Size Benchmark (Haiku)\n");
  console.log("=".repeat(60));

  const results: Result[] = [];

  // Run 3 iterations each
  for (let i = 1; i <= 3; i++) {
    console.log(`\n📊 Run ${i}/3`);
    console.log("-".repeat(40));

    console.log("  Testing CONCISE prompt...");
    results.push(await benchmark("Concise", CONCISE_PROMPT));

    console.log("  Testing FULL prompt...");
    results.push(await benchmark("Full", FULL_PROMPT));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📈 RESULTS\n");

  const concise = results.filter(r => r.name === "Concise");
  const full = results.filter(r => r.name === "Full");

  const conciseAvg = Math.round(concise.reduce((a, r) => a + r.latency, 0) / concise.length);
  const fullAvg = Math.round(full.reduce((a, r) => a + r.latency, 0) / full.length);
  const conciseIn = Math.round(concise.reduce((a, r) => a + r.inputTokens, 0) / concise.length);
  const fullIn = Math.round(full.reduce((a, r) => a + r.inputTokens, 0) / full.length);

  console.log("| Prompt   | Avg Latency | Input Tokens |");
  console.log("|----------|-------------|--------------|");
  console.log(`| Concise  | ${conciseAvg}ms`.padEnd(14) + `| ${conciseIn}`.padEnd(14) + "|");
  console.log(`| Full     | ${fullAvg}ms`.padEnd(14) + `| ${fullIn}`.padEnd(14) + "|");

  console.log("\n📋 ANALYSIS:");
  console.log(`  • Concise is ${(fullAvg / conciseAvg).toFixed(1)}x faster than Full`);
  console.log(`  • Concise uses ${Math.round((1 - conciseIn/fullIn) * 100)}% fewer input tokens`);

  if (conciseAvg < 15000) {
    console.log(`  ✅ Concise prompt achieves < 15s target!`);
  }
}

main().catch(console.error);

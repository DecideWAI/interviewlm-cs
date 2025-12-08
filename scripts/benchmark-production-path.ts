/**
 * Benchmark: Production Question Generation Path
 *
 * Simulates the exact production flow to identify the 50s bottleneck
 */

import Anthropic from "@anthropic-ai/sdk";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-5-20250929";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    "anthropic-beta": "prompt-caching-2024-07-31",
  },
});

// Simulated chat system prompt (from lib/prompts/chat-system.ts)
const CHAT_SYSTEM_PROMPT = `<system>
<identity>
You are InterviewLM Code, an expert AI programming assistant helping a candidate during a technical interview assessment.
</identity>

<responsibilities>
<code_assistance>
- Help candidates understand problems and develop solutions
- Provide guidance on algorithms, data structures, and best practices
- Suggest improvements to code quality, efficiency, and readability
- Debug issues when tests fail
- Be concise but thorough in explanations
</code_assistance>

<technical_guidance>
- Explain complex concepts in simple terms
- Provide code snippets to illustrate ideas
- Suggest appropriate design patterns
- Help optimize performance where needed
- Guide candidates through debugging processes
</technical_guidance>

<interview_support>
- Act as a collaborative pair programming partner
- Encourage good software engineering practices
- Help candidates think through edge cases
- Provide hints without giving away solutions
- Support test-driven development approaches
</interview_support>
</responsibilities>

<guidelines>
<do>
- Ask clarifying questions when requirements are unclear
- Encourage test-driven development
- Point out edge cases candidates should consider
- Provide code snippets to illustrate concepts
- Explain the reasoning behind suggestions
- Help debug issues systematically
- Suggest refactoring opportunities
- Recommend appropriate data structures
- Guide candidates through algorithm design
- Support incremental development
</do>

<do_not>
- Do NOT write the entire solution for them
- Do NOT reveal test case details or expected outputs
- Do NOT discuss candidate evaluation or scoring
- Do NOT compare candidates to others
- Do NOT mention difficulty levels or adaptive algorithms
- Do NOT reveal internal assessment mechanisms
- Do NOT provide complete implementations without explanation
</do_not>
</guidelines>

<communication_style>
- Helpful, encouraging, and collaborative
- Maintain professionalism while being approachable
- Use clear and concise language
- Be patient with candidates who are struggling
- Celebrate progress and good approaches
</communication_style>
</system>

<problem_context>
<title>Question Generation</title>
<description></description>
<language>python</language>
</problem_context>`;

// Full question generation prompt (from dynamic-question-generator.ts)
const QUESTION_GEN_PROMPT = `You are an expert technical interviewer creating a coding challenge.

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

interface BenchmarkResult {
  name: string;
  latency: number;
  inputTokens: number;
  outputTokens: number;
}

async function benchmarkProductionPath(): Promise<BenchmarkResult> {
  console.log("  Testing PRODUCTION path (Sonnet + chat system prompt)...");

  const start = Date.now();
  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4096,
    temperature: 0.7,
    system: [
      { type: "text", text: CHAT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ] as any,
    messages: [{ role: "user", content: QUESTION_GEN_PROMPT }],
  });

  return {
    name: "Production (Sonnet + system)",
    latency: Date.now() - start,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function benchmarkOptimizedPath(): Promise<BenchmarkResult> {
  console.log("  Testing OPTIMIZED path (Haiku, no system prompt)...");

  const start = Date.now();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    temperature: 0.7,
    messages: [{ role: "user", content: QUESTION_GEN_PROMPT }],
  });

  return {
    name: "Optimized (Haiku, direct)",
    latency: Date.now() - start,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function benchmarkToolUsePath(): Promise<BenchmarkResult> {
  console.log("  Testing TOOL USE path (Haiku + structured output)...");

  const questionTool: Anthropic.Tool = {
    name: "generate_question",
    description: "Generate a coding interview question",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        requirements: { type: "array", items: { type: "string" } },
        estimatedTime: { type: "number" },
        starterCode: { type: "string" },
      },
      required: ["title", "description", "requirements", "estimatedTime", "starterCode"],
    },
  };

  const start = Date.now();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    temperature: 0.7,
    tools: [questionTool],
    tool_choice: { type: "tool", name: "generate_question" },
    messages: [{ role: "user", content: QUESTION_GEN_PROMPT }],
  });

  return {
    name: "Tool Use (Haiku + tool)",
    latency: Date.now() - start,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function main() {
  console.log("🚀 Production Path Benchmark\n");
  console.log("=".repeat(60));

  const results: BenchmarkResult[] = [];

  // Run each test twice
  for (let i = 1; i <= 2; i++) {
    console.log(`\n📊 Run ${i}/2`);
    console.log("-".repeat(40));

    results.push(await benchmarkProductionPath());
    results.push(await benchmarkOptimizedPath());
    results.push(await benchmarkToolUsePath());
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📈 RESULTS\n");

  // Group by name
  const groups = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    if (!groups.has(r.name)) groups.set(r.name, []);
    groups.get(r.name)!.push(r);
  }

  console.log("| Path                        | Avg Latency | Input Tokens |");
  console.log("|-----------------------------|-------------|--------------|");

  for (const [name, runs] of groups) {
    const avgLatency = Math.round(runs.reduce((a, r) => a + r.latency, 0) / runs.length);
    const avgIn = Math.round(runs.reduce((a, r) => a + r.inputTokens, 0) / runs.length);
    console.log(`| ${name.padEnd(27)} | ${(avgLatency + "ms").padEnd(11)} | ${avgIn.toString().padEnd(12)} |`);
  }

  // Calculate speedup
  const prodRuns = groups.get("Production (Sonnet + system)") || [];
  const optRuns = groups.get("Optimized (Haiku, direct)") || [];
  const toolRuns = groups.get("Tool Use (Haiku + tool)") || [];

  if (prodRuns.length && optRuns.length) {
    const prodAvg = prodRuns.reduce((a, r) => a + r.latency, 0) / prodRuns.length;
    const optAvg = optRuns.reduce((a, r) => a + r.latency, 0) / optRuns.length;
    const toolAvg = toolRuns.reduce((a, r) => a + r.latency, 0) / toolRuns.length;

    console.log("\n📋 SPEEDUP:");
    console.log(`  • Production baseline: ${Math.round(prodAvg)}ms`);
    console.log(`  • Haiku direct: ${Math.round(optAvg)}ms (${(prodAvg / optAvg).toFixed(1)}x faster)`);
    console.log(`  • Haiku + tool: ${Math.round(toolAvg)}ms (${(prodAvg / toolAvg).toFixed(1)}x faster)`);
  }
}

main().catch(console.error);

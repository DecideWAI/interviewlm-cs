/**
 * Benchmark: Question Generation Performance
 *
 * Tests Haiku vs Sonnet for question generation latency
 * Also tests structured output (tool use) vs plain text
 */

import Anthropic from "@anthropic-ai/sdk";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-5-20250929";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Simplified question generation prompt (same structure as dynamic-question-generator.ts)
const QUESTION_PROMPT = `You are an expert technical interviewer creating a coding challenge.

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

## Domain Context
Generate a problem in the **E-Commerce** domain.
- Pick a SPECIFIC, REALISTIC scenario
- Create a UNIQUE problem

## Complexity Requirements
1. **Entities**: 3-5 related business entities
2. **Integration Points**: 1 external service
3. **Business Logic**: moderate

## Skills to Test
API Design, Data Modeling, Error Handling

## Output Format
Return ONLY valid JSON (no markdown, no code blocks):
{
  "title": "Brief title",
  "description": "Detailed problem description",
  "requirements": ["Requirement 1", "Requirement 2"],
  "estimatedTime": 60,
  "starterCode": "# Python starter code"
}`;

// Tool definition for structured output
const questionTool: Anthropic.Tool = {
  name: "generate_question",
  description: "Generate a coding interview question",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Brief, specific title" },
      description: { type: "string", description: "Detailed problem description" },
      requirements: {
        type: "array",
        items: { type: "string" },
        description: "List of specific requirements"
      },
      estimatedTime: { type: "number", description: "Time in minutes" },
      starterCode: { type: "string", description: "Starter code template" },
    },
    required: ["title", "description", "requirements", "estimatedTime", "starterCode"],
  },
};

interface BenchmarkResult {
  model: string;
  method: string;
  latency: number;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  error?: string;
}

async function benchmarkPlainText(model: string): Promise<BenchmarkResult> {
  const start = Date.now();
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      temperature: 0.7,
      messages: [{ role: "user", content: QUESTION_PROMPT }],
    });

    const latency = Date.now() - start;
    const content = response.content[0];
    const text = content.type === "text" ? content.text : "";

    // Try to parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const success = jsonMatch !== null;

    return {
      model,
      method: "plain_text",
      latency,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      success,
    };
  } catch (error) {
    return {
      model,
      method: "plain_text",
      latency: Date.now() - start,
      inputTokens: 0,
      outputTokens: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function benchmarkToolUse(model: string): Promise<BenchmarkResult> {
  const start = Date.now();
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      temperature: 0.7,
      tools: [questionTool],
      tool_choice: { type: "tool", name: "generate_question" },
      messages: [{
        role: "user",
        content: "Generate a coding interview question for a mid-level backend engineer using Python. Domain: e-commerce. Skills: API design, data modeling, error handling. Time: 60 minutes."
      }],
    });

    const latency = Date.now() - start;

    // Check if we got a tool use response
    const toolUse = response.content.find(c => c.type === "tool_use");
    const success = toolUse !== undefined;

    return {
      model,
      method: "tool_use",
      latency,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      success,
    };
  } catch (error) {
    return {
      model,
      method: "tool_use",
      latency: Date.now() - start,
      inputTokens: 0,
      outputTokens: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runBenchmarks() {
  console.log("🚀 Question Generation Benchmark\n");
  console.log("=" .repeat(60));

  const results: BenchmarkResult[] = [];

  // Test each combination
  const tests = [
    { model: HAIKU_MODEL, method: "plain_text", fn: benchmarkPlainText },
    { model: HAIKU_MODEL, method: "tool_use", fn: benchmarkToolUse },
    { model: SONNET_MODEL, method: "plain_text", fn: benchmarkPlainText },
    { model: SONNET_MODEL, method: "tool_use", fn: benchmarkToolUse },
  ];

  for (const test of tests) {
    const modelShort = test.model.includes("haiku") ? "Haiku 4.5" : "Sonnet 4.5";
    console.log(`\n📊 Testing: ${modelShort} + ${test.method}`);
    console.log("-".repeat(40));

    // Run 2 iterations for each
    for (let i = 1; i <= 2; i++) {
      console.log(`  Run ${i}...`);
      const result = await test.fn(test.model);
      results.push(result);

      console.log(`    Latency: ${result.latency}ms`);
      console.log(`    Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);
      console.log(`    Success: ${result.success ? "✅" : "❌"}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📈 SUMMARY\n");

  // Group by model+method
  const groups = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    const key = `${r.model.includes("haiku") ? "Haiku" : "Sonnet"} + ${r.method}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  console.log("| Method                    | Avg Latency | Tokens (in/out) |");
  console.log("|---------------------------|-------------|-----------------|");

  for (const [key, runs] of groups) {
    const avgLatency = Math.round(runs.reduce((a, r) => a + r.latency, 0) / runs.length);
    const avgIn = Math.round(runs.reduce((a, r) => a + r.inputTokens, 0) / runs.length);
    const avgOut = Math.round(runs.reduce((a, r) => a + r.outputTokens, 0) / runs.length);
    console.log(`| ${key.padEnd(25)} | ${(avgLatency + "ms").padEnd(11)} | ${avgIn}/${avgOut}`.padEnd(16) + " |");
  }

  // Analysis
  console.log("\n📋 ANALYSIS:");

  const haikuPlain = results.filter(r => r.model.includes("haiku") && r.method === "plain_text");
  const sonnetPlain = results.filter(r => r.model.includes("sonnet") && r.method === "plain_text");

  if (haikuPlain.length && sonnetPlain.length) {
    const haikuAvg = haikuPlain.reduce((a, r) => a + r.latency, 0) / haikuPlain.length;
    const sonnetAvg = sonnetPlain.reduce((a, r) => a + r.latency, 0) / sonnetPlain.length;
    const speedup = (sonnetAvg / haikuAvg).toFixed(1);
    console.log(`  • Haiku is ${speedup}x faster than Sonnet for plain text`);
  }

  const haikuTool = results.filter(r => r.model.includes("haiku") && r.method === "tool_use");
  if (haikuPlain.length && haikuTool.length) {
    const plainAvg = haikuPlain.reduce((a, r) => a + r.latency, 0) / haikuPlain.length;
    const toolAvg = haikuTool.reduce((a, r) => a + r.latency, 0) / haikuTool.length;
    const diff = Math.round(toolAvg - plainAvg);
    console.log(`  • Tool use adds ${diff > 0 ? "+" : ""}${diff}ms overhead on Haiku`);
  }
}

// Run
runBenchmarks().catch(console.error);

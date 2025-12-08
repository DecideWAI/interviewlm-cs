#!/usr/bin/env npx tsx
/**
 * Agent Caching Test Script
 *
 * Tests caching implementation across all agents that make Claude API calls.
 * Makes multiple calls to each agent and measures cache hit rates.
 *
 * Usage:
 *   npx tsx scripts/test-agent-caching.ts
 *   npx tsx scripts/test-agent-caching.ts --agent=coding
 *   npx tsx scripts/test-agent-caching.ts --verbose
 *   npx tsx scripts/test-agent-caching.ts --dry-run    # Verify structure without API calls
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  buildCachedSystemPrompt,
  addMessageCacheBreakpoints,
  createAgentClient,
  extractCacheMetrics,
  type CacheMetrics,
} from '../lib/utils/agent-utils';

// =============================================================================
// Types
// =============================================================================

interface AgentTestResult {
  agentName: string;
  calls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cacheHitRate: number;
  estimatedSavings: number;
  errors: string[];
  latencies: number[];
}

interface TestConfig {
  verbose: boolean;
  agents: string[];
  callsPerAgent: number;
  dryRun: boolean;
}

// =============================================================================
// Test System Prompts (mirrors actual agent prompts)
// =============================================================================

const TEST_SYSTEM_PROMPTS = {
  coding: `You are an expert AI coding assistant helping candidates during technical interviews.

Your responsibilities:
- Help candidates understand problems and develop solutions
- Provide guidance on algorithms, data structures, and best practices
- Debug issues when tests fail
- Be concise but thorough

Guidelines:
- Ask clarifying questions when requirements are unclear
- Encourage test-driven development
- Point out edge cases candidates should consider
- Do NOT write the entire solution - guide instead

This is a test prompt for caching verification.`,

  evaluation: `You are an expert code evaluator for technical interview assessments.

Your role is to objectively evaluate code submissions on multiple dimensions:

1. Code Quality (25%): Readability, maintainability, best practices
2. Problem Solving (25%): Algorithm efficiency, correctness, edge cases
3. AI Collaboration (25%): Prompt quality, iteration effectiveness
4. Communication (25%): Code comments, variable naming, structure

Scoring guidelines:
- 90-100: Exceptional - Production-ready
- 70-89: Good - Minor improvements possible
- 50-69: Adequate - Needs refactoring
- 30-49: Below Average - Significant issues
- 0-29: Poor - Major problems

This is a test prompt for caching verification.`,

  supervisor: `You are a Supervisor Agent coordinating between specialized agents.

Your role is to:
- Route tasks to the appropriate agent (Coding, Interview, Evaluation)
- Track workflow progress
- Ensure smooth handoffs between agents

Available agents:
1. Coding Agent - For code assistance tasks
2. Interview Agent - For tracking metrics (hidden from candidates)
3. Evaluation Agent - For scoring completed work

Use tool calls to hand off to the appropriate agent.

This is a test prompt for caching verification.`,

  promptAnalysis: `You are an expert evaluator of AI prompt quality in technical interviews.

Analyze each prompt a candidate sends to an AI coding assistant and score it on:

1. Specificity (0-100): Context, error messages, examples
2. Clarity (0-100): Clear intent, well-structured
3. Technical Depth (0-100): Understanding of problem, concepts

Be objective and evidence-based.

This is a test prompt for caching verification.`,
};

// =============================================================================
// Test Messages
// =============================================================================

const TEST_MESSAGES = [
  'How do I implement a binary search algorithm?',
  'Can you help me debug this sorting function?',
  'What data structure should I use for this problem?',
  'How can I optimize this code for better performance?',
  'Can you explain the time complexity of my solution?',
];

// =============================================================================
// Utility Functions
// =============================================================================

function parseArgs(): TestConfig {
  const args = process.argv.slice(2);
  const config: TestConfig = {
    verbose: false,
    agents: ['coding', 'evaluation', 'supervisor', 'promptAnalysis'],
    callsPerAgent: 3,
    dryRun: false,
  };

  for (const arg of args) {
    if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (arg === '--dry-run' || arg === '-d') {
      config.dryRun = true;
    } else if (arg.startsWith('--agent=')) {
      config.agents = [arg.split('=')[1]];
    } else if (arg.startsWith('--calls=')) {
      config.callsPerAgent = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Agent Caching Test Script

Usage:
  npx tsx scripts/test-agent-caching.ts [options]

Options:
  --agent=NAME    Test only specific agent (coding, evaluation, supervisor, promptAnalysis)
  --calls=N       Number of calls per agent (default: 3)
  --verbose, -v   Show detailed output
  --dry-run, -d   Verify caching structure without making API calls
  --help, -h      Show this help message

Examples:
  npx tsx scripts/test-agent-caching.ts
  npx tsx scripts/test-agent-caching.ts --agent=coding --calls=5
  npx tsx scripts/test-agent-caching.ts --verbose
  npx tsx scripts/test-agent-caching.ts --dry-run
`);
      process.exit(0);
    }
  }

  return config;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatCost(tokens: number, rate: number): string {
  const cost = (tokens / 1_000_000) * rate;
  return `$${cost.toFixed(4)}`;
}

// =============================================================================
// Agent Test Functions
// =============================================================================

async function testAgentCaching(
  agentName: string,
  systemPrompt: string,
  config: TestConfig
): Promise<AgentTestResult> {
  const result: AgentTestResult = {
    agentName,
    calls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cacheHitRate: 0,
    estimatedSavings: 0,
    errors: [],
    latencies: [],
  };

  const client = createAgentClient({ threadId: `test-${agentName}-${Date.now()}` });
  const cachedSystemPrompt = buildCachedSystemPrompt(systemPrompt);

  // Build a conversation that grows with each call
  const conversation: Anthropic.MessageParam[] = [];

  for (let i = 0; i < config.callsPerAgent; i++) {
    const userMessage = TEST_MESSAGES[i % TEST_MESSAGES.length];

    // Add user message to conversation
    conversation.push({
      role: 'user',
      content: userMessage,
    });

    const startTime = Date.now();

    try {
      // Apply message cache breakpoints
      const messagesWithCaching = addMessageCacheBreakpoints(conversation);

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 256, // Keep short for testing
        system: cachedSystemPrompt,
        messages: messagesWithCaching,
      });

      const latency = Date.now() - startTime;
      result.latencies.push(latency);
      result.calls++;

      // Extract cache metrics
      const metrics = extractCacheMetrics(response);

      result.totalInputTokens += metrics.inputTokens;
      result.totalOutputTokens += metrics.outputTokens;
      result.cacheCreationTokens += metrics.cacheCreationInputTokens;
      result.cacheReadTokens += metrics.cacheReadInputTokens;

      // Add assistant response to conversation for next iteration
      const assistantText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join('');

      conversation.push({
        role: 'assistant',
        content: assistantText,
      });

      if (config.verbose) {
        console.log(`  Call ${i + 1}/${config.callsPerAgent}:`);
        console.log(`    Input: ${formatNumber(metrics.inputTokens)} tokens`);
        console.log(`    Cache created: ${formatNumber(metrics.cacheCreationInputTokens)} tokens`);
        console.log(`    Cache read: ${formatNumber(metrics.cacheReadInputTokens)} tokens`);
        console.log(`    Latency: ${latency}ms`);
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      result.errors.push(`Call ${i + 1}: ${(error as Error).message}`);
      if (config.verbose) {
        console.log(`  Call ${i + 1}/${config.callsPerAgent}: ERROR - ${(error as Error).message}`);
      }
    }
  }

  // Calculate cache hit rate
  const totalCacheableTokens = result.cacheCreationTokens + result.cacheReadTokens;
  if (totalCacheableTokens > 0) {
    result.cacheHitRate = result.cacheReadTokens / totalCacheableTokens;
  }

  // Calculate estimated savings (cache reads are 90% cheaper)
  const INPUT_COST_PER_MILLION = 3.0; // Sonnet pricing
  const regularCost = (result.cacheReadTokens / 1_000_000) * INPUT_COST_PER_MILLION;
  const cachedCost = (result.cacheReadTokens / 1_000_000) * INPUT_COST_PER_MILLION * 0.1;
  result.estimatedSavings = regularCost - cachedCost;

  return result;
}

// =============================================================================
// Dry Run Verification
// =============================================================================

interface AgentFile {
  name: string;
  path: string;
  hasCachedSystemPrompt: boolean;
  hasMessageCaching: boolean;
  hasCacheMetrics: boolean;
  usesSharedClient: boolean;
}

async function runDryRunVerification(config: TestConfig): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║         Agent Caching Structure Verification (Dry Run)           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  const agentFiles: AgentFile[] = [
    { name: 'Coding Agent', path: 'lib/agents/coding-agent.ts', hasCachedSystemPrompt: false, hasMessageCaching: false, hasCacheMetrics: false, usesSharedClient: false },
    { name: 'Question Evaluation Agent', path: 'lib/agents/question-evaluation-agent.ts', hasCachedSystemPrompt: false, hasMessageCaching: false, hasCacheMetrics: false, usesSharedClient: false },
    { name: 'Supervisor Agent', path: 'lib/agents/supervisor-agent.ts', hasCachedSystemPrompt: false, hasMessageCaching: false, hasCacheMetrics: false, usesSharedClient: false },
    { name: 'Chat Service', path: 'lib/services/claude.ts', hasCachedSystemPrompt: false, hasMessageCaching: false, hasCacheMetrics: false, usesSharedClient: false },
    { name: 'Prompt Analysis', path: 'lib/evaluation/prompt-analysis.ts', hasCachedSystemPrompt: false, hasMessageCaching: false, hasCacheMetrics: false, usesSharedClient: false },
    { name: 'Evaluation Worker', path: 'workers/evaluation-agent.ts', hasCachedSystemPrompt: false, hasMessageCaching: false, hasCacheMetrics: false, usesSharedClient: false },
  ];

  console.log('Checking caching implementation in agent files...\n');

  for (const agent of agentFiles) {
    const filePath = path.join(process.cwd(), agent.path);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Check for cached system prompt
      agent.hasCachedSystemPrompt =
        content.includes('buildCachedSystemPrompt') ||
        content.includes('buildChatSystemPromptWithCaching') ||
        content.includes('buildSystemPromptWithCaching') ||
        content.includes("cache_control: { type: 'ephemeral' }") ||
        content.includes('cache_control: { type: "ephemeral" }');

      // Check for message caching
      agent.hasMessageCaching =
        content.includes('addMessageCacheBreakpoints') ||
        content.includes('sanitizeMessages');

      // Check for cache metrics
      agent.hasCacheMetrics =
        content.includes('extractCacheMetrics') ||
        content.includes('logCacheMetrics') ||
        content.includes('cache_creation_input_tokens') ||
        content.includes('cache_read_input_tokens');

      // Check for shared client
      agent.usesSharedClient =
        content.includes('createAgentClient') ||
        content.includes('getTracedAnthropicClient');

      const status = agent.hasCachedSystemPrompt ? '✅' : '❌';
      console.log(`${status} ${agent.name} (${agent.path})`);

      if (config.verbose) {
        console.log(`    System Prompt Caching: ${agent.hasCachedSystemPrompt ? '✅' : '❌'}`);
        console.log(`    Message Caching: ${agent.hasMessageCaching ? '✅' : '⚠️  (optional)'}`);
        console.log(`    Cache Metrics Logging: ${agent.hasCacheMetrics ? '✅' : '⚠️  (optional)'}`);
        console.log(`    Shared Client: ${agent.usesSharedClient ? '✅' : '⚠️  (optional)'}`);
        console.log('');
      }
    } catch (error) {
      console.log(`❌ ${agent.name} (${agent.path}) - File not found`);
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(60));
  console.log('Summary:');

  const withCaching = agentFiles.filter((a) => a.hasCachedSystemPrompt);
  const withoutCaching = agentFiles.filter((a) => !a.hasCachedSystemPrompt);

  console.log(`  ✅ Agents with system prompt caching: ${withCaching.length}/${agentFiles.length}`);
  for (const agent of withCaching) {
    console.log(`     - ${agent.name}`);
  }

  if (withoutCaching.length > 0) {
    console.log(`  ❌ Agents missing system prompt caching: ${withoutCaching.length}/${agentFiles.length}`);
    for (const agent of withoutCaching) {
      console.log(`     - ${agent.name}`);
    }
  }

  // Verify utility module
  console.log('\nVerifying agent-utils.ts exports...');
  const utilsPath = path.join(process.cwd(), 'lib/utils/agent-utils.ts');
  try {
    const utilsContent = fs.readFileSync(utilsPath, 'utf-8');
    const exports = [
      'buildCachedSystemPrompt',
      'addMessageCacheBreakpoints',
      'createAgentClient',
      'extractCacheMetrics',
      'logCacheMetrics',
      'calculateCost',
    ];

    console.log('  Exported functions:');
    for (const exp of exports) {
      const hasExport = utilsContent.includes(`export function ${exp}`) ||
                        utilsContent.includes(`export const ${exp}`) ||
                        utilsContent.includes(`export { ${exp}`);
      console.log(`    ${hasExport ? '✅' : '❌'} ${exp}`);
    }
  } catch (error) {
    console.log('  ❌ Could not read lib/utils/agent-utils.ts');
  }

  console.log('\n' + '═'.repeat(60));
  console.log('Dry run complete. No API calls were made.');
  console.log('Run without --dry-run to test actual caching with API calls.');
}

// =============================================================================
// Main Test Runner
// =============================================================================

async function runTests(): Promise<void> {
  const config = parseArgs();

  // Handle dry run mode
  if (config.dryRun) {
    await runDryRunVerification(config);
    return;
  }

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              Agent Caching Verification Test                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set');
    console.log('TIP: Use --dry-run to verify caching structure without API calls');
    process.exit(1);
  }

  console.log(`Testing ${config.agents.length} agent(s) with ${config.callsPerAgent} calls each...`);
  console.log('');

  const results: AgentTestResult[] = [];

  for (const agentName of config.agents) {
    const systemPrompt = TEST_SYSTEM_PROMPTS[agentName as keyof typeof TEST_SYSTEM_PROMPTS];

    if (!systemPrompt) {
      console.log(`⚠️  Unknown agent: ${agentName}, skipping...`);
      continue;
    }

    console.log(`\n📊 Testing ${agentName} agent...`);
    console.log('─'.repeat(50));

    const result = await testAgentCaching(agentName, systemPrompt, config);
    results.push(result);

    // Print individual result
    console.log(`\n  Results for ${agentName}:`);
    console.log(`    Successful calls: ${result.calls}/${config.callsPerAgent}`);
    console.log(`    Total input tokens: ${formatNumber(result.totalInputTokens)}`);
    console.log(`    Cache created: ${formatNumber(result.cacheCreationTokens)} tokens`);
    console.log(`    Cache read: ${formatNumber(result.cacheReadTokens)} tokens`);
    console.log(`    Cache hit rate: ${formatPercent(result.cacheHitRate)}`);
    console.log(`    Avg latency: ${Math.round(result.latencies.reduce((a, b) => a + b, 0) / result.latencies.length || 0)}ms`);

    if (result.errors.length > 0) {
      console.log(`    Errors: ${result.errors.length}`);
      if (config.verbose) {
        result.errors.forEach((e) => console.log(`      - ${e}`));
      }
    }
  }

  // Print summary
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                         Summary                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Summary table
  console.log('┌─────────────────┬────────┬───────────────┬───────────────┬────────────┐');
  console.log('│ Agent           │ Calls  │ Cache Created │ Cache Read    │ Hit Rate   │');
  console.log('├─────────────────┼────────┼───────────────┼───────────────┼────────────┤');

  let totalCacheCreated = 0;
  let totalCacheRead = 0;
  let totalSavings = 0;

  for (const result of results) {
    const name = result.agentName.padEnd(15);
    const calls = result.calls.toString().padStart(6);
    const created = formatNumber(result.cacheCreationTokens).padStart(13);
    const read = formatNumber(result.cacheReadTokens).padStart(13);
    const hitRate = formatPercent(result.cacheHitRate).padStart(10);

    console.log(`│ ${name} │ ${calls} │ ${created} │ ${read} │ ${hitRate} │`);

    totalCacheCreated += result.cacheCreationTokens;
    totalCacheRead += result.cacheReadTokens;
    totalSavings += result.estimatedSavings;
  }

  console.log('├─────────────────┼────────┼───────────────┼───────────────┼────────────┤');

  const totalHitRate = totalCacheCreated + totalCacheRead > 0
    ? totalCacheRead / (totalCacheCreated + totalCacheRead)
    : 0;

  console.log(`│ ${'TOTAL'.padEnd(15)} │ ${results.reduce((a, r) => a + r.calls, 0).toString().padStart(6)} │ ${formatNumber(totalCacheCreated).padStart(13)} │ ${formatNumber(totalCacheRead).padStart(13)} │ ${formatPercent(totalHitRate).padStart(10)} │`);
  console.log('└─────────────────┴────────┴───────────────┴───────────────┴────────────┘');

  console.log('');
  console.log(`💰 Estimated cost savings from caching: $${totalSavings.toFixed(4)}`);
  console.log('');

  // Assessment
  console.log('Assessment:');
  if (totalCacheRead > 0) {
    console.log('  ✅ Caching is WORKING - cache reads detected');
  } else if (totalCacheCreated > 0) {
    console.log('  ⚠️  Cache entries CREATED but no reads yet (expected on first run)');
    console.log('     Run again to see cache hits!');
  } else {
    console.log('  ❌ Caching may NOT be working - no cache activity detected');
  }

  // Per-agent assessment
  console.log('\nPer-agent assessment:');
  for (const result of results) {
    const status = result.cacheReadTokens > 0
      ? '✅'
      : result.cacheCreationTokens > 0
        ? '⚠️ '
        : '❌';
    const note = result.cacheReadTokens > 0
      ? `${formatPercent(result.cacheHitRate)} hit rate`
      : result.cacheCreationTokens > 0
        ? 'cache created, no reads yet'
        : 'no cache activity';
    console.log(`  ${status} ${result.agentName}: ${note}`);
  }

  console.log('');
}

// =============================================================================
// Entry Point
// =============================================================================

runTests().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

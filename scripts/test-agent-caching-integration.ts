#!/usr/bin/env npx tsx
/**
 * Agent Caching Integration Test
 *
 * Creates a realistic interview sandbox and tests each agent
 * with appropriate inputs to verify caching is working.
 *
 * Usage:
 *   npx tsx scripts/test-agent-caching-integration.ts
 */

import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// Mock Interview Sandbox Data
// =============================================================================

const MOCK_SESSION = {
  sessionId: `test-session-${Date.now()}`,
  candidateId: `test-candidate-${Date.now()}`,
  questionTitle: 'Two Sum',
  questionDescription: `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

Example:
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].`,
  language: 'typescript',
  starterCode: `function twoSum(nums: number[], target: number): number[] {
  // Your code here
}`,
  candidateCode: `function twoSum(nums: number[], target: number): number[] {
  const map = new Map<number, number>();

  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement)!, i];
    }
    map.set(nums[i], i);
  }

  return [];
}`,
  testResults: `✓ Test 1: twoSum([2,7,11,15], 9) => [0,1] PASSED
✓ Test 2: twoSum([3,2,4], 6) => [1,2] PASSED
✓ Test 3: twoSum([3,3], 6) => [0,1] PASSED
All tests passed!`,
};

// Candidate's conversation with the AI
const MOCK_CONVERSATION: Array<{ role: 'user' | 'assistant'; content: string }> = [
  {
    role: 'user',
    content: 'I need to solve the Two Sum problem. Can you help me understand the approach?',
  },
  {
    role: 'assistant',
    content: `Great question! For the Two Sum problem, there are a few approaches:

1. **Brute Force** (O(n²)): Check every pair of numbers
2. **Hash Map** (O(n)): Store seen numbers and check for complements

The hash map approach is optimal. As you iterate through the array:
- Calculate the complement (target - current number)
- Check if complement exists in the map
- If yes, return both indices
- If no, store current number and index in the map

Would you like me to help you implement this approach?`,
  },
  {
    role: 'user',
    content: 'Yes, I tried implementing it but I\'m getting a type error with Map.get(). Can you help debug?',
  },
  {
    role: 'assistant',
    content: `The issue is that \`Map.get()\` returns \`T | undefined\`, so TypeScript doesn't know if it found a value.

Since you've already checked \`map.has(complement)\`, you can use the non-null assertion operator:

\`\`\`typescript
return [map.get(complement)!, i];
\`\`\`

The \`!\` tells TypeScript you're confident the value exists. This is safe here because you checked with \`has()\` first.

Alternatively, you could store the result:
\`\`\`typescript
const complementIndex = map.get(complement);
if (complementIndex !== undefined) {
  return [complementIndex, i];
}
\`\`\``,
  },
];

// =============================================================================
// Cache Metrics Tracking
// =============================================================================

interface CacheResult {
  agentName: string;
  callNumber: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreated: number;
  cacheRead: number;
  cacheHitRate: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

const results: CacheResult[] = [];

function extractCacheMetrics(response: Anthropic.Message): {
  inputTokens: number;
  outputTokens: number;
  cacheCreated: number;
  cacheRead: number;
} {
  const usage = response.usage as any;
  return {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    cacheCreated: usage.cache_creation_input_tokens || 0,
    cacheRead: usage.cache_read_input_tokens || 0,
  };
}

function logResult(result: CacheResult): void {
  const status = result.success ? '✅' : '❌';
  const cacheStatus = result.cacheRead > 0 ? '🔵 CACHE HIT' : result.cacheCreated > 0 ? '🟡 CACHE CREATED' : '⚪ NO CACHE';

  console.log(`  ${status} Call ${result.callNumber}: ${cacheStatus}`);
  console.log(`     Input: ${result.inputTokens} | Output: ${result.outputTokens} | Cache Created: ${result.cacheCreated} | Cache Read: ${result.cacheRead}`);
  if (result.cacheRead > 0) {
    console.log(`     💰 Cache hit rate: ${(result.cacheHitRate * 100).toFixed(1)}%`);
  }
  console.log(`     ⏱️  Latency: ${result.latencyMs}ms`);
  if (result.error) {
    console.log(`     Error: ${result.error}`);
  }
}

// =============================================================================
// Test 1: Chat Service (Simple guidance, no tools)
// =============================================================================

async function testChatService(client: Anthropic): Promise<void> {
  console.log('\n📝 Testing Chat Service (lib/services/claude.ts)');
  console.log('   Purpose: Simple chat guidance during interview (no tools)');
  console.log('─'.repeat(60));

  // Import the actual service
  const { buildChatSystemPromptWithCaching } = await import('../lib/prompts/chat-system');
  const { addMessageCacheBreakpoints } = await import('../lib/utils/agent-utils');

  const systemPrompt = buildChatSystemPromptWithCaching({
    problemTitle: MOCK_SESSION.questionTitle,
    problemDescription: MOCK_SESSION.questionDescription,
    language: MOCK_SESSION.language,
    starterCode: MOCK_SESSION.starterCode,
    currentCode: MOCK_SESSION.candidateCode,
    testResults: MOCK_SESSION.testResults,
  });

  // Make 3 calls with growing conversation to test caching
  const conversation: Anthropic.MessageParam[] = [];

  for (let i = 0; i < 3; i++) {
    const userMessage = [
      'What is the time complexity of my solution?',
      'How can I optimize the space complexity?',
      'Are there any edge cases I should handle?',
    ][i];

    conversation.push({ role: 'user', content: userMessage });

    const startTime = Date.now();
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 512,
        system: systemPrompt,
        messages: addMessageCacheBreakpoints(conversation),
      });

      const metrics = extractCacheMetrics(response);
      const latency = Date.now() - startTime;

      // Add assistant response to conversation
      const assistantText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join('');
      conversation.push({ role: 'assistant', content: assistantText });

      const result: CacheResult = {
        agentName: 'ChatService',
        callNumber: i + 1,
        ...metrics,
        cacheHitRate: metrics.inputTokens > 0 ? metrics.cacheRead / metrics.inputTokens : 0,
        latencyMs: latency,
        success: true,
      };
      results.push(result);
      logResult(result);

    } catch (error) {
      const result: CacheResult = {
        agentName: 'ChatService',
        callNumber: i + 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreated: 0,
        cacheRead: 0,
        cacheHitRate: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: (error as Error).message,
      };
      results.push(result);
      logResult(result);
    }

    await sleep(1000); // Avoid rate limiting
  }
}

// =============================================================================
// Test 2: Question Evaluation Agent (Rubric-based evaluation)
// =============================================================================

async function testQuestionEvaluationAgent(client: Anthropic): Promise<void> {
  console.log('\n📊 Testing Question Evaluation Agent (lib/agents/question-evaluation-agent.ts)');
  console.log('   Purpose: Evaluate candidate code submissions with 5-criteria rubric');
  console.log('─'.repeat(60));

  const { buildCachedSystemPrompt, addMessageCacheBreakpoints, extractCacheMetrics: extractMetrics, logCacheMetrics } = await import('../lib/utils/agent-utils');

  // Evaluation system prompt (simplified from actual agent)
  const EVALUATION_SYSTEM_PROMPT = `You are an expert code evaluator for technical interviews.

Evaluate the candidate's solution based on these criteria:
1. Correctness (0-100): Does the code solve the problem correctly?
2. Efficiency (0-100): Is the algorithm optimal (time/space complexity)?
3. Code Quality (0-100): Is the code clean, readable, and well-structured?
4. Edge Cases (0-100): Does the code handle edge cases?
5. Best Practices (0-100): Does the code follow language best practices?

Problem: ${MOCK_SESSION.questionTitle}
${MOCK_SESSION.questionDescription}

Candidate's Code:
\`\`\`${MOCK_SESSION.language}
${MOCK_SESSION.candidateCode}
\`\`\`

Test Results:
${MOCK_SESSION.testResults}

Provide a JSON evaluation with scores and brief justification for each criterion.`;

  const cachedSystemPrompt = buildCachedSystemPrompt(EVALUATION_SYSTEM_PROMPT);

  // Make multiple evaluation calls (simulating re-evaluation or different aspects)
  const evaluationPrompts = [
    'Evaluate the correctness and efficiency of this solution.',
    'Now evaluate the code quality and best practices.',
    'Finally, provide an overall assessment with a final score.',
  ];

  const conversation: Anthropic.MessageParam[] = [];

  for (let i = 0; i < evaluationPrompts.length; i++) {
    conversation.push({ role: 'user', content: evaluationPrompts[i] });

    const startTime = Date.now();
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: cachedSystemPrompt,
        messages: addMessageCacheBreakpoints(conversation),
      });

      const metrics = extractMetrics(response);
      const latency = Date.now() - startTime;

      // Add assistant response
      const assistantText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join('');
      conversation.push({ role: 'assistant', content: assistantText });

      const result: CacheResult = {
        agentName: 'QuestionEvaluationAgent',
        callNumber: i + 1,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        cacheCreated: metrics.cacheCreationInputTokens,
        cacheRead: metrics.cacheReadInputTokens,
        cacheHitRate: metrics.inputTokens > 0 ? metrics.cacheReadInputTokens / metrics.inputTokens : 0,
        latencyMs: latency,
        success: true,
      };
      results.push(result);
      logResult(result);

    } catch (error) {
      const result: CacheResult = {
        agentName: 'QuestionEvaluationAgent',
        callNumber: i + 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreated: 0,
        cacheRead: 0,
        cacheHitRate: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: (error as Error).message,
      };
      results.push(result);
      logResult(result);
    }

    await sleep(1000);
  }
}

// =============================================================================
// Test 3: Prompt Analysis (Analyze candidate's prompt quality)
// =============================================================================

async function testPromptAnalysis(client: Anthropic): Promise<void> {
  console.log('\n🔍 Testing Prompt Analysis (lib/evaluation/prompt-analysis.ts)');
  console.log('   Purpose: Analyze quality of prompts candidates send to AI');
  console.log('─'.repeat(60));

  const { buildCachedSystemPrompt, extractCacheMetrics: extractMetrics } = await import('../lib/utils/agent-utils');

  // NOTE: This prompt must be ~1024+ tokens to enable Anthropic's caching
  const PROMPT_ANALYZER_SYSTEM = `You are an expert evaluator of AI prompt quality in technical interviews. Your role is to objectively assess how effectively candidates communicate with AI coding assistants during real-world programming tasks.

## Evaluation Framework

Analyze each prompt a candidate sends to an AI coding assistant and score it across four key dimensions:

### 1. Specificity (0-100)
Measures how precise and contextual the prompt is. High-scoring prompts include:
- **File references**: Specific file names, paths, or line numbers (e.g., "In src/utils/parser.ts at line 45...")
- **Error context**: Exact error messages, stack traces, or test failure outputs
- **Concrete examples**: Sample inputs, expected outputs, or edge cases
- **Prior attempts**: What the candidate has already tried and why it didn't work
- **Constraints**: Memory limits, time complexity requirements, API limitations

Score guide:
- 90-100: Includes multiple specific details, error messages, and clear constraints
- 70-89: Includes some specific context but missing key details
- 50-69: Generic with minimal context (e.g., "this function isn't working")
- 0-49: Extremely vague with no actionable context

### 2. Clarity (0-100)
Measures how well the request is communicated. High-scoring prompts are:
- **Unambiguous**: Single clear interpretation of what's being asked
- **Well-structured**: Organized thoughts, possibly using formatting or sections
- **Action-oriented**: Clear about what outcome is desired
- **Complete**: All necessary information in one message (not requiring clarification)

Red flags that reduce clarity scores:
- Vague language: "make it work", "fix this", "help me", "something is wrong"
- Multiple unrelated questions in one prompt
- Stream of consciousness without organization
- Missing crucial context that would require follow-up questions

Score guide:
- 90-100: Crystal clear, well-organized, single interpretation possible
- 70-89: Clear but could be better organized or more precise
- 50-69: Understandable but requires interpretation or has ambiguity
- 0-49: Confusing, disorganized, or incomprehensible

### 3. Technical Depth (0-100)
Measures the candidate's demonstrated technical understanding. High-scoring prompts show:
- **Problem understanding**: Articulates WHY something might not be working
- **Algorithm awareness**: Mentions relevant algorithms, data structures, patterns
- **Debugging reasoning**: Forms hypotheses about root causes
- **Trade-off awareness**: Considers performance, maintainability, edge cases
- **Technical vocabulary**: Uses correct terminology for the domain

Score guide:
- 90-100: Demonstrates deep understanding, forms hypotheses, discusses trade-offs
- 70-89: Shows good technical grasp with some reasoning
- 50-69: Basic technical awareness without deeper analysis
- 0-49: Minimal technical engagement, treats AI as magic

### 4. Iteration Quality
This is calculated separately by analyzing prompt sequences. Good iteration shows:
- Learning from previous AI responses
- Refining questions based on new information
- Progressive narrowing toward solution
- Not repeating the same vague question

## Output Requirements

For each prompt analyzed, provide:
- **Analysis**: 1-2 sentence explanation of the overall quality
- **Strength**: What was done well (optional, only if notable)
- **Weakness**: What could be improved (optional, only if notable)
- **Category**: One of: excellent | good | needs_improvement | poor
- **Scores**: Numeric scores (0-100) for specificity, clarity, and technicalDepth

## Evaluation Principles

1. **Be objective**: Base scores on evidence, not assumptions about intent
2. **Consider context**: A simple question for a simple task is appropriate
3. **Value precision**: Specific, actionable prompts are more valuable than verbose ones
4. **Reward debugging mindset**: Candidates who show reasoning process score higher
5. **Recognize good AI collaboration**: Effective prompts leverage AI strengths

## Examples of Each Category

**Excellent (90-100)**:
"I'm implementing a LRU cache in TypeScript. My get() method at line 34 of cache.ts returns undefined for keys that should exist. I've verified the key is being added in put() (logged at line 28). I suspect the issue is in my doubly-linked list node removal - specifically whether I'm updating the prev/next pointers correctly when moving a node to the front. Can you review my moveToFront() method?"

**Good (70-89)**:
"My binary search function returns -1 when searching for values that exist in the array. Here's the function: [code]. I think the issue might be in how I'm calculating the midpoint or updating the boundaries."

**Needs Improvement (50-69)**:
"Why isn't my search working? It keeps returning -1."

**Poor (0-49)**:
"Help me fix this"

Be thorough but fair in your evaluations. The goal is to provide actionable insights that help improve AI collaboration skills.`;

  const cachedSystemPrompt = buildCachedSystemPrompt(PROMPT_ANALYZER_SYSTEM);

  // Analyze the mock conversation prompts
  const candidatePrompts = MOCK_CONVERSATION
    .filter((m) => m.role === 'user')
    .map((m) => m.content);

  for (let i = 0; i < candidatePrompts.length; i++) {
    const startTime = Date.now();
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 512,
        system: cachedSystemPrompt,
        messages: [
          {
            role: 'user',
            content: `Analyze this candidate prompt:\n\n"${candidatePrompts[i]}"`,
          },
        ],
      });

      const metrics = extractMetrics(response);
      const latency = Date.now() - startTime;

      const result: CacheResult = {
        agentName: 'PromptAnalysis',
        callNumber: i + 1,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        cacheCreated: metrics.cacheCreationInputTokens,
        cacheRead: metrics.cacheReadInputTokens,
        cacheHitRate: metrics.inputTokens > 0 ? metrics.cacheReadInputTokens / metrics.inputTokens : 0,
        latencyMs: latency,
        success: true,
      };
      results.push(result);
      logResult(result);

    } catch (error) {
      const result: CacheResult = {
        agentName: 'PromptAnalysis',
        callNumber: i + 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreated: 0,
        cacheRead: 0,
        cacheHitRate: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: (error as Error).message,
      };
      results.push(result);
      logResult(result);
    }

    await sleep(1000);
  }
}

// =============================================================================
// Test 4: Supervisor Agent (Coordinate between agents)
// =============================================================================

async function testSupervisorAgent(client: Anthropic): Promise<void> {
  console.log('\n🎯 Testing Supervisor Agent (lib/agents/supervisor-agent.ts)');
  console.log('   Purpose: Coordinate between Coding, Interview, and Evaluation agents');
  console.log('─'.repeat(60));

  const { buildCachedSystemPrompt, extractCacheMetrics: extractMetrics } = await import('../lib/utils/agent-utils');

  // NOTE: This prompt must be ~1024+ tokens to enable Anthropic's caching
  const SUPERVISOR_SYSTEM = `You are a Supervisor Agent coordinating an AI-powered technical interview platform called InterviewLM. Your primary responsibility is to route requests between specialized agents while maintaining interview integrity and tracking all relevant events.

## Platform Overview

InterviewLM evaluates candidates' ability to effectively collaborate with AI coding tools in realistic development environments. Candidates work in secure sandboxes solving coding problems with AI assistance. The platform monitors problem-solving approach, AI prompt quality, and code quality to provide comprehensive assessments.

## Specialized Agents Under Your Coordination

### 1. Coding Agent
The Coding Agent provides direct assistance to candidates during interviews. It operates within a Modal AI sandbox environment with access to file system, terminal, and code execution capabilities.

**When to use handoff_to_coding_agent:**
- Writing, editing, or refactoring code
- Debugging issues, analyzing errors, or fixing bugs
- Running tests and interpreting results
- File system operations (create, read, update files)
- Understanding code structure or architecture
- Implementing algorithms or data structures
- Explaining code concepts or patterns

**Parameters:**
- task_description: Clear description of what the candidate needs help with
- session_id: Session identifier for context tracking
- helpfulness_level: Level of assistance to provide:
  - consultant: Guidance and hints only, candidate writes code
  - pair-programming: Collaborative coding, AI and candidate work together
  - full-copilot: AI can write complete implementations

### 2. Interview Agent
The Interview Agent runs silently in the background, tracking metrics and events for later evaluation. Candidates are not aware of this agent.

**When to use handoff_to_interview_agent:**
- After any AI interaction to log the exchange
- When code changes are detected
- After test runs (pass or fail)
- When a question is answered or submitted
- At session start and completion

**Event Types:**
- session-started: Interview session begins
- ai-interaction: Candidate interacted with AI assistant
- code-changed: Code was modified in the sandbox
- test-run: Tests were executed
- question-answered: Candidate submitted their answer
- session-complete: Interview session ended

**Event Data Structure:**
Event data should include relevant context like timestamps, prompt quality indicators, code diffs, test results, and any performance metrics available.

### 3. Evaluation Agent
The Evaluation Agent performs comprehensive assessment of completed interview sessions.

**When to use handoff_to_evaluation_agent:**
- Only after session-complete event has been recorded
- When the interview is fully finished
- To generate final candidate assessment

**Evaluation Dimensions:**
- Code Quality: Correctness, efficiency, maintainability, best practices
- Problem Solving: Approach, decomposition, debugging strategy
- AI Collaboration: Prompt quality, iteration effectiveness, tool usage
- Communication: Clarity, technical vocabulary, documentation

## Your Responsibilities

1. **Request Routing**: Analyze incoming requests and route to the appropriate agent
2. **Event Tracking**: Ensure all significant events are logged via Interview Agent
3. **Workflow Coordination**: Manage multi-step workflows that span multiple agents
4. **Interview Integrity**: Never reveal evaluation details, scores, or internal metrics to candidates
5. **Session Management**: Track session state and ensure proper workflow completion

## Workflow Patterns

### Coding Assistance Request
1. handoff_to_coding_agent with task description
2. handoff_to_interview_agent to record ai-interaction event
3. Continue or complete based on context

### Test Execution
1. handoff_to_coding_agent to run tests
2. handoff_to_interview_agent to record test-run event with results

### Session Completion
1. handoff_to_interview_agent to record session-complete event
2. handoff_to_evaluation_agent to generate assessment
3. complete_workflow with summary

## Important Guidelines

- Always maintain candidate-facing neutrality - don't reveal scoring or evaluation
- Log events promptly to ensure complete data for evaluation
- When uncertain about routing, prefer Coding Agent for candidate-facing requests
- Use complete_workflow only when all tasks are genuinely finished
- Include comprehensive task descriptions when handing off to other agents

Current session: ${MOCK_SESSION.sessionId}
Candidate: ${MOCK_SESSION.candidateId}
Problem: ${MOCK_SESSION.questionTitle}

Use your judgment to coordinate effectively while maintaining interview integrity.`;

  const cachedSystemPrompt = buildCachedSystemPrompt(SUPERVISOR_SYSTEM);
  const { addMessageCacheBreakpoints } = await import('../lib/utils/agent-utils');

  // Supervisor routing tasks - build conversation to test cache
  const routingTasks = [
    'The candidate is asking for help debugging their code. Route appropriately.',
    'The candidate has submitted their solution. Time to evaluate their work.',
    'Record that the candidate completed the problem and update metrics.',
  ];

  // Accumulate conversation to enable message caching
  const conversation: Anthropic.MessageParam[] = [];

  for (let i = 0; i < routingTasks.length; i++) {
    conversation.push({ role: 'user', content: routingTasks[i] });

    const startTime = Date.now();
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 512,
        system: cachedSystemPrompt,
        messages: addMessageCacheBreakpoints(conversation),
      });

      // Add assistant response to conversation for next iteration
      const assistantText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join('');
      conversation.push({ role: 'assistant', content: assistantText });

      const metrics = extractMetrics(response);
      const latency = Date.now() - startTime;

      const result: CacheResult = {
        agentName: 'SupervisorAgent',
        callNumber: i + 1,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        cacheCreated: metrics.cacheCreationInputTokens,
        cacheRead: metrics.cacheReadInputTokens,
        cacheHitRate: metrics.inputTokens > 0 ? metrics.cacheReadInputTokens / metrics.inputTokens : 0,
        latencyMs: latency,
        success: true,
      };
      results.push(result);
      logResult(result);

    } catch (error) {
      const result: CacheResult = {
        agentName: 'SupervisorAgent',
        callNumber: i + 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreated: 0,
        cacheRead: 0,
        cacheHitRate: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: (error as Error).message,
      };
      results.push(result);
      logResult(result);
    }

    await sleep(1000);
  }
}

// =============================================================================
// Utilities
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Summary Report
// =============================================================================

function printSummary(): void {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          CACHING TEST SUMMARY                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Group by agent
  const byAgent = new Map<string, CacheResult[]>();
  for (const r of results) {
    if (!byAgent.has(r.agentName)) {
      byAgent.set(r.agentName, []);
    }
    byAgent.get(r.agentName)!.push(r);
  }

  // Print per-agent summary
  console.log('┌───────────────────────────┬────────┬──────────────┬──────────────┬─────────────┐');
  console.log('│ Agent                     │ Calls  │ Cache Create │ Cache Read   │ Hit Rate    │');
  console.log('├───────────────────────────┼────────┼──────────────┼──────────────┼─────────────┤');

  let totalCacheCreated = 0;
  let totalCacheRead = 0;
  let totalInputTokens = 0;
  let totalCalls = 0;
  let successfulCalls = 0;

  for (const [agent, agentResults] of byAgent) {
    const successful = agentResults.filter((r) => r.success);
    const cacheCreated = successful.reduce((sum, r) => sum + r.cacheCreated, 0);
    const cacheRead = successful.reduce((sum, r) => sum + r.cacheRead, 0);
    const inputTokens = successful.reduce((sum, r) => sum + r.inputTokens, 0);
    const hitRate = inputTokens > 0 ? (cacheRead / inputTokens) : 0;

    totalCacheCreated += cacheCreated;
    totalCacheRead += cacheRead;
    totalInputTokens += inputTokens;
    totalCalls += agentResults.length;
    successfulCalls += successful.length;

    const name = agent.padEnd(25);
    const calls = `${successful.length}/${agentResults.length}`.padStart(6);
    const created = cacheCreated.toLocaleString().padStart(12);
    const read = cacheRead.toLocaleString().padStart(12);
    const rate = `${(hitRate * 100).toFixed(1)}%`.padStart(11);

    console.log(`│ ${name} │ ${calls} │ ${created} │ ${read} │ ${rate} │`);
  }

  console.log('├───────────────────────────┼────────┼──────────────┼──────────────┼─────────────┤');

  const totalHitRate = totalInputTokens > 0 ? (totalCacheRead / totalInputTokens) : 0;
  console.log(`│ ${'TOTAL'.padEnd(25)} │ ${`${successfulCalls}/${totalCalls}`.padStart(6)} │ ${totalCacheCreated.toLocaleString().padStart(12)} │ ${totalCacheRead.toLocaleString().padStart(12)} │ ${`${(totalHitRate * 100).toFixed(1)}%`.padStart(11)} │`);
  console.log('└───────────────────────────┴────────┴──────────────┴──────────────┴─────────────┘');

  // Cost savings calculation
  const INPUT_COST_PER_MILLION = 3.0; // Sonnet
  const regularCost = (totalCacheRead / 1_000_000) * INPUT_COST_PER_MILLION;
  const cachedCost = (totalCacheRead / 1_000_000) * INPUT_COST_PER_MILLION * 0.1;
  const savings = regularCost - cachedCost;

  console.log('');
  console.log('💰 Cost Analysis:');
  console.log(`   Cache read tokens: ${totalCacheRead.toLocaleString()}`);
  console.log(`   Without caching: $${regularCost.toFixed(4)}`);
  console.log(`   With caching:    $${cachedCost.toFixed(4)}`);
  console.log(`   Savings:         $${savings.toFixed(4)} (90% on cache reads)`);

  // Assessment
  console.log('');
  console.log('📋 Assessment:');

  if (successfulCalls === 0) {
    console.log('   ❌ No successful API calls - check API key and credits');
  } else if (totalCacheRead > 0) {
    console.log('   ✅ CACHING IS WORKING - Cache hits detected!');
    console.log(`   📊 Overall cache hit rate: ${(totalHitRate * 100).toFixed(1)}%`);
  } else if (totalCacheCreated > 0) {
    console.log('   ⚠️  Cache entries created but no hits yet');
    console.log('   💡 This is expected for first run - subsequent calls should hit cache');
  } else {
    console.log('   ❌ No cache activity detected - caching may not be working');
  }

  // Per-agent status
  console.log('');
  console.log('Per-agent caching status:');
  for (const [agent, agentResults] of byAgent) {
    const successful = agentResults.filter((r) => r.success);
    const cacheRead = successful.reduce((sum, r) => sum + r.cacheRead, 0);
    const cacheCreated = successful.reduce((sum, r) => sum + r.cacheCreated, 0);

    let status = '❌';
    let note = 'no cache activity';
    if (cacheRead > 0) {
      status = '✅';
      note = 'cache hits detected';
    } else if (cacheCreated > 0) {
      status = '🟡';
      note = 'cache created, waiting for hits';
    } else if (successful.length === 0) {
      note = 'all calls failed';
    }

    console.log(`   ${status} ${agent}: ${note}`);
  }

  console.log('');
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║           Agent Caching Integration Test - Interview Sandbox             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ERROR: ANTHROPIC_API_KEY environment variable is not set');
    process.exit(1);
  }

  console.log('🎭 Creating mock interview sandbox...');
  console.log(`   Session ID: ${MOCK_SESSION.sessionId}`);
  console.log(`   Candidate ID: ${MOCK_SESSION.candidateId}`);
  console.log(`   Problem: ${MOCK_SESSION.questionTitle}`);
  console.log(`   Language: ${MOCK_SESSION.language}`);
  console.log('');

  // Create client with caching enabled
  const client = new Anthropic({
    defaultHeaders: {
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
  });

  try {
    // Run tests for each agent
    await testChatService(client);
    await testQuestionEvaluationAgent(client);
    await testPromptAnalysis(client);
    await testSupervisorAgent(client);

    // Print summary
    printSummary();

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();

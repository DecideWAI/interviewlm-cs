/**
 * Test script to verify LangSmith thread tracking is working
 *
 * Run with: LANGSMITH_TRACING=true npx ts-node scripts/test-langsmith.ts
 *
 * Prerequisites:
 * - LANGSMITH_API_KEY environment variable
 * - LANGSMITH_PROJECT environment variable (optional, defaults to "interviewlm")
 * - ANTHROPIC_API_KEY environment variable
 */

import {
  getTracedAnthropicClient,
  traceAgentSession,
  traceToolExecution,
  getLangSmithStatus,
  getCurrentThreadId,
  getCurrentRunId,
} from "../lib/observability/langsmith";

async function simulateTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  return traceToolExecution(toolName, input, async () => {
    // Simulate tool execution
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { success: true, result: `Executed ${toolName}` };
  });
}

async function testLangSmithThreads(): Promise<void> {
  console.log("🧪 Testing LangSmith Thread Tracking\n");
  console.log("=".repeat(50));

  // Check LangSmith status
  const status = getLangSmithStatus();
  console.log("\nLangSmith Configuration:");
  console.log(`  Enabled: ${status.enabled}`);
  console.log(`  Project: ${status.project}`);
  console.log(`  Endpoint: ${status.endpoint}`);

  if (!status.enabled) {
    console.log("\n⚠️  LangSmith is not enabled!");
    console.log("   Set LANGSMITH_TRACING=true and LANGSMITH_API_KEY to enable.");
    return;
  }

  const sessionId = `test-session-${Date.now()}`;
  const candidateId = "test-candidate-123";

  console.log(`\n📍 Test Session: ${sessionId}`);
  console.log(`   Candidate: ${candidateId}`);

  // Simulate multiple agent turns in the same session
  // Each turn gets a unique run_id, all grouped under the same thread_id (sessionId)
  for (let turn = 1; turn <= 3; turn++) {
    const message = `This is test turn ${turn}. Say hello briefly.`;
    console.log(`\n--- Agent Turn ${turn} ---`);
    console.log(`   Message: "${message}"`);

    await traceAgentSession(
      sessionId,
      candidateId,
      async () => {
        console.log(`   Thread ID: ${getCurrentThreadId()}`);
        console.log(`   Run ID: ${getCurrentRunId()}`);

        // Get traced client
        const client = getTracedAnthropicClient(sessionId);

        // Make a Claude API call
        console.log("   Making Claude API call...");
        const response = await client.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 50,
          messages: [
            { role: "user", content: message },
          ],
        });

        console.log(`   Response: ${response.content[0].type === 'text' ? response.content[0].text.slice(0, 50) : '...'}`);

        // Simulate some tool executions
        console.log("   Executing tools...");
        await simulateTool("Read", { file_path: "test.js" });
        await simulateTool("Write", { file_path: "output.js", content: "test" });

        return { turn, success: true };
      },
      { message } // Pass message for trace metadata
    );
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Test complete!");
  console.log("\nCheck LangSmith dashboard to verify:");
  console.log(`1. All 3 turns appear under the same thread (thread_id: ${sessionId.slice(0, 20)}...)`);
  console.log("2. Each turn has a unique run_id (shown above)");
  console.log("3. Each turn contains: agent_turn -> claude call + tool executions");
  console.log("4. Metadata includes: thread_id, run_id, sessionId, candidateId, message_preview");
  console.log(`\nProject URL: https://smith.langchain.com/o/default/projects/p/${status.project}`);
}

// Run the test
testLangSmithThreads()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });

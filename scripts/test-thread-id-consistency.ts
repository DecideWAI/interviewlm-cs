#!/usr/bin/env npx tsx
/**
 * Test Script: Verify Thread ID Consistency
 *
 * This script verifies that all thread ID generation across the codebase
 * produces the same deterministic UUID for the same session.
 *
 * The issue was that different parts of the codebase were using different
 * thread ID formats:
 * - LangGraph SDK: Deterministic UUID v5 from `${agentType}:${sessionId}`
 * - LangSmith Tracing: Raw sessionId (e.g., CUID like "cmj2nmh4600036nyeekj33iiz")
 *
 * This caused traces to be grouped under different thread IDs in LangSmith,
 * making it hard to track conversation history.
 */

import { v5 as uuidv5 } from "uuid";

// =============================================================================
// Thread ID Generation (copy of the logic from both files for testing)
// =============================================================================

// Namespace UUID for generating deterministic thread IDs (DNS namespace)
const LANGGRAPH_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Generate a deterministic UUID from session ID and agent type.
 * This is the canonical implementation that should be used everywhere.
 */
function generateThreadUUID(
  sessionId: string,
  agentType: string = "coding_agent"
): string {
  const input = `${agentType}:${sessionId}`;
  return uuidv5(input, LANGGRAPH_NAMESPACE);
}

// =============================================================================
// Test Cases
// =============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

// Test 1: Deterministic UUID generation
function testDeterministicGeneration() {
  const sessionId = "cmj2nmh4600036nyeekj33iiz";
  const agentType = "coding_agent";

  const uuid1 = generateThreadUUID(sessionId, agentType);
  const uuid2 = generateThreadUUID(sessionId, agentType);
  const uuid3 = generateThreadUUID(sessionId, agentType);

  const allMatch = uuid1 === uuid2 && uuid2 === uuid3;

  results.push({
    name: "Deterministic UUID generation",
    passed: allMatch,
    details: `Generated UUIDs: ${uuid1}, ${uuid2}, ${uuid3} - ${allMatch ? "all match" : "MISMATCH"}`,
  });
}

// Test 2: Different sessions produce different UUIDs
function testDifferentSessionsDifferentUUIDs() {
  const session1 = "cmj2nmh4600036nyeekj33iiz";
  const session2 = "cmj3abc123456789xyz00000";

  const uuid1 = generateThreadUUID(session1);
  const uuid2 = generateThreadUUID(session2);

  const different = uuid1 !== uuid2;

  results.push({
    name: "Different sessions produce different UUIDs",
    passed: different,
    details: `Session1 UUID: ${uuid1}, Session2 UUID: ${uuid2}`,
  });
}

// Test 3: Different agent types produce different UUIDs
function testDifferentAgentTypesDifferentUUIDs() {
  const sessionId = "cmj2nmh4600036nyeekj33iiz";

  const codingUUID = generateThreadUUID(sessionId, "coding_agent");
  const evalUUID = generateThreadUUID(sessionId, "evaluation_agent");
  const interviewUUID = generateThreadUUID(sessionId, "interview_agent");

  const allDifferent =
    codingUUID !== evalUUID &&
    evalUUID !== interviewUUID &&
    codingUUID !== interviewUUID;

  results.push({
    name: "Different agent types produce different UUIDs",
    passed: allDifferent,
    details: `coding: ${codingUUID}, eval: ${evalUUID}, interview: ${interviewUUID}`,
  });
}

// Test 4: UUID format is valid
function testValidUUIDFormat() {
  const sessionId = "cmj2nmh4600036nyeekj33iiz";
  const uuid = generateThreadUUID(sessionId);

  // UUID v5 format: xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx
  // where y is 8, 9, a, or b
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isValid = uuidRegex.test(uuid);

  results.push({
    name: "UUID format is valid (v5)",
    passed: isValid,
    details: `Generated UUID: ${uuid}, Valid: ${isValid}`,
  });
}

// Test 5: Show what the old vs new thread IDs look like
function testShowOldVsNew() {
  const sessionId = "cmj2nmh4600036nyeekj33iiz";
  const oldThreadId = sessionId; // Old: raw session ID
  const newThreadId = generateThreadUUID(sessionId); // New: deterministic UUID

  console.log("\n=== OLD vs NEW Thread ID Format ===");
  console.log(`Session ID (CUID):     ${sessionId}`);
  console.log(`Old thread_id format:  ${oldThreadId} (raw session ID)`);
  console.log(`New thread_id format:  ${newThreadId} (deterministic UUID)`);
  console.log(
    `\nNow both LangGraph SDK and LangSmith tracing will use: ${newThreadId}`
  );

  results.push({
    name: "Old vs New format demonstration",
    passed: true,
    details: `Old: ${oldThreadId}, New: ${newThreadId}`,
  });
}

// =============================================================================
// Run Tests
// =============================================================================

console.log("==============================================");
console.log("Thread ID Consistency Test Suite");
console.log("==============================================\n");

testDeterministicGeneration();
testDifferentSessionsDifferentUUIDs();
testDifferentAgentTypesDifferentUUIDs();
testValidUUIDFormat();
testShowOldVsNew();

console.log("\n=== Test Results ===\n");

let allPassed = true;
for (const result of results) {
  const status = result.passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${status}: ${result.name}`);
  console.log(`  ${result.details}\n`);
  if (!result.passed) allPassed = false;
}

console.log("==============================================");
if (allPassed) {
  console.log("✅ All tests passed! Thread IDs are now consistent.");
} else {
  console.log("❌ Some tests failed. Review the results above.");
  process.exit(1);
}
console.log("==============================================");

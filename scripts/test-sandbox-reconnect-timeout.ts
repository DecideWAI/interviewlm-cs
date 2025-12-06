/**
 * Test Script: Sandbox Reconnect Timeout Issue
 *
 * Reproduces the issue where:
 * 1. Sandbox is created
 * 2. Some time passes (sandbox goes cold/sleeps)
 * 3. Reconnect times out in 2s
 * 4. New sandbox created unnecessarily
 *
 * Run with: npx tsx scripts/test-sandbox-reconnect-timeout.ts
 */

import { modalService, clearSandboxCache, isSandboxCached } from '../lib/services/modal';

const TEST_SESSION_ID = `reconnect-timeout-test-${Date.now()}`;

async function timeOperation<T>(name: string, operation: () => Promise<T>): Promise<{ result: T; elapsed: number }> {
  const start = Date.now();
  console.log(`\n⏳ ${name}...`);
  const result = await operation();
  const elapsed = Date.now() - start;
  console.log(`✅ ${name}: ${elapsed}ms`);
  return { result, elapsed };
}

async function runTest() {
  console.log('\n🔍 SANDBOX RECONNECT TIMEOUT TEST');
  console.log(`Session ID: ${TEST_SESSION_ID}`);
  console.log('═'.repeat(60));

  try {
    // ==========================================================================
    // STEP 1: Create sandbox
    // ==========================================================================
    console.log('\n═══ STEP 1: Create Sandbox ═══');

    const { result: sandbox } = await timeOperation(
      'Create sandbox',
      () => modalService.createSandbox(TEST_SESSION_ID, 'python')
    );
    console.log(`Sandbox ID: ${sandbox.id}`);

    // Write a test file
    await timeOperation(
      'Write test file',
      () => modalService.writeFile(TEST_SESSION_ID, 'test.py', 'print("hello")')
    );

    console.log(`\nCache status: ${isSandboxCached(TEST_SESSION_ID) ? 'CACHED' : 'NOT CACHED'}`);

    // ==========================================================================
    // STEP 2: Simulate time passing (sandbox goes cold)
    // ==========================================================================
    console.log('\n═══ STEP 2: Wait for Sandbox to Go Cold ═══');

    const waitTimes = [5, 10, 15, 20, 30, 45, 60];

    for (const waitTime of waitTimes) {
      console.log(`\n--- Testing with ${waitTime}s wait ---`);

      // Clear cache to simulate server restart / different process
      clearSandboxCache(TEST_SESSION_ID);
      console.log(`Cache cleared: ${!isSandboxCached(TEST_SESSION_ID)}`);

      console.log(`Waiting ${waitTime}s for sandbox to go cold...`);
      await new Promise(r => setTimeout(r, waitTime * 1000));

      // Try to get sandbox (should reconnect from DB)
      const { elapsed } = await timeOperation(
        `Get sandbox after ${waitTime}s`,
        () => modalService.getOrCreateSandbox(TEST_SESSION_ID, 'python')
      );

      // Check if file still exists (volume persistence)
      const { result: readResult } = await timeOperation(
        'Read test file',
        () => modalService.readFile(TEST_SESSION_ID, 'test.py')
      );

      console.log(`File exists: ${readResult.success}`);
      console.log(`Reconnect time: ${elapsed}ms`);

      if (elapsed > 5000) {
        console.log(`⚠️ WARNING: Reconnect took ${elapsed}ms - likely created new sandbox`);
      } else if (elapsed > 2000) {
        console.log(`ℹ️ INFO: Reconnect took ${elapsed}ms - sandbox was cold`);
      } else {
        console.log(`✅ GOOD: Reconnect took ${elapsed}ms`);
      }

      // Keep using the sandbox to keep it warm for next iteration
      await modalService.runCommand(TEST_SESSION_ID, 'echo "keepalive"');

      // If we hit a timeout, stop testing longer waits
      if (elapsed > 10000) {
        console.log('\n⚠️ Reconnect too slow, stopping test');
        break;
      }
    }

  } catch (error) {
    console.error('\n💥 Test failed:', error);
  }

  // Cleanup
  console.log('\n═══ CLEANUP ═══');
  try {
    await modalService.terminateSandbox(TEST_SESSION_ID);
    console.log('Sandbox terminated');
  } catch {
    console.log('Cleanup skipped');
  }
}

runTest().catch(console.error);

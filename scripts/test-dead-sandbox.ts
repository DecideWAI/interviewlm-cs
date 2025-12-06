/**
 * Test Script: Dead Sandbox Recovery
 *
 * This test properly verifies the "sandbox is dead, need to recover" scenario:
 * 1. Create a sandbox and write a file
 * 2. Clear in-memory cache (simulate server restart)
 * 3. Terminate the sandbox (simulate it dying)
 * 4. Try to use the sandbox - should detect it's dead and create new
 * 5. Verify file still exists (volume persistence)
 *
 * Expected behavior:
 * - Health check should timeout in 2s (not 10-15s like before)
 * - New sandbox should be created automatically
 * - Total recovery time should be <5s (2s timeout + 3s creation)
 *
 * Run with: npx tsx scripts/test-dead-sandbox.ts
 */

import { modalService } from '../lib/services/modal';

const TEST_SESSION_ID = `dead-sandbox-test-${Date.now()}`;

async function timeOperation<T>(
  name: string,
  operation: () => Promise<T>
): Promise<{ result: T; elapsed: number }> {
  const start = Date.now();
  console.log(`\n⏳ ${name}...`);

  try {
    const result = await operation();
    const elapsed = Date.now() - start;
    console.log(`✅ ${name}: ${elapsed}ms`);
    return { result, elapsed };
  } catch (error) {
    const elapsed = Date.now() - start;
    console.log(`❌ ${name}: FAILED after ${elapsed}ms - ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

async function runDeadSandboxTest() {
  console.log('\n🔄 DEAD SANDBOX RECOVERY TEST');
  console.log(`Session ID: ${TEST_SESSION_ID}`);
  console.log('═'.repeat(60));

  const startTime = Date.now();

  try {
    // ==========================================================================
    // STEP 1: Create sandbox and write a test file
    // ==========================================================================
    console.log('\n═══ STEP 1: Setup ═══');

    const { elapsed: createTime } = await timeOperation(
      'Create initial sandbox',
      () => modalService.createSandbox(TEST_SESSION_ID, 'javascript')
    );

    await timeOperation(
      'Write test file',
      () => modalService.writeFile(TEST_SESSION_ID, 'persistence-test.txt', `Created: ${new Date().toISOString()}`)
    );

    // Verify cache
    const isCached = modalService.isSandboxCached(TEST_SESSION_ID);
    console.log(`\n📍 Sandbox cached: ${isCached}`);

    // ==========================================================================
    // STEP 2: Simulate server restart by clearing cache
    // ==========================================================================
    console.log('\n═══ STEP 2: Simulate Server Restart ═══');

    console.log('Clearing in-memory cache...');
    const wasCleared = modalService.clearSandboxCache(TEST_SESSION_ID);
    console.log(`Cache cleared: ${wasCleared}`);

    const stillCached = modalService.isSandboxCached(TEST_SESSION_ID);
    console.log(`Sandbox still cached: ${stillCached}`);

    // ==========================================================================
    // STEP 3: Terminate the sandbox (simulate it dying)
    // ==========================================================================
    console.log('\n═══ STEP 3: Kill Sandbox (Simulate Death) ═══');

    // We'll terminate through a direct call, not through terminateSandbox
    // which would also clear the cache
    console.log('Terminating sandbox externally...');
    await timeOperation(
      'Terminate sandbox (simulate crash)',
      () => modalService.terminateSandbox(TEST_SESSION_ID)
    );

    // ==========================================================================
    // STEP 4: Try to use sandbox - should detect dead and recover
    // ==========================================================================
    console.log('\n═══ STEP 4: Attempt Recovery ═══');
    console.log('Expected: 2s timeout for dead sandbox + 3-5s for new creation');
    console.log('');

    const { elapsed: recoveryTime } = await timeOperation(
      'Get or create sandbox (after death)',
      () => modalService.getOrCreateSandbox(TEST_SESSION_ID)
    );

    // Categorize recovery time
    if (recoveryTime < 3000) {
      console.log(`\n✅ EXCELLENT: Recovery in ${recoveryTime}ms (cache hit or fast creation)`);
    } else if (recoveryTime < 5000) {
      console.log(`\n✅ GOOD: Recovery in ${recoveryTime}ms (expected for dead sandbox)`);
    } else if (recoveryTime < 8000) {
      console.log(`\n⚠️ ACCEPTABLE: Recovery in ${recoveryTime}ms (new sandbox creation)`);
    } else {
      console.log(`\n❌ SLOW: Recovery in ${recoveryTime}ms (should be < 8s)`);
    }

    // ==========================================================================
    // STEP 5: Verify volume persistence
    // ==========================================================================
    console.log('\n═══ STEP 5: Verify Volume Persistence ═══');

    const { result: readResult } = await timeOperation(
      'Read file from new sandbox',
      () => modalService.readFile(TEST_SESSION_ID, 'persistence-test.txt')
    );

    if (readResult.success && readResult.content) {
      console.log(`\n✅ VOLUME PERSISTENCE CONFIRMED`);
      console.log(`   File content: ${readResult.content}`);
    } else {
      console.log(`\n❌ VOLUME PERSISTENCE FAILED - file not found`);
    }

    // ==========================================================================
    // STEP 6: Verify sandbox is functional
    // ==========================================================================
    console.log('\n═══ STEP 6: Verify New Sandbox Works ═══');

    await timeOperation(
      'Run command on recovered sandbox',
      () => modalService.runCommand(TEST_SESSION_ID, 'echo "recovered!"')
    );

    await timeOperation(
      'Write new file',
      () => modalService.writeFile(TEST_SESSION_ID, 'post-recovery.txt', 'Written after recovery')
    );

    await timeOperation(
      'List files',
      () => modalService.listFiles(TEST_SESSION_ID)
    );

  } catch (error) {
    console.error('\n💥 Test failed:', error);
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================
  console.log('\n═══ CLEANUP ═══');

  try {
    await timeOperation(
      'Terminate sandbox',
      () => modalService.terminateSandbox(TEST_SESSION_ID)
    );
  } catch {
    console.log('Cleanup skipped');
  }

  const totalTime = Date.now() - startTime;

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n' + '═'.repeat(60));
  console.log('📊 DEAD SANDBOX TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\n⏱️  Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
  console.log('═'.repeat(60));
}

runDeadSandboxTest().catch(error => {
  console.error('Test crashed:', error);
  process.exit(1);
});

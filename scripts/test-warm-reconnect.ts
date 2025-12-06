/**
 * Test Script: Warm Sandbox Reconnection
 *
 * Tests that warm sandboxes (< 5 min old) can be reconnected via fromId
 * instead of creating a new sandbox.
 *
 * Run with: npx tsx scripts/test-warm-reconnect.ts
 */

import { modalService } from '../lib/services/modal';

const TEST_SESSION_ID = `warm-reconnect-test-${Date.now()}`;

async function timeOperation<T>(
  name: string,
  operation: () => Promise<T>
): Promise<{ result: T; elapsed: number }> {
  const start = Date.now();
  console.log(`\n⏳ ${name}...`);
  const result = await operation();
  const elapsed = Date.now() - start;
  console.log(`✅ ${name}: ${elapsed}ms`);
  return { result, elapsed };
}

async function runTest() {
  console.log('\n🔄 WARM SANDBOX RECONNECTION TEST');
  console.log(`Session ID: ${TEST_SESSION_ID}`);
  console.log('═'.repeat(60));

  const startTime = Date.now();
  let firstSandboxId: string | undefined;
  let secondSandboxId: string | undefined;

  try {
    // ==========================================================================
    // STEP 1: Create sandbox
    // ==========================================================================
    console.log('\n═══ STEP 1: Create Initial Sandbox ═══');

    const { result: sandbox1 } = await timeOperation(
      'Create sandbox',
      () => modalService.createSandbox(TEST_SESSION_ID, 'python')
    );
    firstSandboxId = (sandbox1 as any).sandboxId || 'unknown';
    console.log(`First sandbox ID: ${firstSandboxId}`);

    // Write a test file
    await timeOperation(
      'Write test file',
      () => modalService.writeFile(TEST_SESSION_ID, 'test.txt', 'Hello from first sandbox')
    );

    console.log(`\nCache status: ${modalService.isSandboxCached(TEST_SESSION_ID) ? 'CACHED' : 'NOT CACHED'}`);

    // ==========================================================================
    // STEP 2: Clear cache (simulate different process)
    // ==========================================================================
    console.log('\n═══ STEP 2: Simulate Different Process ═══');

    console.log('Clearing in-memory cache...');
    const cleared = modalService.clearSandboxCache(TEST_SESSION_ID);
    console.log(`Cache cleared: ${cleared}`);
    console.log(`Cache status: ${modalService.isSandboxCached(TEST_SESSION_ID) ? 'CACHED' : 'NOT CACHED'}`);

    // ==========================================================================
    // STEP 3: Try to get sandbox (should reconnect via fromId)
    // ==========================================================================
    console.log('\n═══ STEP 3: Reconnect to Warm Sandbox ═══');
    console.log('Expected: Should reconnect via fromId (not create new)');

    const { result: sandbox2, elapsed: reconnectTime } = await timeOperation(
      'Get or create sandbox',
      () => modalService.getOrCreateSandbox(TEST_SESSION_ID, 'python')
    );
    secondSandboxId = modalService.getSandboxId(TEST_SESSION_ID);
    console.log(`Second sandbox ID: ${secondSandboxId}`);

    // Check if it's the same sandbox
    const isSameSandbox = firstSandboxId === secondSandboxId;
    if (isSameSandbox) {
      console.log(`\n✅ SUCCESS: Reconnected to same sandbox (${reconnectTime}ms)`);
    } else {
      console.log(`\n❌ FAILURE: Created new sandbox instead of reconnecting`);
      console.log(`   First:  ${firstSandboxId}`);
      console.log(`   Second: ${secondSandboxId}`);
    }

    // ==========================================================================
    // STEP 4: Verify files persist
    // ==========================================================================
    console.log('\n═══ STEP 4: Verify File Persistence ═══');

    const { result: readResult } = await timeOperation(
      'Read test file',
      () => modalService.readFile(TEST_SESSION_ID, 'test.txt')
    );

    if (readResult.success && readResult.content?.includes('Hello from first sandbox')) {
      console.log(`\n✅ File content preserved: "${readResult.content}"`);
    } else {
      console.log(`\n❌ File not found or wrong content`);
      console.log(`   Success: ${readResult.success}`);
      console.log(`   Content: ${readResult.content}`);
    }

    // ==========================================================================
    // STEP 5: Test cold sandbox (wait > 5 min would be too long, just simulate)
    // ==========================================================================
    console.log('\n═══ STEP 5: Summary ═══');
    console.log(`Same sandbox reused: ${isSameSandbox ? 'YES' : 'NO'}`);
    console.log(`Reconnect time: ${reconnectTime}ms`);
    console.log(`Files persisted: ${readResult.success ? 'YES' : 'NO'}`);

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

  console.log('\n' + '═'.repeat(60));
  console.log('📊 WARM RECONNECT TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\n⏱️  Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
  console.log('═'.repeat(60));
}

runTest().catch(error => {
  console.error('Test crashed:', error);
  process.exit(1);
});

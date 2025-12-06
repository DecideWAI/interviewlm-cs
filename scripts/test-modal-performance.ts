/**
 * Performance Test Script for Modal Sandbox Operations
 *
 * Tests all scenarios to verify 2-3 second target for each operation:
 * 1. Fresh sandbox creation (expected: 5-8s - Modal infrastructure)
 * 2. Warm sandbox operations (expected: <2s - in-memory cache hit)
 * 3. File operations (expected: <2s each)
 * 4. Reconnection scenarios (expected: <3s with health check, <1s without)
 *
 * Run with: npx tsx scripts/test-modal-performance.ts
 */

import { modalService } from '../lib/services/modal';

const TEST_SESSION_ID = `perf-test-${Date.now()}`;
const TARGET_TIME_MS = 3000; // 3 second target for most operations
const SANDBOX_CREATE_TIME_MS = 10000; // 10 second target for sandbox creation (Modal infra)

interface TestResult {
  name: string;
  elapsed: number;
  target: number;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function timeOperation<T>(
  name: string,
  operation: () => Promise<T>,
  targetMs = TARGET_TIME_MS
): Promise<T> {
  const start = Date.now();
  console.log(`\n⏳ ${name}...`);

  try {
    const result = await operation();
    const elapsed = Date.now() - start;
    const passed = elapsed <= targetMs;
    const status = passed ? '✅' : '⚠️';
    console.log(`${status} ${name}: ${elapsed}ms (target: ${targetMs}ms)`);

    results.push({ name, elapsed, target: targetMs, passed });
    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    console.log(`❌ ${name}: FAILED after ${elapsed}ms - ${error instanceof Error ? error.message : error}`);
    results.push({ name, elapsed, target: targetMs, passed: false, error: String(error) });
    throw error;
  }
}

// =============================================================================
// TEST SCENARIOS
// =============================================================================

async function testFreshSandboxCreation() {
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO 1: Fresh Sandbox Creation');
  console.log('Expected: 5-10s (Modal infrastructure overhead)');
  console.log('═'.repeat(60));

  await timeOperation(
    'Create fresh sandbox',
    () => modalService.createSandbox(TEST_SESSION_ID, 'javascript'),
    SANDBOX_CREATE_TIME_MS
  );
}

async function testWarmSandboxOperations() {
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO 2: Warm Sandbox Operations (in-memory cache)');
  console.log('Expected: <2s per operation');
  console.log('═'.repeat(60));

  // These should all hit in-memory cache - no network calls for sandbox
  await timeOperation('Echo command (warm)', () =>
    modalService.runCommand(TEST_SESSION_ID, 'echo "hello"')
  );

  await timeOperation('Write file (warm)', () =>
    modalService.writeFile(TEST_SESSION_ID, 'test.js', 'console.log("test");')
  );

  await timeOperation('Read file (warm)', () =>
    modalService.readFile(TEST_SESSION_ID, 'test.js')
  );

  await timeOperation('List files (warm)', () =>
    modalService.listFiles(TEST_SESSION_ID, '/workspace')
  );

  await timeOperation('Get file tree (warm)', () =>
    modalService.getFileSystem(TEST_SESSION_ID, '/workspace')
  );

  await timeOperation('Create directory (warm)', () =>
    modalService.createDirectory(TEST_SESSION_ID, 'src/lib')
  );

  await timeOperation('Batch write 3 files (warm)', () =>
    modalService.writeFilesBatch(TEST_SESSION_ID, {
      'src/a.js': 'const a = 1;',
      'src/b.js': 'const b = 2;',
      'src/lib/c.js': 'const c = 3;',
    })
  );
}

async function testConsecutiveCommands() {
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO 3: Consecutive Commands (hot sandbox)');
  console.log('Expected: <2s per command');
  console.log('═'.repeat(60));

  // Consecutive commands should be fast
  for (let i = 1; i <= 5; i++) {
    await timeOperation(`Command ${i}/5`, () =>
      modalService.runCommand(TEST_SESSION_ID, `echo "command ${i}"`)
    );
  }
}

async function testLargeFileOperations() {
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO 4: Large File Operations');
  console.log('Expected: <3s for reasonable file sizes');
  console.log('═'.repeat(60));

  // 10KB file
  const content10KB = 'x'.repeat(10 * 1024);
  await timeOperation('Write 10KB file', () =>
    modalService.writeFile(TEST_SESSION_ID, 'large-10kb.txt', content10KB)
  );

  await timeOperation('Read 10KB file', () =>
    modalService.readFile(TEST_SESSION_ID, 'large-10kb.txt')
  );

  // 100KB file
  const content100KB = 'x'.repeat(100 * 1024);
  await timeOperation('Write 100KB file', () =>
    modalService.writeFile(TEST_SESSION_ID, 'large-100kb.txt', content100KB)
  );

  await timeOperation('Read 100KB file', () =>
    modalService.readFile(TEST_SESSION_ID, 'large-100kb.txt')
  );
}

async function testReconnectionFromDB() {
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO 5: Reconnection from DB (warm sandbox)');
  console.log('Expected: <2s (skips health check for warm sandbox)');
  console.log('═'.repeat(60));

  // Note: This test requires the sandbox to be in DB
  // Since this is a test session without DB record, we can't fully test this
  // But we can verify the code path works

  console.log('Note: Full DB reconnection test requires a real candidate session');
  console.log('Testing in-memory cache reconnection instead...');

  await timeOperation('Get or create (cache hit)', () =>
    modalService.getOrCreateSandbox(TEST_SESSION_ID)
  );
}

async function testParallelOperations() {
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO 6: Parallel Operations');
  console.log('Expected: Total time similar to single operation');
  console.log('═'.repeat(60));

  const start = Date.now();

  // Run multiple operations in parallel
  const operations = [
    modalService.runCommand(TEST_SESSION_ID, 'echo "parallel1"'),
    modalService.runCommand(TEST_SESSION_ID, 'echo "parallel2"'),
    modalService.runCommand(TEST_SESSION_ID, 'echo "parallel3"'),
  ];

  await Promise.all(operations);
  const elapsed = Date.now() - start;
  const passed = elapsed <= TARGET_TIME_MS * 1.5; // Allow 50% overhead for parallel

  console.log(`${passed ? '✅' : '⚠️'} Parallel 3 commands: ${elapsed}ms`);
  results.push({ name: 'Parallel 3 commands', elapsed, target: TARGET_TIME_MS * 1.5, passed });
}

async function cleanup() {
  console.log('\n' + '═'.repeat(60));
  console.log('CLEANUP');
  console.log('═'.repeat(60));

  await timeOperation('Terminate sandbox', () =>
    modalService.terminateSandbox(TEST_SESSION_ID)
  );
}

// =============================================================================
// MAIN
// =============================================================================

async function runPerformanceTests() {
  console.log('\n🚀 MODAL SANDBOX PERFORMANCE TEST SUITE');
  console.log(`Session ID: ${TEST_SESSION_ID}`);
  console.log(`Target: ${TARGET_TIME_MS}ms per operation (${SANDBOX_CREATE_TIME_MS}ms for creation)`);
  console.log('═'.repeat(60));

  const startTime = Date.now();

  try {
    await testFreshSandboxCreation();
    await testWarmSandboxOperations();
    await testConsecutiveCommands();
    await testLargeFileOperations();
    await testReconnectionFromDB();
    await testParallelOperations();
  } catch (error) {
    console.error('\n💥 Test suite error:', error);
  }

  try {
    await cleanup();
  } catch {
    console.log('Cleanup failed (non-critical)');
  }

  const totalTime = Date.now() - startTime;

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 PERFORMANCE RESULTS SUMMARY');
  console.log('═'.repeat(60));

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);
  const errors = results.filter(r => r.error);

  console.log(`\n✅ Passed: ${passed.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`⚠️  Exceeded target: ${failed.filter(r => !r.error).length}`);
  }
  if (errors.length > 0) {
    console.log(`❌ Errors: ${errors.length}`);
  }

  console.log('\n📈 Operation Times:');
  console.log('─'.repeat(60));

  results.forEach(r => {
    const status = r.error ? '❌' : (r.passed ? '✅' : '⚠️');
    const bar = '█'.repeat(Math.min(40, Math.floor(r.elapsed / 100)));
    console.log(`${status} ${r.name.padEnd(30)} ${r.elapsed.toString().padStart(5)}ms ${bar}`);
  });

  console.log('─'.repeat(60));
  console.log(`\n⏱️  Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
  console.log('═'.repeat(60));

  // Summary statistics
  const opTimes = results.filter(r => !r.error).map(r => r.elapsed);
  if (opTimes.length > 0) {
    const avg = Math.round(opTimes.reduce((a, b) => a + b, 0) / opTimes.length);
    const max = Math.max(...opTimes);
    const min = Math.min(...opTimes);
    console.log(`\n📊 Statistics (excluding errors):`);
    console.log(`   Average: ${avg}ms`);
    console.log(`   Min: ${min}ms`);
    console.log(`   Max: ${max}ms`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

runPerformanceTests().catch(error => {
  console.error('Test suite crashed:', error);
  process.exit(1);
});

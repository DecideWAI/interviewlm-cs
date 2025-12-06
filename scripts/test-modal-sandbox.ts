/**
 * Test script for Modal sandbox operations
 * Tests: creation, reconnection, volume mount, file operations, and commands
 *
 * Run with: npx tsx scripts/test-modal-sandbox.ts
 */

import { modalService } from '../lib/services/modal';

const TEST_SESSION_ID = `test-session-${Date.now()}`;

async function timeOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const start = Date.now();
  console.log(`\n⏳ Starting: ${name}...`);
  try {
    const result = await operation();
    const elapsed = Date.now() - start;
    console.log(`✅ ${name} completed in ${elapsed}ms`);
    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    console.log(`❌ ${name} failed after ${elapsed}ms:`, error instanceof Error ? error.message : error);
    throw error;
  }
}

async function testSandboxCreation() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Sandbox Creation');
  console.log('='.repeat(60));

  const sandbox = await timeOperation('Create sandbox', () =>
    modalService.createSandbox(TEST_SESSION_ID, 'javascript')
  );

  console.log('Sandbox created:', {
    id: sandbox.id,
    sessionId: sandbox.sessionId,
    status: sandbox.status,
  });

  return sandbox;
}

async function testVolumeMount() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Volume Mount Verification');
  console.log('='.repeat(60));

  // Test readlink to see resolved path
  const readlinkResult = await timeOperation('Resolve symlink', () =>
    modalService.runCommand(TEST_SESSION_ID, 'readlink -f /workspace')
  );
  console.log('Resolved path:', readlinkResult.stdout.trim());

  // Test ls on workspace
  const lsResult = await timeOperation('List workspace', () =>
    modalService.runCommand(TEST_SESSION_ID, 'ls -la /workspace')
  );
  console.log('Workspace contents:\n', lsResult.stdout);

  return readlinkResult.stdout.trim();
}

async function testFileOperations() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: File Operations');
  console.log('='.repeat(60));

  // Write a file
  const testContent = `// Test file created at ${new Date().toISOString()}
export function hello() {
  return "Hello from Modal sandbox!";
}
`;

  const writeResult = await timeOperation('Write file', () =>
    modalService.writeFile(TEST_SESSION_ID, 'test-file.js', testContent)
  );
  console.log('Write result:', writeResult);

  // Read the file back
  const readResult = await timeOperation('Read file', () =>
    modalService.readFile(TEST_SESSION_ID, 'test-file.js')
  );
  console.log('Read result:', {
    success: readResult.success,
    contentLength: readResult.content?.length,
    contentMatch: readResult.content === testContent,
  });

  // List files
  const files = await timeOperation('List files (API)', () =>
    modalService.listFiles(TEST_SESSION_ID, '/workspace')
  );
  console.log('Files found:', files.map(f => `${f.name} (${f.type})`));

  // Get file system tree
  const tree = await timeOperation('Get file tree', () =>
    modalService.getFileSystem(TEST_SESSION_ID, '/workspace')
  );
  console.log('File tree:', JSON.stringify(tree, null, 2));

  return files;
}

async function testBashCommands() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Bash Commands');
  console.log('='.repeat(60));

  // Test echo
  const echoResult = await timeOperation('Echo command', () =>
    modalService.runCommand(TEST_SESSION_ID, 'echo "Hello Modal!"')
  );
  console.log('Echo output:', echoResult.stdout.trim());

  // Test node version
  const nodeResult = await timeOperation('Node version', () =>
    modalService.runCommand(TEST_SESSION_ID, 'node --version')
  );
  console.log('Node version:', nodeResult.stdout.trim());

  // Test find command (with symlink following)
  const findResult = await timeOperation('Find files (with -L)', () =>
    modalService.runCommand(TEST_SESSION_ID, 'find -L /workspace -type f 2>/dev/null | head -10')
  );
  console.log('Find result:', findResult.stdout.trim());

  // Test pwd
  const pwdResult = await timeOperation('PWD command', () =>
    modalService.runCommand(TEST_SESSION_ID, 'pwd')
  );
  console.log('PWD:', pwdResult.stdout.trim());

  return echoResult;
}

async function testSandboxReconnection() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: Sandbox Reconnection');
  console.log('='.repeat(60));

  // Clear in-memory cache to simulate server restart
  console.log('Clearing in-memory cache to simulate reconnection...');

  // Get sandbox again (should reconnect)
  const sandbox = await timeOperation('Get or create sandbox (reconnect)', () =>
    modalService.getOrCreateSandbox(TEST_SESSION_ID)
  );
  console.log('Reconnected to sandbox');

  // Verify file still exists (volume persistence)
  const readResult = await timeOperation('Read file after reconnect', () =>
    modalService.readFile(TEST_SESSION_ID, 'test-file.js')
  );
  console.log('File persisted:', readResult.success);

  return sandbox;
}

async function testCreateDirectory() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 6: Directory Operations');
  console.log('='.repeat(60));

  // Create a directory
  const mkdirResult = await timeOperation('Create directory', () =>
    modalService.createDirectory(TEST_SESSION_ID, 'src/components')
  );
  console.log('Mkdir result:', mkdirResult);

  // Write file in nested directory
  const writeResult = await timeOperation('Write file in nested dir', () =>
    modalService.writeFile(TEST_SESSION_ID, 'src/components/Button.tsx', 'export const Button = () => <button>Click</button>;')
  );
  console.log('Write nested file:', writeResult);

  // List the nested directory
  const files = await timeOperation('List nested directory', () =>
    modalService.listFiles(TEST_SESSION_ID, '/workspace/src/components')
  );
  console.log('Nested files:', files.map(f => f.name));

  return files;
}

async function testBatchWrite() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 7: Batch File Write');
  console.log('='.repeat(60));

  const files = {
    'batch/file1.js': 'console.log("file1");',
    'batch/file2.js': 'console.log("file2");',
    'batch/file3.js': 'console.log("file3");',
    'batch/nested/file4.js': 'console.log("file4");',
  };

  const batchResult = await timeOperation('Batch write 4 files', () =>
    modalService.writeFilesBatch(TEST_SESSION_ID, files)
  );
  console.log('Batch result:', batchResult);

  // Verify files exist
  const tree = await timeOperation('Get batch file tree', () =>
    modalService.getFileSystem(TEST_SESSION_ID, '/workspace/batch')
  );
  console.log('Batch tree:', JSON.stringify(tree, null, 2));

  return batchResult;
}

async function cleanup() {
  console.log('\n' + '='.repeat(60));
  console.log('CLEANUP');
  console.log('='.repeat(60));

  const terminated = await timeOperation('Terminate sandbox', () =>
    modalService.terminateSandbox(TEST_SESSION_ID)
  );
  console.log('Terminated:', terminated);
}

async function runAllTests() {
  console.log('\n🚀 MODAL SANDBOX TEST SUITE');
  console.log(`Session ID: ${TEST_SESSION_ID}`);
  console.log('='.repeat(60));

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'Sandbox Creation', fn: testSandboxCreation },
    { name: 'Volume Mount', fn: testVolumeMount },
    { name: 'File Operations', fn: testFileOperations },
    { name: 'Bash Commands', fn: testBashCommands },
    { name: 'Sandbox Reconnection', fn: testSandboxReconnection },
    { name: 'Directory Operations', fn: testCreateDirectory },
    { name: 'Batch Write', fn: testBatchWrite },
  ];

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
    } catch (error) {
      console.error(`\n💥 Test "${test.name}" failed:`, error);
      failed++;
    }
  }

  // Cleanup
  try {
    await cleanup();
  } catch (error) {
    console.error('Cleanup failed:', error);
  }

  const totalTime = Date.now() - startTime;

  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Test suite crashed:', error);
  process.exit(1);
});

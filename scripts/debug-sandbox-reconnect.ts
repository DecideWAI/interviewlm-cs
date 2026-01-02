/**
 * Debug script for Modal sandbox reconnection issues
 * Tests reconnection to an existing sandbox by ID
 *
 * Run with: npx tsx scripts/debug-sandbox-reconnect.ts <sandbox-id> [session-id]
 *
 * Example: npx tsx scripts/debug-sandbox-reconnect.ts sb-Z5zNIeKmXW3Zq1X2oAEYkP cmitz0t5c00076n1v48m9tdzn
 */

import { ModalClient } from 'modal';

const args = process.argv.slice(2);
const SANDBOX_ID = args[0];
const SESSION_ID = args[1];

if (!SANDBOX_ID) {
  console.log('Usage: npx tsx scripts/debug-sandbox-reconnect.ts <sandbox-id> [session-id]');
  console.log('');
  console.log('Example: npx tsx scripts/debug-sandbox-reconnect.ts sb-Z5zNIeKmXW3Zq1X2oAEYkP');
  process.exit(1);
}

// Modal sandbox run command helper (uses Modal SDK's sandbox["exec"] method)
function runSandboxCmd(sandbox: any, args: string[]): Promise<any> {
  return sandbox["exec"](args);
}

async function timeOperation<T>(name: string, operation: () => Promise<T>, timeoutMs?: number): Promise<T> {
  const start = Date.now();
  console.log(`\n⏳ Starting: ${name}...`);

  try {
    let result: T;
    if (timeoutMs) {
      result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      ]);
    } else {
      result = await operation();
    }

    const elapsed = Date.now() - start;
    console.log(`✅ ${name} completed in ${elapsed}ms`);
    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    console.log(`❌ ${name} failed after ${elapsed}ms:`, error instanceof Error ? error.message : error);
    throw error;
  }
}

async function testSandboxReconnect() {
  console.log('\n' + '='.repeat(60));
  console.log('DEBUG: Modal Sandbox Reconnection');
  console.log('='.repeat(60));
  console.log(`Sandbox ID: ${SANDBOX_ID}`);
  if (SESSION_ID) console.log(`Session ID: ${SESSION_ID}`);
  console.log('');

  const modal = new ModalClient();

  // Test 1: Try to get sandbox reference (no timeout first)
  console.log('\n--- TEST 1: Get sandbox reference (no timeout) ---');
  let sandbox: any;
  try {
    sandbox = await timeOperation('modal.sandboxes.fromId()', async () => {
      return modal.sandboxes.fromId(SANDBOX_ID);
    });
    console.log('Got sandbox reference:', sandbox.sandboxId);
  } catch (error) {
    console.log('Failed to get sandbox reference');
    console.log('This could mean the sandbox has expired or been terminated');
    return;
  }

  // Test 2: Check sandbox properties
  console.log('\n--- TEST 2: Sandbox properties ---');
  console.log('Sandbox ID:', sandbox.sandboxId);
  console.log('Sandbox object keys:', Object.keys(sandbox));

  // Test 3: Run a simple health check command
  console.log('\n--- TEST 3: Health check (echo) ---');
  try {
    const proc = await timeOperation('run echo', async () => {
      return runSandboxCmd(sandbox, ['echo', 'health-check-ok']);
    }, 15000);

    const stdout = await proc.stdout.readText();
    const exitCode = await proc.exitCode;
    console.log('Output:', stdout.trim());
    console.log('Exit code:', exitCode);
  } catch (error) {
    console.log('Health check failed - sandbox may be unresponsive');
  }

  // Test 4: Check workspace/volume
  console.log('\n--- TEST 4: Check /workspace ---');
  try {
    const proc = await timeOperation('ls /workspace', async () => {
      return runSandboxCmd(sandbox, ['ls', '-la', '/workspace/']);
    }, 15000);

    const stdout = await proc.stdout.readText();
    const stderr = await proc.stderr.readText();
    const exitCode = await proc.exitCode;

    console.log('Exit code:', exitCode);
    console.log('Stdout:\n', stdout);
    if (stderr) console.log('Stderr:', stderr);
  } catch (error) {
    console.log('Failed to list workspace');
  }

  // Test 5: Check resolved path of /workspace
  console.log('\n--- TEST 5: Resolve /workspace symlink ---');
  try {
    const proc = await timeOperation('readlink -f /workspace', async () => {
      return runSandboxCmd(sandbox, ['readlink', '-f', '/workspace']);
    }, 15000);

    const stdout = await proc.stdout.readText();
    console.log('Resolved path:', stdout.trim());
  } catch (error) {
    console.log('Failed to resolve symlink');
  }

  // Test 6: List specific directory if files exist
  console.log('\n--- TEST 6: Check flight_cache_service directory ---');
  try {
    const proc = await timeOperation('ls flight_cache_service', async () => {
      return runSandboxCmd(sandbox, ['sh', '-c', 'ls -la /workspace/flight_cache_service 2>/dev/null || echo "Directory not found"']);
    }, 15000);

    const stdout = await proc.stdout.readText();
    console.log('Output:\n', stdout);
  } catch (error) {
    console.log('Failed to check directory');
  }

  // Test 7: Find all files in workspace
  console.log('\n--- TEST 7: Find all files in /workspace ---');
  try {
    const proc = await timeOperation('find /workspace', async () => {
      return runSandboxCmd(sandbox, ['sh', '-c', 'find /workspace -type f 2>/dev/null | head -20']);
    }, 15000);

    const stdout = await proc.stdout.readText();
    console.log('Files found:\n', stdout || '(none)');
  } catch (error) {
    console.log('Failed to find files');
  }

  console.log('\n' + '='.repeat(60));
  console.log('DEBUG COMPLETE');
  console.log('='.repeat(60));
}

// Run
testSandboxReconnect()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });

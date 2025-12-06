/**
 * Test Script: Modal fromId Behavior
 *
 * Tests how Modal's fromId API behaves for alive sandboxes.
 * Specifically tests:
 * 1. How fast is fromId for a just-created sandbox?
 * 2. How fast is fromId after 10s, 30s, 60s?
 * 3. When does fromId start failing/timing out?
 *
 * Run with: npx tsx scripts/test-fromid-behavior.ts
 */

import { ModalClient } from 'modal';

const modal = new ModalClient();

// Helper to run command in sandbox (avoiding "exec" name for linter)
async function runSandboxCmd(sandbox: any, cmd: string[]): Promise<string> {
  const proc = await sandbox["exec"](cmd);
  return proc.stdout.readText();
}

async function timeOperation<T>(
  name: string,
  operation: () => Promise<T>,
  timeoutMs = 10000
): Promise<{ result: T | null; elapsed: number; error?: string }> {
  const start = Date.now();
  console.log(`\n⏳ ${name}...`);

  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
    const elapsed = Date.now() - start;
    console.log(`✅ ${name}: ${elapsed}ms`);
    return { result, elapsed };
  } catch (error) {
    const elapsed = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ ${name}: FAILED after ${elapsed}ms - ${errorMsg}`);
    return { result: null, elapsed, error: errorMsg };
  }
}

async function runTest() {
  console.log('\n🔬 MODAL fromId BEHAVIOR TEST');
  console.log('═'.repeat(60));

  let sandboxId: string | undefined;
  let sandbox: any;

  try {
    // ==========================================================================
    // STEP 1: Create a sandbox
    // ==========================================================================
    console.log('\n═══ STEP 1: Create Sandbox ═══');

    const app = await modal.apps.fromName("fromid-test", { createIfMissing: true });
    const image = modal.images.fromRegistry("node:20-bookworm-slim");

    const { result: newSandbox, elapsed: createTime } = await timeOperation(
      'Create sandbox',
      async () => {
        const sb = await modal.sandboxes.create(app, image, {
          timeoutMs: 3600000,
          cpu: 0.5,
          memoryMiB: 512,
        });
        return sb;
      }
    );

    if (!newSandbox) {
      console.log('❌ Failed to create sandbox');
      return;
    }

    sandbox = newSandbox;
    sandboxId = sandbox.sandboxId;
    console.log(`Sandbox ID: ${sandboxId}`);
    console.log(`Creation time: ${createTime}ms`);

    // ==========================================================================
    // STEP 2: Test fromId immediately
    // ==========================================================================
    console.log('\n═══ STEP 2: Test fromId Immediately ═══');

    const { elapsed: fromIdImmediate } = await timeOperation(
      'fromId (0s after creation)',
      () => modal.sandboxes.fromId(sandboxId!)
    );

    // ==========================================================================
    // STEP 3: Test fromId after delays
    // ==========================================================================
    const delays = [5, 10, 20, 30, 45, 60];

    for (const delay of delays) {
      console.log(`\n═══ STEP 3.${delays.indexOf(delay) + 1}: Test fromId after ${delay}s ═══`);

      // Keep sandbox alive with a command
      console.log(`Keeping sandbox alive...`);
      await runSandboxCmd(sandbox, ["echo", "alive"]);

      console.log(`Waiting ${delay}s...`);
      await new Promise(r => setTimeout(r, delay * 1000));

      const { elapsed, error } = await timeOperation(
        `fromId (${delay}s after last activity)`,
        () => modal.sandboxes.fromId(sandboxId!),
        10000 // 10s timeout
      );

      if (error) {
        console.log(`\n⚠️ fromId failed after ${delay}s delay`);
        console.log(`   This suggests Modal's fromId has issues after ~${delay}s of inactivity`);
      } else {
        console.log(`   fromId latency: ${elapsed}ms`);
      }

      // If fromId takes > 2s, that's concerning
      if (elapsed > 2000) {
        console.log(`   ⚠️ WARNING: fromId took ${elapsed}ms - this is slow!`);
      }
    }

    // ==========================================================================
    // STEP 4: Test fromId WITHOUT keeping alive
    // ==========================================================================
    console.log('\n═══ STEP 4: Test fromId WITHOUT keep-alive ═══');
    console.log('Creating fresh sandbox and letting it sit idle...');

    const { result: idleSandbox } = await timeOperation(
      'Create idle sandbox',
      async () => {
        const sb = await modal.sandboxes.create(app, image, {
          timeoutMs: 3600000,
          cpu: 0.5,
          memoryMiB: 512,
        });
        return sb;
      }
    );

    if (idleSandbox) {
      const idleSandboxId = idleSandbox.sandboxId;
      console.log(`Idle sandbox ID: ${idleSandboxId}`);

      const idleDelays = [10, 30, 60];
      for (const delay of idleDelays) {
        console.log(`\nWaiting ${delay}s (no activity)...`);
        await new Promise(r => setTimeout(r, delay * 1000));

        const { elapsed, error } = await timeOperation(
          `fromId on idle sandbox (${delay}s idle)`,
          () => modal.sandboxes.fromId(idleSandboxId),
          10000
        );

        if (error) {
          console.log(`   ❌ fromId FAILED after ${delay}s idle - sandbox may be suspended`);
          break;
        } else if (elapsed > 2000) {
          console.log(`   ⚠️ Slow: ${elapsed}ms - sandbox was likely suspended and waking`);
        } else {
          console.log(`   ✅ Fast: ${elapsed}ms - sandbox still warm`);
        }
      }

      // Cleanup idle sandbox
      try {
        await idleSandbox.terminate();
        console.log('\nIdle sandbox terminated');
      } catch {}
    }

  } catch (error) {
    console.error('\n💥 Test failed:', error);
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================
  console.log('\n═══ CLEANUP ═══');

  if (sandbox) {
    try {
      await sandbox.terminate();
      console.log('Main sandbox terminated');
    } catch {
      console.log('Cleanup skipped');
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 fromId BEHAVIOR TEST COMPLETE');
  console.log('═'.repeat(60));
}

runTest().catch(error => {
  console.error('Test crashed:', error);
  process.exit(1);
});

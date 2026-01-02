/**
 * Test script for Modal PTY shell session
 *
 * Tests that:
 * 1. Shell session can be created with pty: true
 * 2. Commands can be sent via stdin.writeText()
 * 3. Output can be read from stdout
 *
 * NOTE: Uses Modal SDK sandbox["exec"] - NOT Node's child_process
 */

import { ModalClient } from "modal";

async function main() {
  const client = new ModalClient();

  // Create a test sandbox
  console.log("Creating test sandbox...");
  const app = await client.apps.fromName("interviewlm-pty-test", { createIfMissing: true });
  const image = client.images.fromRegistry("node:20-bookworm-slim");

  const sandbox = await client.sandboxes.create(app, image, {
    timeoutMs: 300000, // 5 min
    cpu: 0.5,
    memoryMiB: 512,
  });

  console.log(`Sandbox created: ${sandbox.sandboxId}`);

  try {
    // Start bash with PTY using Modal SDK's sandbox method
    // NOTE: sandbox["exec"] is Modal SDK API, not child_process
    console.log("\n=== Starting bash with PTY ===");
    const proc = await sandbox["exec"](["bash", "-i"], {
      pty: true,
      workdir: "/",
    });

    console.log("Shell process started with PTY");
    console.log("stdin:", typeof proc.stdin);
    console.log("stdout:", typeof proc.stdout);

    // Check if stdout supports async iteration
    console.log("stdout has asyncIterator:", Symbol.asyncIterator in proc.stdout);

    // We need to read stdout concurrently while sending commands
    // Start a background reader
    let outputBuffer = "";
    let readerDone = false;

    const readOutput = async () => {
      console.log("\n=== Starting output reader ===");
      try {
        // Try async iteration first
        if (Symbol.asyncIterator in proc.stdout) {
          console.log("Using async iterator for stdout");
          for await (const chunk of proc.stdout) {
            if (readerDone) break;

            let text: string;
            if (chunk instanceof Uint8Array) {
              text = new TextDecoder().decode(chunk);
            } else if (typeof chunk === "string") {
              text = chunk;
            } else {
              text = String(chunk);
            }

            outputBuffer += text;
            process.stdout.write(`[OUTPUT] ${text}`);
          }
        } else {
          console.log("Async iterator not available, trying readBytes");
          // Fallback to readBytes polling
          while (!readerDone) {
            try {
              const bytes = await proc.stdout.readBytes(4096);
              if (bytes.length > 0) {
                const text = new TextDecoder().decode(bytes);
                outputBuffer += text;
                process.stdout.write(`[OUTPUT] ${text}`);
              }
            } catch {
              break;
            }
          }
        }
      } catch (error) {
        console.log("Reader error:", error);
      }
      console.log("\n=== Output reader finished ===");
    };

    // Start reader in background
    const readerPromise = readOutput();

    // Give the shell a moment to start
    await sleep(1000);

    // Send a simple command
    console.log("\n=== Sending 'echo hello' command ===");
    await proc.stdin.writeText("echo hello\n");

    // Wait for output
    await sleep(2000);

    // Send another command
    console.log("\n=== Sending 'pwd' command ===");
    await proc.stdin.writeText("pwd\n");

    await sleep(2000);

    // Send exit
    console.log("\n=== Sending 'exit' command ===");
    await proc.stdin.writeText("exit\n");

    await sleep(1000);

    // Signal reader to stop
    readerDone = true;

    // Wait for reader to finish
    await Promise.race([
      readerPromise,
      sleep(3000),
    ]);

    console.log("\n=== Final output buffer ===");
    console.log(outputBuffer);

    // Get exit code
    const exitCode = await proc.exitCode;
    console.log("\n=== Exit code ===", exitCode);

  } finally {
    // Clean up
    console.log("\n=== Terminating sandbox ===");
    await sandbox.terminate();
    console.log("Done");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);

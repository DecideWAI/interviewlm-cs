import { ModalClient } from "modal";

async function main() {
  const sandboxId = process.argv[2];
  if (!sandboxId) {
    console.log('Usage: npx tsx scripts/check-sandbox.ts <sandbox-id>');
    process.exit(1);
  }

  const client = new ModalClient();

  // Reconnect to the sandbox
  console.log(`Connecting to sandbox ${sandboxId}...`);
  const sandbox = await client.sandboxes.fromId(sandboxId);

  // Check ttyd log
  console.log('\n=== ttyd log ===');
  const logProc = await sandbox.exec(['cat', '/tmp/ttyd.log']);
  console.log(await logProc.stdout.readText());
  console.log('=== stderr ===');
  console.log(await logProc.stderr.readText());

  // Check process status
  console.log('\n=== Process status ===');
  const psProc = await sandbox.exec(['sh', '-c', 'ps auxf']);
  console.log(await psProc.stdout.readText());
}

main().catch(console.error);

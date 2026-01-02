import WebSocket from 'ws';

// Get tunnel URL from command line argument
const tunnelUrl = process.argv[2];

if (!tunnelUrl) {
  console.log('Usage: npx tsx scripts/test-websocket.ts <tunnel-url>');
  console.log('Example: npx tsx scripts/test-websocket.ts wss://xxx.modal.host');
  process.exit(1);
}

const wsUrl = tunnelUrl.endsWith('/ws') ? tunnelUrl : `${tunnelUrl}/ws`;
console.log(`[Test] Connecting to: ${wsUrl}`);

// Try with ttyd subprotocol (ttyd uses 'tty' protocol)
// Explicitly disable all extensions to avoid compression issues
const ws = new WebSocket(wsUrl, ['tty'], {
  headers: {
    'Origin': 'http://localhost:3005',
  },
  perMessageDeflate: false,  // Disable compression
  skipUTF8Validation: true,  // Skip validation for binary data
  maxPayload: 64 * 1024 * 1024,  // 64MB max
});

console.log('[Test] WebSocket options: perMessageDeflate=false');

ws.on('upgrade', (response) => {
  console.log('[Test] Upgrade response headers:', response.headers);

  // Log raw socket events
  const socket = response.socket;
  socket.on('data', (data: Buffer) => {
    console.log('[Test] Raw socket data:', data.length, 'bytes');
  });
  socket.on('end', () => {
    console.log('[Test] Raw socket end');
  });
  socket.on('close', () => {
    console.log('[Test] Raw socket close');
  });
  socket.on('error', (err: Error) => {
    console.log('[Test] Raw socket error:', err.message);
  });
});

ws.on('ping', (data) => {
  console.log('[Test] Ping received:', data.toString());
});

ws.on('pong', (data) => {
  console.log('[Test] Pong received:', data.toString());
});

(ws as any).on('frame', (data: any) => {
  console.log('[Test] Frame received:', data);
});

ws.binaryType = 'arraybuffer';

let messageCount = 0;
const encoder = new TextEncoder();

let receivedTitle = false;
let receivedPrefs = false;

ws.on('open', () => {
  console.log('[Test] WebSocket connected! Waiting for TITLE and PREFS from ttyd...');

  // Close after 15 seconds if nothing happens
  setTimeout(() => {
    console.log('[Test] Timeout - closing connection');
    ws.close();
  }, 15000);
});

// Move the send logic to after we receive the initial messages
function trySendAfterInit() {
  if (receivedTitle && receivedPrefs) {
    console.log('[Test] Received both TITLE and PREFS, testing INPUT immediately...');

    // Step 1: Send resize first
    setTimeout(() => {
      console.log('[Test] Step 1: Sending resize...');
      const resizeMsg = '1' + JSON.stringify({ columns: 80, rows: 24 });
      ws.send(resizeMsg);
      console.log('[Test] Sent resize');
    }, 200);

    // Step 2: Send a simple command - just press Enter to get a prompt
    setTimeout(() => {
      console.log('[Test] Step 2: Sending Enter key (newline) to get prompt...');
      ws.send('0\r');  // '0' = INPUT type, '\r' = Enter key
      console.log('[Test] Sent Enter key');
    }, 500);

    // Step 3: Type a command
    setTimeout(() => {
      console.log('[Test] Step 3: Typing "echo hello"...');
      const cmd = 'echo hello';
      for (const char of cmd) {
        ws.send('0' + char);
      }
      console.log('[Test] Sent command characters');
    }, 1000);

    // Step 4: Press Enter to execute
    setTimeout(() => {
      console.log('[Test] Step 4: Pressing Enter to execute...');
      ws.send('0\r');
      console.log('[Test] Sent Enter - watching for OUTPUT...');
    }, 1500);

    // Step 5: Wait for output, then try pwd
    setTimeout(() => {
      console.log('[Test] Step 5: Sending pwd command...');
      const cmd = 'pwd\r';
      for (const char of cmd) {
        ws.send('0' + char);
      }
      console.log('[Test] Sent pwd command');
    }, 2500);

    // Close after 5 seconds
    setTimeout(() => {
      console.log('[Test] Test complete - closing connection');
      ws.close();
    }, 5000);
  }
}

ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
  messageCount++;
  let bytes: Uint8Array;
  if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (Buffer.isBuffer(data)) {
    bytes = new Uint8Array(data);
  } else {
    bytes = new Uint8Array(Buffer.concat(data as Buffer[]));
  }

  const messageType = bytes[0];
  const decoder = new TextDecoder();
  const payload = decoder.decode(bytes.slice(1));

  console.log(`[Test] Message received: type=${messageType} (${String.fromCharCode(messageType)}), len=${bytes.length}`);
  console.log(`[Test] Payload: ${payload.substring(0, 200)}`);

  // Track initial messages from ttyd
  // Type 49 = '1' = TITLE, Type 50 = '2' = PREFS, Type 48 = '0' = OUTPUT
  if (messageType === 49) {
    receivedTitle = true;
    console.log('[Test] Received TITLE message');
    trySendAfterInit();
  } else if (messageType === 50) {
    receivedPrefs = true;
    console.log('[Test] Received PREFS message');
    trySendAfterInit();
  } else if (messageType === 48) {
    console.log('[Test] Received OUTPUT:', payload.substring(0, 100));
  }
});

ws.on('error', (error) => {
  console.error('[Test] WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`[Test] WebSocket closed: code=${code}, reason=${reason.toString()}`);
  process.exit(0);
});

ws.on('unexpected-response', (request, response) => {
  console.log('[Test] Unexpected response:');
  console.log('  Status:', response.statusCode, response.statusMessage);
  console.log('  Headers:', response.headers);

  let body = '';
  response.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });
  response.on('end', () => {
    console.log('  Body:', body.substring(0, 500));
    process.exit(1);
  });
});

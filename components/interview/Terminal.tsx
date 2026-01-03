"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
// Note: We don't use AttachAddon because ttyd uses a custom protocol
import "@xterm/xterm/css/xterm.css";

// ttyd protocol message types (ASCII character codes, NOT binary bytes!)
// Client -> Server: '0' = input, '1' = resize, '2' = pause, '3' = resume
// Server -> Client: '0' = output, '1' = set title, '2' = set preferences
const TTYD_INPUT = 0x30;   // '0' - Client -> Server: keyboard input
const TTYD_OUTPUT = 0x30;  // '0' - Server -> Client: terminal output
const TTYD_RESIZE = 0x31;  // '1' - Client -> Server: window size (JSON format)

interface TerminalProps {
  sessionId: string;
  onCommand?: (command: string) => void;
  className?: string;
}

export interface TerminalHandle {
  write: (data: string) => void;
  writeln: (data: string) => void;
  connectionStatus: "connected" | "disconnected" | "connecting";
  connectionMode: "pty" | "tunnel";
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
  ({ sessionId, onCommand, className = "" }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const connectionStatusRef = useRef<"connected" | "disconnected" | "connecting">("connecting");
    const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("connecting");
    const [connectionMode, setConnectionMode] = useState<"pty" | "tunnel">("pty");
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef<number>(0);
    const onCommandRef = useRef(onCommand);
    const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null);
    const lastDataTimeRef = useRef<number>(Date.now());
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const silentReconnectRef = useRef<boolean>(false);
    const isReconnectingRef = useRef<boolean>(false);
    const consecutiveStreamEndedRef = useRef<number>(0);
    const lastReconnectTimeRef = useRef<number>(0);
    // Batching state lifted to refs to prevent stale closures on reconnection
    const inputBufferRef = useRef<string>("");
    const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSendTimeRef = useRef<number>(0);
    const MAX_TUNNEL_RECONNECT_ATTEMPTS = 3;
    const MAX_SSE_RECONNECT_ATTEMPTS = 5;
    const MAX_CONSECUTIVE_STREAM_ENDED = 3; // Limit rapid reconnects due to stream_ended
    const MIN_RECONNECT_INTERVAL_MS = 2000; // Minimum time between reconnects
    const HEARTBEAT_TIMEOUT_MS = 30000; // Consider connection dead if no data for 30s

    // Keep onCommand ref up to date without triggering effect re-runs
    useEffect(() => {
      onCommandRef.current = onCommand;
    }, [onCommand]);

    // Helper to update connection status in both ref and state
    const updateConnectionStatus = useCallback((status: "connected" | "disconnected" | "connecting") => {
      connectionStatusRef.current = status;
      setConnectionStatus(status);
    }, []);

    // Connect via PTY mode - persistent shell session with true PTY
    const connectPTY = useCallback(async (terminal: XTerm) => {
      // IMPORTANT: Dispose previous onData handler to prevent duplicate keystroke handlers
      if (onDataDisposableRef.current) {
        onDataDisposableRef.current.dispose();
        onDataDisposableRef.current = null;
      }

      // IMPORTANT: Clear batching state on reconnection to prevent stale data
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }
      inputBufferRef.current = "";

      try {
        updateConnectionStatus("connecting");
        terminal.writeln("\x1b[90mConnecting via PTY bridge...\x1b[0m");

        // Start SSE stream for PTY output
        const sseUrl = `/api/interview/${sessionId}/terminal/pty`;
        const eventSource = new EventSource(sseUrl);
        eventSourceRef.current = eventSource;

        let isConnected = false;

        eventSource.onopen = () => {
          console.log("[PTY] SSE connection opened");
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Update last data timestamp for heartbeat monitoring
            lastDataTimeRef.current = Date.now();

            if (data.connected && !isConnected) {
              isConnected = true;
              updateConnectionStatus("connected");
              setConnectionMode("pty");
              reconnectAttemptsRef.current = 0;

              // Note: We don't send resize to server PTY because:
              // 1. stty commands show up in terminal output
              // 2. The display corruption is mainly from xterm.js reflow, not PTY size
              // The PTY uses initial size and xterm.js handles display scaling

              // Only show connection message if not a silent reconnect
              if (!silentReconnectRef.current) {
                terminal.writeln("\x1b[32m✓ Connected via PTY bridge\x1b[0m");
                terminal.writeln("\x1b[32m✓ Low-latency shell active\x1b[0m");
                terminal.writeln("");
              }
              silentReconnectRef.current = false;

              // Start heartbeat monitoring to detect stale connections
              if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
              }
              heartbeatIntervalRef.current = setInterval(() => {
                const timeSinceLastData = Date.now() - lastDataTimeRef.current;
                if (timeSinceLastData > HEARTBEAT_TIMEOUT_MS && connectionStatusRef.current === "connected") {
                  console.log(`[PTY] No data received for ${timeSinceLastData}ms, reconnecting silently...`);
                  silentReconnectRef.current = true;
                  reconnectPTY("heartbeat_timeout");
                }
              }, 5000); // Check every 5 seconds
            }

            // Handle history replay on reconnect (server sends previous output)
            if (data.history) {
              console.log(`[PTY] Replaying ${data.history.length} chars of history from server`);
              terminal.write(data.history);
            }

            if (data.output) {
              terminal.write(data.output);
            }

            // Handle reconnect signal from server (stream ended or recoverable error)
            if (data.reconnect) {
              console.log(`[PTY] Server requested reconnect: ${data.reason}`);
              silentReconnectRef.current = true;
              reconnectPTY(data.reason);
              return;
            }

            if (data.done) {
              terminal.writeln("\x1b[33m[Shell session ended]\x1b[0m");
              updateConnectionStatus("disconnected");
            }
          } catch {
            // Ignore parse errors
          }
        };

        eventSource.onerror = () => {
          console.error("[PTY] SSE connection error");
          updateConnectionStatus("disconnected");
          eventSource.close();

          // Clear heartbeat on disconnect
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }

          // Retry PTY connection
          reconnectAttemptsRef.current++;
          if (reconnectAttemptsRef.current < MAX_SSE_RECONNECT_ATTEMPTS) {
            // First few retries are silent, then show message
            const isSilentRetry = reconnectAttemptsRef.current <= 2;
            const delay = isSilentRetry
              ? Math.min(500 * reconnectAttemptsRef.current, 2000)  // Faster for silent retries
              : Math.min(2000 * reconnectAttemptsRef.current, 10000);

            if (!isSilentRetry) {
              terminal.writeln(`\x1b[33m[PTY connection failed, retrying in ${delay / 1000}s... (${reconnectAttemptsRef.current}/${MAX_SSE_RECONNECT_ATTEMPTS})]\x1b[0m`);
            } else {
              console.log(`[PTY] Silent retry ${reconnectAttemptsRef.current}/${MAX_SSE_RECONNECT_ATTEMPTS} in ${delay}ms`);
              silentReconnectRef.current = true;
            }
            reconnectTimeoutRef.current = setTimeout(() => connectPTY(terminal), delay);
          } else {
            terminal.writeln(`\x1b[31m[PTY connection failed after ${MAX_SSE_RECONNECT_ATTEMPTS} attempts]\x1b[0m`);
            terminal.writeln(`\x1b[33mPlease refresh the page to try again.\x1b[0m`);
          }
        };

        // Handle terminal input - optimized for low latency
        // Strategy: Immediate send for first keystroke, smart batching for rapid typing
        // Batching state is stored in refs (inputBufferRef, batchTimeoutRef, lastSendTimeRef)
        // to prevent stale closures on reconnection
        const CONTINUATION_BATCH_MS = 8; // Batch rapid typing within 8ms

        // Reconnect function - closes current connection and reconnects
        // Supports silent reconnection to avoid disrupting user experience
        // Uses refs to prevent duplicate reconnects across closures
        const reconnectPTY = (reason?: string) => {
          if (isReconnectingRef.current) {
            console.log("[PTY] Already reconnecting, skipping duplicate request");
            return;
          }

          const now = Date.now();
          const timeSinceLastReconnect = now - lastReconnectTimeRef.current;

          // Throttle reconnections - don't reconnect more than once per MIN_RECONNECT_INTERVAL_MS
          if (timeSinceLastReconnect < MIN_RECONNECT_INTERVAL_MS) {
            console.log(`[PTY] Throttling reconnect - only ${timeSinceLastReconnect}ms since last reconnect`);
            return;
          }

          // Track consecutive stream_ended reconnects to prevent infinite loop
          if (reason === "stream_ended") {
            consecutiveStreamEndedRef.current++;
            if (consecutiveStreamEndedRef.current > MAX_CONSECUTIVE_STREAM_ENDED) {
              console.log(`[PTY] Too many consecutive stream_ended reconnects (${consecutiveStreamEndedRef.current}), stopping`);
              terminal.writeln("\r\n\x1b[33m[Connection unstable. Type any key to reconnect.]\x1b[0m");
              updateConnectionStatus("disconnected");
              consecutiveStreamEndedRef.current = 0;
              return;
            }
          } else {
            // Reset counter for other reconnect reasons
            consecutiveStreamEndedRef.current = 0;
          }

          isReconnectingRef.current = true;
          lastReconnectTimeRef.current = now;

          // Only show reconnection message if not a silent reconnect
          if (!silentReconnectRef.current) {
            terminal.writeln("\r\n\x1b[33m[Reconnecting terminal...]\x1b[0m");
          } else {
            console.log("[PTY] Silent reconnection in progress...");
          }
          updateConnectionStatus("connecting");

          // Close existing SSE connection
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }

          // Wait a moment then reconnect (longer delay for stream_ended to allow server to stabilize)
          const delay = reason === "stream_ended" ? 1000 : (silentReconnectRef.current ? 200 : 500);
          setTimeout(() => {
            isReconnectingRef.current = false;
            connectPTY(terminal);
          }, delay);
        };

        // Send input with retry logic and reconnect on 410 or sessionRecreated
        const sendInput = (data: string, retries = 2) => {
          fetch(`/api/interview/${sessionId}/terminal/pty`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data }),
          })
            .then(async (res) => {
              if (res.status === 410) {
                // Session lost - need to reconnect silently
                console.log("[PTY] Session lost (410), reconnecting silently...");
                silentReconnectRef.current = true;
                reconnectPTY("session_lost");
                return;
              }
              if (res.ok) {
                const json = await res.json();
                // If session was recreated on server, silently reconnect SSE stream
                if (json.sessionRecreated) {
                  console.log("[PTY] Session recreated on server, reconnecting SSE silently...");
                  silentReconnectRef.current = true;
                  reconnectPTY("session_recreated");
                }
                // Reset consecutive stream_ended counter on successful input
                consecutiveStreamEndedRef.current = 0;
              } else if (retries > 0) {
                setTimeout(() => sendInput(data, retries - 1), 50);
              }
            })
            .catch((err) => {
              console.error("[PTY] Failed to send input:", err);
              if (retries > 0) {
                setTimeout(() => sendInput(data, retries - 1), 100);
              }
            });
        };

        const flushInput = () => {
          if (inputBufferRef.current && connectionStatusRef.current === "connected") {
            const data = inputBufferRef.current;
            inputBufferRef.current = "";
            lastSendTimeRef.current = Date.now();
            sendInput(data);
          }
          batchTimeoutRef.current = null;
        };

        // Store the disposable to prevent duplicate handlers on reconnection
        onDataDisposableRef.current = terminal.onData((data) => {
          // If disconnected, allow user to reconnect by typing any key
          if (connectionStatusRef.current === "disconnected" && !isReconnectingRef.current) {
            console.log("[PTY] User input while disconnected, attempting reconnect...");
            consecutiveStreamEndedRef.current = 0; // Reset counter
            silentReconnectRef.current = false; // Show reconnect message
            reconnectPTY("user_triggered");
            return;
          }

          if (connectionStatusRef.current !== "connected") return;

          // NOTE: No local echo needed - PTY already echoes characters back
          // Local echo would cause double characters since the shell echoes input

          inputBufferRef.current += data;

          // Smart batching: send immediately if no recent send, otherwise batch
          const timeSinceLastSend = Date.now() - lastSendTimeRef.current;

          if (batchTimeoutRef.current) {
            // Already in a batch window - extend it
            clearTimeout(batchTimeoutRef.current);
            batchTimeoutRef.current = setTimeout(flushInput, CONTINUATION_BATCH_MS);
          } else if (timeSinceLastSend > CONTINUATION_BATCH_MS) {
            // No recent activity - send immediately
            flushInput();
          } else {
            // Recent send - start a short batch window
            batchTimeoutRef.current = setTimeout(flushInput, CONTINUATION_BATCH_MS);
          }
        });

      } catch (error) {
        console.error("[PTY] Connection failed:", error);
        terminal.writeln(`\x1b[31m[Error] ${error instanceof Error ? error.message : "Connection failed"}\x1b[0m`);

        // Retry PTY connection
        reconnectAttemptsRef.current++;
        if (reconnectAttemptsRef.current < MAX_SSE_RECONNECT_ATTEMPTS) {
          const delay = Math.min(2000 * reconnectAttemptsRef.current, 10000);
          terminal.writeln(`\x1b[33m[Retrying PTY connection in ${delay / 1000}s... (${reconnectAttemptsRef.current}/${MAX_SSE_RECONNECT_ATTEMPTS})]\x1b[0m`);
          reconnectTimeoutRef.current = setTimeout(() => connectPTY(terminal), delay);
        } else {
          terminal.writeln(`\x1b[31m[PTY connection failed after ${MAX_SSE_RECONNECT_ATTEMPTS} attempts]\x1b[0m`);
          terminal.writeln(`\x1b[33mPlease refresh the page to try again.\x1b[0m`);
        }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, updateConnectionStatus]);

    // Connect via WebSocket tunnel
    const connectTunnel = useCallback(async (terminal: XTerm) => {
      try {
        updateConnectionStatus("connecting");
        terminal.writeln("\x1b[90mConnecting via WebSocket tunnel...\x1b[0m");

        // Get tunnel URL from API
        const response = await fetch(`/api/interview/${sessionId}/terminal/tunnel`);

        if (!response.ok) {
          const errorData = await response.json();
          if (errorData.fallback) {
            terminal.writeln("\x1b[33m[Info] Tunnel not available, using PTY mode\x1b[0m");
            connectPTY(terminal);
            return;
          }
          throw new Error(errorData.error || "Failed to get tunnel URL");
        }

        const { data } = await response.json();
        const tunnelUrl = data.tunnelUrl;

        // ttyd WebSocket endpoint is at /ws
        // IMPORTANT: Must specify 'tty' subprotocol for ttyd to work!
        const wsUrl = `${tunnelUrl}/ws`;
        terminal.writeln(`\x1b[90mConnecting to ${wsUrl.substring(0, 50)}...\x1b[0m`);

        // Connect with 'tty' subprotocol - required by ttyd
        const ws = new WebSocket(wsUrl, ['tty']);
        wsRef.current = ws;

        // IMPORTANT: ttyd expects TEXT frames for input, but can send binary for output
        // Set binaryType for receiving, but we'll send as text strings
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          updateConnectionStatus("connected");
          setConnectionMode("tunnel");
          reconnectAttemptsRef.current = 0;
          terminal.writeln("\x1b[32m✓ Connected via WebSocket tunnel\x1b[0m");
          terminal.writeln("\x1b[32m✓ Low-latency mode active\x1b[0m");
          terminal.writeln("");

          // Send initial resize to ttyd as TEXT frame
          const sendResize = () => {
            const cols = terminal.cols;
            const rows = terminal.rows;
            // ttyd resize format: '1' + JSON string {"columns": N, "rows": M}
            // MUST be sent as a text frame (string), not binary!
            const resizeMsg = '1' + JSON.stringify({ columns: cols, rows: rows });
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(resizeMsg);  // Send as string = text frame
              console.log("[ttyd] Sent resize:", resizeMsg);
            }
          };
          sendResize();

          // Handle terminal resize
          terminal.onResize(() => sendResize());

          // Handle terminal input - send to ttyd as TEXT frame
          terminal.onData((data) => {
            console.log("[ttyd] Sending input:", JSON.stringify(data), "ws.readyState:", ws.readyState);
            if (ws.readyState === WebSocket.OPEN) {
              // ttyd input format: '0' + data
              // MUST be sent as a text frame (string), not binary!
              const inputMsg = '0' + data;
              console.log("[ttyd] Sending text message:", JSON.stringify(inputMsg));
              ws.send(inputMsg);  // Send as string = text frame
            }
          });
        };

        // Handle messages from ttyd
        ws.onmessage = (event) => {
          console.log("[ttyd] Message received, type:", typeof event.data,
            "isArrayBuffer:", event.data instanceof ArrayBuffer,
            "isBlob:", event.data instanceof Blob);

          if (event.data instanceof ArrayBuffer) {
            const data = new Uint8Array(event.data);
            console.log("[ttyd] ArrayBuffer length:", data.length, "first byte:", data[0], "char:", String.fromCharCode(data[0]));
            if (data.length > 0) {
              const messageType = data[0];
              if (messageType === TTYD_OUTPUT) {
                // Output message: '0' (ASCII) + terminal data
                const decoder = new TextDecoder();
                const output = decoder.decode(data.slice(1));
                console.log("[ttyd] OUTPUT:", output.substring(0, 50));
                terminal.write(output);
              } else {
                // Other ttyd message types - log but don't fail
                console.log("[ttyd] Other message type:", messageType, "char:", String.fromCharCode(messageType));
                // Try writing all non-'0' messages as output too (in case we have wrong message type)
                const decoder = new TextDecoder();
                const output = decoder.decode(data.slice(1));
                if (output.length > 0) {
                  console.log("[ttyd] Trying to write anyway:", output.substring(0, 50));
                  terminal.write(output);
                }
              }
            }
          } else if (typeof event.data === "string") {
            console.log("[ttyd] String message:", event.data.substring(0, 100));
            // ttyd can also send string messages (e.g., JSON for preferences)
            if (event.data.startsWith("0")) {
              // Output as string: '0' prefix + data
              terminal.write(event.data.slice(1));
            } else if (event.data.length > 0) {
              // Try writing anyway
              terminal.write(event.data);
            }
          } else if (event.data instanceof Blob) {
            // Handle Blob data
            console.log("[ttyd] Blob received, size:", event.data.size);
            event.data.arrayBuffer().then(buffer => {
              const data = new Uint8Array(buffer);
              console.log("[ttyd] Blob->ArrayBuffer, first byte:", data[0]);
              if (data.length > 1) {
                const decoder = new TextDecoder();
                const output = decoder.decode(data.slice(1));
                terminal.write(output);
              }
            });
          }
        };

        ws.onclose = (event) => {
          updateConnectionStatus("disconnected");

          if (reconnectAttemptsRef.current < MAX_TUNNEL_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            const delay = 1000 * reconnectAttemptsRef.current;
            terminal.writeln(`\x1b[33m[Reconnecting in ${delay / 1000}s... (${reconnectAttemptsRef.current}/${MAX_TUNNEL_RECONNECT_ATTEMPTS})]\x1b[0m`);
            reconnectTimeoutRef.current = setTimeout(() => connectTunnel(terminal), delay);
          } else {
            terminal.writeln("\x1b[33m[Max tunnel reconnect attempts reached, switching to PTY mode]\x1b[0m");
            reconnectAttemptsRef.current = 0;
            connectPTY(terminal);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

      } catch (error) {
        console.error("Tunnel connection failed:", error);
        terminal.writeln(`\x1b[31m[Error] ${error instanceof Error ? error.message : "Connection failed"}\x1b[0m`);
        terminal.writeln("\x1b[33m[Switching to PTY mode]\x1b[0m");
        connectPTY(terminal);
      }
    }, [sessionId, connectPTY, updateConnectionStatus]);

    useEffect(() => {
      if (!terminalRef.current) return;

      // Initialize xterm.js
      const terminal = new XTerm({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        theme: {
          background: "#000000",
          foreground: "#E0E0E0",
          cursor: "#5E6AD2",
          cursorAccent: "#000000",
          selectionBackground: "rgba(94, 106, 210, 0.3)",
          selectionForeground: "#FFFFFF",
          black: "#000000",
          red: "#EF5350",
          green: "#66BB6A",
          yellow: "#FFCA28",
          blue: "#5E6AD2",
          magenta: "#AB47BC",
          cyan: "#26C6DA",
          white: "#E0E0E0",
          brightBlack: "#4A4A4A",
          brightRed: "#FF5252",
          brightGreen: "#69F0AE",
          brightYellow: "#FFD740",
          brightBlue: "#6B77E1",
          brightMagenta: "#E040FB",
          brightCyan: "#00E5FF",
          brightWhite: "#FFFFFF",
        },
        rows: 24,
        cols: 80,
        scrollback: 1000,
        convertEol: true,
      });

      // Add addons
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      // Open terminal
      terminal.open(terminalRef.current);

      // Delay fit() to ensure DOM has rendered and dimensions are available
      requestAnimationFrame(() => {
        fitAddon.fit();
      });

      // Store refs
      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Welcome message
      terminal.writeln("\x1b[1;34m╔═══════════════════════════════════════════════╗\x1b[0m");
      terminal.writeln("\x1b[1;34m║\x1b[0m  \x1b[1;36mWelcome to InterviewLM Assessment\x1b[0m           \x1b[1;34m║\x1b[0m");
      terminal.writeln("\x1b[1;34m╚═══════════════════════════════════════════════╝\x1b[0m");
      terminal.writeln("");
      terminal.writeln("\x1b[90mConnecting to development environment...\x1b[0m");

      // Connect based on session mode
      if (sessionId === "demo") {
        // Demo mode uses simulated terminal (local-only with no real backend)
        setConnectionMode("pty");
        updateConnectionStatus("connected");
        terminal.writeln("\x1b[32m✓ Connected to AI Sandbox\x1b[0m");
        terminal.writeln("\x1b[32m✓ InterviewLM CLI initialized\x1b[0m");
        terminal.writeln("\x1b[90m[Demo Mode] Using simulated terminal\x1b[0m");
        terminal.writeln("");
        terminal.write("\x1b[1;32m$\x1b[0m ");
      } else {
        // Real session: use PTY bridge for low-latency terminal
        terminal.writeln("\x1b[32m✓ Connected to AI Sandbox\x1b[0m");
        terminal.writeln("\x1b[32m✓ InterviewLM CLI initialized\x1b[0m");
        terminal.writeln("");
        connectPTY(terminal);
      }

      // Handle window resize
      const handleResize = () => {
        if (fitAddonRef.current) {
          try {
            fitAddonRef.current.fit();
          } catch (e) {
            console.debug("Terminal fit skipped:", e);
          }
        }
      };
      window.addEventListener("resize", handleResize);

      // Handle container resize (for panel resizing) using ResizeObserver
      let resizeObserver: ResizeObserver | null = null;
      let resizeDebounceTimer: NodeJS.Timeout | null = null;
      if (terminalRef.current) {
        resizeObserver = new ResizeObserver((entries) => {
          // Clear any pending resize
          if (resizeDebounceTimer) {
            clearTimeout(resizeDebounceTimer);
          }

          // Get the new size
          const entry = entries[0];
          const { width, height } = entry.contentRect;

          // Skip if container is too small (collapsed or hidden)
          if (width < 100 || height < 50) {
            return;
          }

          // Debounce with a longer delay to let layout stabilize after expand
          resizeDebounceTimer = setTimeout(() => {
            if (fitAddonRef.current && terminalRef.current) {
              // Double-check dimensions are still valid
              const rect = terminalRef.current.getBoundingClientRect();
              if (rect.width >= 100 && rect.height >= 50) {
                try {
                  fitAddonRef.current.fit();
                } catch (e) {
                  console.debug("Terminal fit skipped (resize observer):", e);
                }
              }
            }
          }, 100); // 100ms debounce for layout to stabilize
        });
        resizeObserver.observe(terminalRef.current);
      }

      // Cleanup
      return () => {
        window.removeEventListener("resize", handleResize);
        if (resizeDebounceTimer) {
          clearTimeout(resizeDebounceTimer);
        }
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        if (onDataDisposableRef.current) {
          onDataDisposableRef.current.dispose();
          onDataDisposableRef.current = null;
        }
        if (wsRef.current) {
          wsRef.current.close();
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        if (batchTimeoutRef.current) {
          clearTimeout(batchTimeoutRef.current);
        }
        // Reset refs to prevent stale state on remount
        isReconnectingRef.current = false;
        consecutiveStreamEndedRef.current = 0;
        lastReconnectTimeRef.current = 0;
        terminal.dispose();
      };
    }, [sessionId, connectPTY, updateConnectionStatus]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        xtermRef.current?.write(data);
      },
      writeln: (data: string) => {
        xtermRef.current?.writeln(data);
      },
      connectionStatus,
      connectionMode,
    }));

    return (
      <div className={`h-full w-full bg-background relative ${className}`}>
        <div className="absolute inset-0 p-2">
          <div ref={terminalRef} className="h-full w-full" />
        </div>
      </div>
    );
  }
);

Terminal.displayName = "Terminal";

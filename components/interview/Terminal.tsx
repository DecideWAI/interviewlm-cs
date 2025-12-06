"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { AttachAddon } from "@xterm/addon-attach";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string;
  onCommand?: (command: string) => void;
  className?: string;
}

export interface TerminalHandle {
  write: (data: string) => void;
  writeln: (data: string) => void;
  connectionStatus: "connected" | "disconnected" | "connecting";
  connectionMode: "tunnel" | "fallback";
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
  ({ sessionId, onCommand, className = "" }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const attachAddonRef = useRef<AttachAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const connectionStatusRef = useRef<"connected" | "disconnected" | "connecting">("connecting");
    const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("connecting");
    const [connectionMode, setConnectionMode] = useState<"tunnel" | "fallback">("tunnel");
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef<number>(0);
    const onCommandRef = useRef(onCommand);
    const MAX_TUNNEL_RECONNECT_ATTEMPTS = 3;
    const MAX_SSE_RECONNECT_ATTEMPTS = 5;

    // Keep onCommand ref up to date without triggering effect re-runs
    useEffect(() => {
      onCommandRef.current = onCommand;
    }, [onCommand]);

    // Helper to update connection status in both ref and state
    const updateConnectionStatus = useCallback((status: "connected" | "disconnected" | "connecting") => {
      connectionStatusRef.current = status;
      setConnectionStatus(status);
    }, []);

    // Fallback to SSE/HTTP mode (existing implementation)
    const fallbackToSSE = useCallback((terminal: XTerm) => {
      setConnectionMode("fallback");
      terminal.writeln("\x1b[33m[Info] Using HTTP mode for terminal\x1b[0m");
      terminal.writeln("");

      // Simple loading state
      let isWaitingForOutput = false;
      const showLoading = () => {
        isWaitingForOutput = true;
        terminal.write("\x1b[90m⏳ Running...\x1b[0m");
      };
      const hideLoading = () => {
        if (isWaitingForOutput) {
          isWaitingForOutput = false;
          terminal.write("\r\x1b[K");
        }
      };

      // SSE connection for terminal output
      const connectSSE = () => {
        const sseUrl = `/api/interview/${sessionId}/terminal`;

        try {
          updateConnectionStatus("connecting");
          const eventSource = new EventSource(sseUrl);
          eventSourceRef.current = eventSource;

          eventSource.onopen = () => {
            updateConnectionStatus("connected");
            reconnectAttemptsRef.current = 0;
            terminal.writeln("\x1b[32m✓ Terminal connected (HTTP mode)\x1b[0m");
            terminal.write("\x1b[1;32m$\x1b[0m ");
          };

          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.output) {
                hideLoading();
                terminal.write(data.output);
              }
            } catch {
              hideLoading();
              terminal.write(event.data);
            }
          };

          eventSource.onerror = () => {
            updateConnectionStatus("disconnected");
            eventSource.close();
            reconnectAttemptsRef.current++;

            if (reconnectAttemptsRef.current < MAX_SSE_RECONNECT_ATTEMPTS) {
              const delay = Math.min(3000 * reconnectAttemptsRef.current, 15000);
              terminal.writeln(
                `\r\n\x1b[31m✗ Connection lost. Retrying (${reconnectAttemptsRef.current}/${MAX_SSE_RECONNECT_ATTEMPTS}) in ${delay / 1000}s...\x1b[0m`
              );
              reconnectTimeoutRef.current = setTimeout(connectSSE, delay);
            } else {
              terminal.writeln(`\r\n\x1b[31m✗ Connection failed after ${MAX_SSE_RECONNECT_ATTEMPTS} attempts.\x1b[0m`);
              terminal.writeln(`\x1b[33mPlease refresh the page to reconnect.\x1b[0m`);
            }
          };
        } catch (error) {
          console.error("Failed to connect SSE:", error);
          updateConnectionStatus("disconnected");
        }
      };

      // Handle data input for HTTP mode
      let currentLine = "";
      terminal.onData((data) => {
        const code = data.charCodeAt(0);

        // Handle Enter key
        if (code === 13) {
          terminal.write("\r\n");
          if (currentLine.trim()) {
            const command = currentLine.trim();

            if (connectionStatusRef.current === "connected") {
              showLoading();

              fetch(`/api/interview/${sessionId}/terminal/stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command }),
              })
                .then(async (res) => {
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  hideLoading();

                  const reader = res.body?.getReader();
                  if (!reader) throw new Error("No response body");

                  const decoder = new TextDecoder();
                  let buffer = "";

                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                      if (line.startsWith("data: ")) {
                        try {
                          const data = JSON.parse(line.slice(6));
                          if (data.output) terminal.write(data.output);
                          if (data.done) return;
                        } catch {
                          // Ignore parse errors
                        }
                      }
                    }
                  }
                })
                .catch((err) => {
                  console.error("Failed to send terminal input:", err);
                  hideLoading();
                  terminal.writeln("\x1b[31mFailed to send command\x1b[0m");
                  terminal.write("\x1b[1;32m$\x1b[0m ");
                });
            } else {
              terminal.writeln("Command: " + command);
              terminal.writeln("\x1b[33m(Not connected to backend)\x1b[0m");
              terminal.write("\x1b[1;32m$\x1b[0m ");
            }

            // Record terminal event
            fetch(`/api/interview/${sessionId}/events`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ eventType: "terminal_command", data: { command } }),
            }).catch((err) => console.error("Failed to record terminal event:", err));

            onCommandRef.current?.(command);
          } else {
            terminal.write("\x1b[1;32m$\x1b[0m ");
          }
          currentLine = "";
        }
        // Handle Backspace
        else if (code === 127) {
          if (currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
            terminal.write("\b \b");
          }
        }
        // Handle Ctrl+C
        else if (code === 3) {
          terminal.write("^C\r\n");
          if (connectionStatusRef.current === "connected") {
            fetch(`/api/interview/${sessionId}/terminal/input`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "interrupt" }),
            }).catch((err) => console.error("Failed to send interrupt:", err));
          }
          currentLine = "";
          terminal.write("\x1b[1;32m$\x1b[0m ");
        }
        // Regular characters
        else if (code >= 32) {
          currentLine += data;
          terminal.write(data);
        }
      });

      // Connect SSE
      connectSSE();
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
            terminal.writeln("\x1b[33m[Info] Tunnel not available\x1b[0m");
            fallbackToSSE(terminal);
            return;
          }
          throw new Error(errorData.error || "Failed to get tunnel URL");
        }

        const { data } = await response.json();
        const tunnelUrl = data.tunnelUrl;

        // ttyd WebSocket endpoint is at /ws
        const wsUrl = `${tunnelUrl}/ws`;
        terminal.writeln(`\x1b[90mConnecting to ${wsUrl.substring(0, 50)}...\x1b[0m`);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          updateConnectionStatus("connected");
          setConnectionMode("tunnel");
          reconnectAttemptsRef.current = 0;
          terminal.writeln("\x1b[32m✓ Connected via WebSocket tunnel\x1b[0m");
          terminal.writeln("\x1b[32m✓ Low-latency mode active\x1b[0m");
          terminal.writeln("");

          // Attach WebSocket to terminal for bidirectional communication
          const attachAddon = new AttachAddon(ws);
          attachAddonRef.current = attachAddon;
          terminal.loadAddon(attachAddon);
        };

        ws.onclose = (event) => {
          updateConnectionStatus("disconnected");

          // Clean up attach addon
          if (attachAddonRef.current) {
            attachAddonRef.current.dispose();
            attachAddonRef.current = null;
          }

          if (reconnectAttemptsRef.current < MAX_TUNNEL_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            const delay = 1000 * reconnectAttemptsRef.current;
            terminal.writeln(`\x1b[33m[Reconnecting in ${delay / 1000}s... (${reconnectAttemptsRef.current}/${MAX_TUNNEL_RECONNECT_ATTEMPTS})]\x1b[0m`);
            reconnectTimeoutRef.current = setTimeout(() => connectTunnel(terminal), delay);
          } else {
            terminal.writeln("\x1b[33m[Max reconnect attempts reached, falling back to HTTP mode]\x1b[0m");
            fallbackToSSE(terminal);
          }
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

      } catch (error) {
        console.error("Tunnel connection failed:", error);
        terminal.writeln(`\x1b[31m[Error] ${error instanceof Error ? error.message : "Connection failed"}\x1b[0m`);
        fallbackToSSE(terminal);
      }
    }, [sessionId, fallbackToSSE, updateConnectionStatus]);

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
        // Demo mode uses simulated terminal (fallback mode with no real backend)
        setConnectionMode("fallback");
        updateConnectionStatus("connected");
        terminal.writeln("\x1b[32m✓ Connected to Modal AI Sandbox\x1b[0m");
        terminal.writeln("\x1b[32m✓ Claude Code CLI initialized\x1b[0m");
        terminal.writeln("\x1b[90m[Demo Mode] Using simulated terminal\x1b[0m");
        terminal.writeln("");
        terminal.write("\x1b[1;32m$\x1b[0m ");
      } else {
        // Real session: try WebSocket tunnel first, fallback to SSE
        terminal.writeln("\x1b[32m✓ Connected to Modal AI Sandbox\x1b[0m");
        terminal.writeln("\x1b[32m✓ Claude Code CLI initialized\x1b[0m");
        terminal.writeln("");
        connectTunnel(terminal);
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

      // Cleanup
      return () => {
        window.removeEventListener("resize", handleResize);
        if (wsRef.current) {
          wsRef.current.close();
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        if (attachAddonRef.current) {
          attachAddonRef.current.dispose();
        }
        terminal.dispose();
      };
    }, [sessionId, connectTunnel, updateConnectionStatus]);

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

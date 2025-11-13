"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
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
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
  ({ sessionId, onCommand, className = "" }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const connectionStatusRef = useRef<"connected" | "disconnected" | "connecting">("connecting");
    const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("connecting");
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef<number>(0);
    const MAX_RECONNECT_ATTEMPTS = 5;

    // Helper to update connection status in both ref and state
    const updateConnectionStatus = (status: "connected" | "disconnected" | "connecting") => {
      connectionStatusRef.current = status;
      setConnectionStatus(status);
    };

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
    terminal.writeln("\x1b[32m✓ Connected to Modal AI Sandbox\x1b[0m");
    terminal.writeln("\x1b[32m✓ Claude Code CLI initialized\x1b[0m");
    terminal.writeln("");

    // SSE connection for terminal output
    const connectSSE = () => {
      const sseUrl = `/api/interview/${sessionId}/terminal`;

      try {
        updateConnectionStatus("connecting");
        const eventSource = new EventSource(sseUrl);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          updateConnectionStatus("connected");
          // Reset reconnect attempts on successful connection
          reconnectAttemptsRef.current = 0;
          terminal.writeln("\x1b[32m✓ Terminal connected to backend\x1b[0m");
          terminal.write("\x1b[1;32m$\x1b[0m ");
        };

        eventSource.onmessage = (event) => {
          // Receive output from backend terminal
          try {
            const data = JSON.parse(event.data);
            if (data.output) {
              terminal.write(data.output);
            }
          } catch (e) {
            // If not JSON, write raw data
            terminal.write(event.data);
          }
        };

        eventSource.onerror = (error) => {
          console.error("SSE error:", error);
          updateConnectionStatus("disconnected");
          eventSource.close();

          reconnectAttemptsRef.current++;

          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(3000 * reconnectAttemptsRef.current, 15000); // Exponential backoff up to 15s
            terminal.writeln(
              `\r\n\x1b[31m✗ Connection lost. Retrying (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}) in ${delay / 1000}s...\x1b[0m`
            );

            // Auto-reconnect with exponential backoff
            reconnectTimeoutRef.current = setTimeout(() => {
              connectSSE();
            }, delay);
          } else {
            // Max attempts reached - stop reconnecting
            terminal.writeln(
              `\r\n\x1b[31m✗ Connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts.\x1b[0m`
            );
            terminal.writeln(
              `\x1b[33mPlease refresh the page to reconnect.\x1b[0m`
            );
          }
        };
      } catch (error) {
        console.error("Failed to connect SSE:", error);
        updateConnectionStatus("disconnected");
      }
    };

    // Handle data input
    let currentLine = "";
    terminal.onData((data) => {
      const code = data.charCodeAt(0);

      // Handle Enter key
      if (code === 13) {
        terminal.write("\r\n");
        if (currentLine.trim()) {
          const command = currentLine.trim();

          // Send command via HTTP POST if connected
          if (connectionStatusRef.current === "connected") {
            fetch(`/api/interview/${sessionId}/terminal/input`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "input",
                data: command + "\n",
              }),
            }).catch((err) => {
              console.error("Failed to send terminal input:", err);
              terminal.writeln("\x1b[31mFailed to send command\x1b[0m");
            });
          } else {
            // Fallback to local echo if not connected
            terminal.writeln("Command: " + command);
            terminal.writeln("\x1b[33m(Not connected to backend)\x1b[0m");
          }

          // Record terminal event
          fetch(`/api/interview/${sessionId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventType: "terminal_command",
              data: { command },
            }),
          }).catch((err) => console.error("Failed to record terminal event:", err));

          onCommand?.(command);
        }
        currentLine = "";
        terminal.write("\x1b[1;32m$\x1b[0m ");
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
        terminal.write("^C");
        terminal.write("\r\n");

        // Send interrupt signal via HTTP POST
        if (connectionStatusRef.current === "connected") {
          fetch(`/api/interview/${sessionId}/terminal/input`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "interrupt",
            }),
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

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch (e) {
          // Ignore fit errors if terminal isn't ready
          console.debug("Terminal fit skipped:", e);
        }
      }
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      terminal.dispose();
    };
  }, [sessionId, onCommand]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        xtermRef.current?.write(data);
      },
      writeln: (data: string) => {
        xtermRef.current?.writeln(data);
      },
      connectionStatus,
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

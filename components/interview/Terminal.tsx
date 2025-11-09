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
    const wsRef = useRef<WebSocket | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("connecting");
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    terminal.write("\x1b[1;32m$\x1b[0m ");

    // WebSocket connection
    const connectWebSocket = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/interview/${sessionId}/terminal`;

      try {
        setConnectionStatus("connecting");
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnectionStatus("connected");
          terminal.writeln("\x1b[32m✓ Terminal connected to backend\x1b[0m");
          terminal.write("\x1b[1;32m$\x1b[0m ");
        };

        ws.onmessage = (event) => {
          // Receive output from backend terminal
          terminal.write(event.data);
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          setConnectionStatus("disconnected");
        };

        ws.onclose = () => {
          setConnectionStatus("disconnected");
          terminal.writeln("\r\n\x1b[31m✗ Terminal disconnected. Reconnecting...\x1b[0m");

          // Auto-reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, 3000);
        };
      } catch (error) {
        console.error("Failed to connect WebSocket:", error);
        setConnectionStatus("disconnected");
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
          // Send command to WebSocket if connected
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: "input",
              data: currentLine.trim() + "\n",
            }));
          } else {
            // Fallback to local echo if WebSocket not connected
            terminal.writeln("Command: " + currentLine.trim());
            terminal.writeln("(Not connected to backend)");
          }

          // Record terminal event
          fetch(`/api/interview/${sessionId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventType: "terminal_command",
              data: {
                command: currentLine.trim(),
              },
            }),
          }).catch((err) => console.error("Failed to record terminal event:", err));

          onCommand?.(currentLine.trim());
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

        // Send interrupt signal to WebSocket
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "interrupt",
          }));
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

    // Connect WebSocket
    connectWebSocket();

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
      if (wsRef.current) {
        wsRef.current.close();
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
      <div className={`h-full w-full bg-background ${className}`}>
        <div ref={terminalRef} className="h-full w-full p-2" />
      </div>
    );
  }
);

Terminal.displayName = "Terminal";

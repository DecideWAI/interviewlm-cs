"use client";

import React, { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  onCommand?: (command: string) => void;
  className?: string;
}

export function Terminal({ onCommand, className = "" }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

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
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

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

    // Handle data input
    let currentLine = "";
    terminal.onData((data) => {
      const code = data.charCodeAt(0);

      // Handle Enter key
      if (code === 13) {
        terminal.write("\r\n");
        if (currentLine.trim()) {
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
        currentLine = "";
        terminal.write("\x1b[1;32m$\x1b[0m ");
      }
      // Regular characters
      else if (code >= 32) {
        currentLine += data;
        terminal.write(data);
      }
    });

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
      terminal.dispose();
    };
  }, [onCommand]);

  // Public method to write to terminal
  const write = (data: string) => {
    xtermRef.current?.write(data);
  };

  const writeln = (data: string) => {
    xtermRef.current?.writeln(data);
  };

  // Expose methods via ref
  useEffect(() => {
    if (terminalRef.current) {
      (terminalRef.current as any).write = write;
      (terminalRef.current as any).writeln = writeln;
    }
  }, []);

  return (
    <div className={`h-full w-full bg-background ${className}`}>
      <div ref={terminalRef} className="h-full w-full p-2" />
    </div>
  );
}

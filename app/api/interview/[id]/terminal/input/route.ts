import { NextRequest, NextResponse } from "next/server";
import { queueTerminalOutput } from "@/lib/terminal-state";
import { getSession } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import { modalService as modal, sessionService as sessions } from "@/lib/services";

/**
 * Demo terminal command simulator
 * Returns mock output for common commands
 */
function simulateCommand(command: string): string {
  const cmd = command.trim().toLowerCase();

  // Handle common commands
  if (cmd === "ls" || cmd === "ls -la" || cmd === "ls -l") {
    return [
      "total 24",
      "drwxr-xr-x  5 user  staff   160 Nov 10 10:30 .",
      "drwxr-xr-x  3 user  staff    96 Nov 10 09:15 ..",
      "-rw-r--r--  1 user  staff   245 Nov 10 10:25 README.md",
      "-rw-r--r--  1 user  staff   512 Nov 10 10:28 package.json",
      "drwxr-xr-x  3 user  staff    96 Nov 10 10:20 src",
      "drwxr-xr-x  2 user  staff    64 Nov 10 10:22 tests",
      "",
    ].join("\r\n");
  }

  if (cmd === "pwd") {
    return "/home/candidate/workspace\r\n";
  }

  if (cmd.startsWith("cat ")) {
    const filename = cmd.substring(4).trim();
    if (filename === "readme.md" || filename === "README.md") {
      return [
        "# Longest Palindromic Substring",
        "",
        "## Problem",
        "Given a string s, return the longest palindromic substring in s.",
        "",
        "## Examples",
        "- Input: 'babad' → Output: 'bab' (or 'aba')",
        "- Input: 'cbbd' → Output: 'bb'",
        "",
      ].join("\r\n");
    }
    return `cat: ${filename}: No such file or directory\r\n`;
  }

  if (cmd === "node --version" || cmd === "node -v") {
    return "v20.10.0\r\n";
  }

  if (cmd === "npm --version" || cmd === "npm -v") {
    return "10.2.3\r\n";
  }

  if (cmd === "npm test" || cmd === "npm run test") {
    return [
      "",
      "> test",
      "> jest",
      "",
      " PASS  tests/solution.test.ts",
      "  longestPalindrome",
      "    ✓ returns 'bab' for input 'babad' (3 ms)",
      "    ✓ returns 'bb' for input 'cbbd' (1 ms)",
      "    ✓ handles single character (1 ms)",
      "",
      "Test Suites: 1 passed, 1 total",
      "Tests:       3 passed, 3 total",
      "Snapshots:   0 total",
      "Time:        0.842 s",
      "Ran all test suites.",
      "",
    ].join("\r\n");
  }

  if (cmd === "clear" || cmd === "cls") {
    return "\x1b[2J\x1b[H"; // ANSI escape codes to clear screen
  }

  if (cmd === "help") {
    return [
      "Available commands:",
      "  ls          - List files",
      "  pwd         - Print working directory",
      "  cat <file>  - Display file contents",
      "  npm test    - Run tests",
      "  node -v     - Node version",
      "  clear       - Clear terminal",
      "  help        - Show this help",
      "",
    ].join("\r\n");
  }

  if (cmd === "") {
    return "";
  }

  // Unknown command
  return `bash: ${command}: command not found\r\n`;
}

/**
 * POST /api/interview/[id]/terminal/input
 * Handle terminal input (commands, interrupts)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { type, data } = body;

    // Demo mode bypass
    const isDemoMode = id === "demo";

    if (!isDemoMode) {
      const session = await getSession();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (type === "input") {
      // Handle terminal command input
      const command = data.trim();

      if (isDemoMode) {
        // Demo mode: simulate command execution
        const output = simulateCommand(command);
        if (output) {
          queueTerminalOutput(id, output);
        }
        queueTerminalOutput(id, "\x1b[1;32m$\x1b[0m ");
      } else {
        // Production mode: Execute in Modal sandbox
        try {
          // Get candidate to find volumeId and session recording
          const candidate = await prisma.candidate.findUnique({
            where: { id },
            select: {
              volumeId: true,
              generatedQuestions: true,
              sessionRecording: {
                select: { id: true }
              }
            },
          });

          if (!candidate) {
            queueTerminalOutput(id, "\x1b[31mError: Candidate not found\x1b[0m\r\n");
            queueTerminalOutput(id, "\x1b[1;32m$\x1b[0m ");
            return NextResponse.json({ success: true });
          }

          // Note: runCommand() handles sandbox creation via getOrCreateSandbox()
          // No need to manually check/create sandbox here

          // Record terminal input event
          if (candidate.sessionRecording) {
            await sessions.recordEvent(
              candidate.sessionRecording.id,
              "terminal.command",
              "USER",
              {
                command,
                workingDirectory: "/workspace",
                timestamp: new Date().toISOString(),
              }
            );
          }

          // Execute command in Modal sandbox (from /workspace directory)
          const result = await modal.runCommand(id, command, "/workspace");

          // Build output string (convert \n to \r\n for terminal display)
          let output = "";

          if (result.stdout) {
            output += result.stdout.replace(/\n/g, '\r\n');
            if (!output.endsWith('\r\n')) {
              output += '\r\n';
            }
          }

          if (result.stderr) {
            const formattedError = result.stderr.replace(/\n/g, '\r\n');
            output += `\x1b[31m${formattedError}\x1b[0m`;
            if (!formattedError.endsWith('\r\n')) {
              output += '\r\n';
            }
          }

          if (result.exitCode !== 0) {
            output += `\x1b[31m[Exit code: ${result.exitCode}]\x1b[0m\r\n`;
          }

          // Record terminal output event
          if (candidate.sessionRecording) {
            await sessions.recordEvent(
              candidate.sessionRecording.id,
              "terminal.output",
              "SYSTEM", // Output comes from the system
              {
                output,
                stdout: result.stdout || "",
                stderr: result.stderr || "",
                exitCode: result.exitCode,
                timestamp: new Date().toISOString(),
              }
            );
          }

          // Add prompt to output
          output += "\x1b[1;32m$\x1b[0m ";

          // Return output directly in response (avoids serverless state isolation issue)
          return NextResponse.json({ success: true, output });
        } catch (error) {
          console.error("Terminal command execution error:", error);
          const errorOutput = `\x1b[31mError: ${error instanceof Error ? error.message : "Command failed"}\x1b[0m\r\n\x1b[1;32m$\x1b[0m `;
          return NextResponse.json({ success: true, output: errorOutput });
        }
      }

      return NextResponse.json({ success: true });
    } else if (type === "interrupt") {
      // Handle Ctrl+C interrupt
      queueTerminalOutput(id, "^C\r\n");
      queueTerminalOutput(id, "\x1b[1;32m$\x1b[0m ");

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Invalid input type" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Terminal input error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { FileTree, FileNode } from "@/components/interview/FileTree";
import { AIChat, Message } from "@/components/interview/AIChat";
import { TechStackDisplay } from "@/components/interview/TechStackDisplay";
import { TechStackRequirements } from "@/types/assessment";
import { LANGUAGES, TESTING } from "@/lib/tech-catalog";

// Dynamic import for Terminal (xterm.js requires client-side only)
const Terminal = dynamic(
  () => import("@/components/interview/Terminal").then((mod) => mod.Terminal),
  { ssr: false }
);
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Play,
  Clock,
  MessageSquare,
  Code2,
  Terminal as TerminalIcon,
  Info,
} from "lucide-react";
import Link from "next/link";

// Demo file structure
const demoFiles: FileNode[] = [
  {
    id: "1",
    name: "solution.ts",
    type: "file",
    path: "solution.ts",
  },
  {
    id: "2",
    name: "solution.test.ts",
    type: "file",
    path: "solution.test.ts",
  },
  {
    id: "3",
    name: "README.md",
    type: "file",
    path: "README.md",
  },
];

const demoCode = `/**
 * Problem: Longest Palindromic Substring
 *
 * Given a string s, return the longest palindromic substring in s.
 *
 * Example 1:
 * Input: s = "babad"
 * Output: "bab" or "aba"
 *
 * Example 2:
 * Input: s = "cbbd"
 * Output: "bb"
 *
 * Constraints:
 * - 1 <= s.length <= 1000
 * - s consist of only digits and English letters
 */

function longestPalindrome(s: string): string {
  // TODO: Implement your solution here
  // Feel free to ask Claude for help!

  return "";
}

// Test your solution
console.log(longestPalindrome("babad")); // Expected: "bab" or "aba"
console.log(longestPalindrome("cbbd"));  // Expected: "bb"
`;

// Demo tech stack requirements
const demoTechRequirements: TechStackRequirements = {
  critical: [LANGUAGES.typescript],
  required: [],
  recommended: [TESTING.jest],
  optional: [],
};

export default function DemoInterviewPage() {
  const [selectedFile, setSelectedFile] = useState<FileNode>(demoFiles[0]);
  const [code, setCode] = useState(demoCode);

  const handleFileSelect = (file: FileNode) => {
    if (file.type === "file") {
      setSelectedFile(file);
    }
  };

  const handleTerminalCommand = (command: string) => {
    console.log("Demo command:", command);
    // In demo mode, just log the command
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-text-primary">
                  Demo Assessment: Longest Palindrome
                </h1>
                <Badge variant="primary" className="gap-1">
                  <Info className="h-3 w-3" />
                  Demo Mode
                </Badge>
              </div>
              <p className="text-sm text-text-secondary">
                Try out the InterviewLM platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Time (Demo) */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-text-tertiary" />
              <span className="text-sm font-mono text-text-secondary">
                No time limit
              </span>
            </div>

            <Button size="sm" variant="outline">
              <Play className="h-4 w-4 mr-2" />
              Run Tests
            </Button>

            <Link href="/auth/signup">
              <Button size="sm" variant="primary">
                Start Real Assessment
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tech Stack Requirements */}
      <div className="px-4 py-3 border-b border-border">
        <TechStackDisplay requirements={demoTechRequirements} />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Sidebar - File Tree */}
          <Panel defaultSize={15} minSize={10} maxSize={25}>
            <div className="h-full border-r border-border flex flex-col">
              <div className="border-b border-border px-3 py-2 bg-background-secondary">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  Files
                </p>
              </div>
              <FileTree
                sessionId="demo"
                files={demoFiles}
                selectedFile={selectedFile?.path}
                onFileSelect={handleFileSelect}
                className="flex-1"
              />
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

          {/* Center - Editor and Terminal */}
          <Panel defaultSize={55} minSize={40}>
            <PanelGroup direction="vertical">
              {/* Editor */}
              <Panel defaultSize={60} minSize={30}>
                <div className="h-full flex flex-col">
                  {/* Editor Tabs */}
                  <div className="border-b border-border bg-background-secondary flex items-center px-2">
                    <div className="flex items-center gap-1 px-3 py-2 bg-background border-r border-border text-sm">
                      <Code2 className="h-4 w-4 text-primary" />
                      <span className="text-text-primary">
                        {selectedFile?.name}
                      </span>
                    </div>
                  </div>

                  {/* Editor */}
                  <div className="flex-1">
                    <CodeEditor
                      sessionId="demo"
                      questionId="demo-question"
                      value={code}
                      onChange={setCode}
                      language="typescript"
                      fileName={selectedFile?.name}
                    />
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors" />

              {/* Terminal */}
              <Panel defaultSize={40} minSize={20}>
                <div className="h-full flex flex-col">
                  <div className="border-b border-border bg-background-secondary px-3 py-2 flex items-center gap-2">
                    <TerminalIcon className="h-4 w-4 text-success" />
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      Terminal
                    </p>
                    <Badge variant="default" className="text-xs">
                      Demo
                    </Badge>
                  </div>
                  <div className="flex-1">
                    <Terminal sessionId="demo" onCommand={handleTerminalCommand} />
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

          {/* Right Sidebar - AI Chat */}
          <Panel defaultSize={30} minSize={25} maxSize={45}>
            <div className="h-full border-l border-border">
              <AIChat
                sessionId="demo"
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

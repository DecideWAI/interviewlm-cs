"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { FileTree, FileNode } from "@/components/interview/FileTree";
import { AIChat, Message } from "@/components/interview/AIChat";
import { ProblemPanel } from "@/components/interview/ProblemPanel";
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
  FileCode,
  BookOpen,
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
  required: [LANGUAGES.typescript],
  optional: [TESTING.jest],
};

export default function DemoInterviewPage() {
  const [selectedFile, setSelectedFile] = useState<FileNode>(demoFiles[0]);
  const [code, setCode] = useState(demoCode);
  const [leftSidebarTab, setLeftSidebarTab] = useState<"problem" | "files">("problem");
  const [panelSizes, setPanelSizes] = useState<{
    horizontal: number[];
    vertical: number[];
  }>({
    horizontal: [25, 48, 27], // Default: Sidebar, Editor+Terminal, Chat
    vertical: [60, 40], // Default: Editor, Terminal
  });

  // Load sidebar tab preference and panel sizes from localStorage
  React.useEffect(() => {
    const savedTab = localStorage.getItem("demo-sidebar-tab");
    if (savedTab === "problem" || savedTab === "files") {
      setLeftSidebarTab(savedTab);
    }

    const savedPanelSizes = localStorage.getItem("demo-panel-sizes-v2");
    if (savedPanelSizes) {
      try {
        const parsed = JSON.parse(savedPanelSizes);
        setPanelSizes(parsed);
      } catch (e) {
        console.error("Failed to parse panel sizes:", e);
      }
    }
  }, []);

  // Save panel sizes to localStorage
  const handleHorizontalLayout = (sizes: number[]) => {
    const newSizes = { ...panelSizes, horizontal: sizes };
    setPanelSizes(newSizes);
    localStorage.setItem("demo-panel-sizes-v2", JSON.stringify(newSizes));
  };

  const handleVerticalLayout = (sizes: number[]) => {
    const newSizes = { ...panelSizes, vertical: sizes };
    setPanelSizes(newSizes);
    localStorage.setItem("demo-panel-sizes-v2", JSON.stringify(newSizes));
  };

  // Save sidebar tab preference
  const handleTabChange = (tab: "problem" | "files") => {
    setLeftSidebarTab(tab);
    localStorage.setItem("demo-sidebar-tab", tab);
  };

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
      {/* Compact Header */}
      <div className="border-b border-border bg-background-secondary px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>

            <div className="h-4 w-px bg-border" />

            <h1 className="text-sm font-semibold text-text-primary">
              Demo: Longest Palindrome
            </h1>
            <Badge variant="primary" className="gap-1">
              <Info className="h-3 w-3" />
              Demo Mode
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            {/* Time (Demo) */}
            <div className="flex items-center gap-2 text-sm text-text-tertiary">
              <Clock className="h-4 w-4" />
              <span className="font-mono">No time limit</span>
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

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" onLayout={handleHorizontalLayout}>
          {/* Left Sidebar - Problem/Files Tabs */}
          <Panel defaultSize={panelSizes.horizontal[0]} minSize={20} maxSize={35}>
            <div className="h-full border-r border-border flex flex-col bg-background">
              {/* Tabs */}
              <div className="border-b border-border bg-background-secondary flex">
                <button
                  onClick={() => handleTabChange("problem")}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                    leftSidebarTab === "problem"
                      ? "text-primary border-b-2 border-primary bg-background"
                      : "text-text-tertiary hover:text-text-secondary hover:bg-background-hover"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <span>Problem</span>
                  </div>
                </button>
                <button
                  onClick={() => handleTabChange("files")}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                    leftSidebarTab === "files"
                      ? "text-primary border-b-2 border-primary bg-background"
                      : "text-text-tertiary hover:text-text-secondary hover:bg-background-hover"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <FileCode className="h-4 w-4" />
                    <span>Files</span>
                  </div>
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden">
                {leftSidebarTab === "problem" ? (
                  <ProblemPanel
                    title="Longest Palindromic Substring"
                    description="Given a string s, return the longest palindromic substring in s."
                    difficulty="medium"
                    constraints={[
                      "1 <= s.length <= 1000",
                      "s consist of only digits and English letters",
                    ]}
                    examples={[
                      {
                        input: 's = "babad"',
                        output: '"bab" or "aba"',
                        explanation:
                          "Both 'bab' and 'aba' are valid answers.",
                      },
                      {
                        input: 's = "cbbd"',
                        output: '"bb"',
                      },
                    ]}
                    techStack={demoTechRequirements}
                  />
                ) : (
                  <FileTree
                    sessionId="demo"
                    files={demoFiles}
                    selectedFile={selectedFile?.path}
                    onFileSelect={handleFileSelect}
                    className="flex-1"
                  />
                )}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

          {/* Center - Editor and Terminal */}
          <Panel defaultSize={panelSizes.horizontal[1]} minSize={40}>
            <PanelGroup direction="vertical" onLayout={handleVerticalLayout}>
              {/* Editor */}
              <Panel defaultSize={panelSizes.vertical[0]} minSize={30}>
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
                  <div className="flex-1 min-h-0">
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
              <Panel defaultSize={panelSizes.vertical[1]} minSize={20}>
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
                  <div className="flex-1 min-h-0">
                    <Terminal sessionId="demo" onCommand={handleTerminalCommand} />
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

          {/* Right Sidebar - AI Chat */}
          <Panel defaultSize={panelSizes.horizontal[2]} minSize={25} maxSize={45}>
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

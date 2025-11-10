"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { FileTree, FileNode } from "@/components/interview/FileTree";
import { AIChat, Message } from "@/components/interview/AIChat";

// Dynamic import for Terminal (xterm.js requires client-side only)
const Terminal = dynamic(
  () => import("@/components/interview/Terminal").then((mod) => mod.Terminal),
  { ssr: false }
);
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Square,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Code2,
  Terminal as TerminalIcon,
} from "lucide-react";

// Sample file structure
const sampleFiles: FileNode[] = [
  {
    id: "1",
    name: "src",
    type: "folder",
    path: "src",
    children: [
      {
        id: "2",
        name: "index.ts",
        type: "file",
        path: "src/index.ts",
      },
      {
        id: "3",
        name: "utils.ts",
        type: "file",
        path: "src/utils.ts",
      },
    ],
  },
  {
    id: "4",
    name: "tests",
    type: "folder",
    path: "tests",
    children: [
      {
        id: "5",
        name: "index.test.ts",
        type: "file",
        path: "tests/index.test.ts",
      },
    ],
  },
  {
    id: "6",
    name: "package.json",
    type: "file",
    path: "package.json",
  },
  {
    id: "7",
    name: "README.md",
    type: "file",
    path: "README.md",
  },
];

const sampleCode = `// Implement a function to find the longest palindromic substring
function longestPalindrome(s: string): string {
  // Your implementation here
  return "";
}

// Test cases
console.log(longestPalindrome("babad")); // Expected: "bab" or "aba"
console.log(longestPalindrome("cbbd"));  // Expected: "bb"
`;

export default function InterviewPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [code, setCode] = useState(sampleCode);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAIChatOpen, setIsAIChatOpen] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(5400); // 90 minutes in seconds

  // Format time remaining
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleFileSelect = (file: FileNode) => {
    if (file.type === "file") {
      setSelectedFile(file);
      // In a real app, load file content here
    }
  };

  const handleSendMessage = (message: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    setMessages([...messages, userMessage]);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I can help you with that! Here's a suggested approach:\n\n1. Use dynamic programming\n2. Consider edge cases\n3. Optimize for time complexity\n\nWould you like me to provide a code example?",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 1000);
  };

  const handleTerminalCommand = (command: string) => {
    console.log("Command:", command);
    // In a real app, send to backend/Modal sandbox
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                Assessment: Longest Palindrome Substring
              </h1>
              <p className="text-sm text-text-secondary">
                Senior Software Engineer - Full Stack
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Time Remaining */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-warning" />
              <span className="text-sm font-mono text-text-primary">
                {formatTime(timeRemaining)}
              </span>
            </div>

            {/* Test Status */}
            <Badge variant="default" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              3/5 tests passing
            </Badge>

            {/* Actions */}
            <Button size="sm" variant="outline">
              <Play className="h-4 w-4 mr-2" />
              Run Tests
            </Button>

            <Button size="sm" variant="primary">
              Submit Assessment
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Sidebar - File Tree */}
          <Panel defaultSize={15} minSize={10} maxSize={30}>
            <div className="h-full border-r border-border flex flex-col">
              <div className="border-b border-border px-3 py-2 bg-background-secondary">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  Explorer
                </p>
              </div>
              <FileTree
                files={sampleFiles}
                selectedFile={selectedFile?.path}
                onFileSelect={handleFileSelect}
                className="flex-1"
              />
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

          {/* Center - Editor and Terminal */}
          <Panel defaultSize={isAIChatOpen ? 55 : 85} minSize={40}>
            <PanelGroup direction="vertical">
              {/* Editor */}
              <Panel defaultSize={60} minSize={30}>
                <div className="h-full flex flex-col border-b border-border">
                  {/* Editor Tabs */}
                  <div className="border-b border-border bg-background-secondary flex items-center px-2">
                    <div className="flex items-center gap-1 px-3 py-2 bg-background border-r border-border text-sm">
                      <Code2 className="h-4 w-4 text-primary" />
                      <span className="text-text-primary">
                        {selectedFile?.name || "index.ts"}
                      </span>
                    </div>
                  </div>

                  {/* Editor */}
                  <div className="flex-1">
                    <CodeEditor
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
                  </div>
                  <div className="flex-1">
                    <Terminal sessionId={sessionId} onCommand={handleTerminalCommand} />
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          {/* Right Sidebar - AI Chat */}
          {isAIChatOpen && (
            <>
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />
              <Panel defaultSize={30} minSize={20} maxSize={50}>
                <div className="h-full border-l border-border">
                  <AIChat
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    isLoading={false}
                  />
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* Toggle AI Chat */}
      {!isAIChatOpen && (
        <button
          onClick={() => setIsAIChatOpen(true)}
          className="fixed bottom-4 right-4 h-12 w-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-hover transition-colors"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}

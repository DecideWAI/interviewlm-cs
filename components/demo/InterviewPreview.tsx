"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  Code2,
  Terminal as TerminalIcon,
  MessageSquare,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

const codeSnippet = `function isPalindrome(s: string): boolean {
  const clean = s.toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return clean === clean.split('').reverse().join('');
}`;

const terminalOutput = [
  { type: "command", text: "$ npm test" },
  { type: "output", text: "Running tests..." },
  { type: "success", text: "✓ Test 1: Basic palindrome passed" },
  { type: "success", text: "✓ Test 2: Empty string passed" },
  { type: "error", text: "✗ Test 3: Mixed case failed" },
];

const aiMessages = [
  { role: "user", text: "How do I handle special characters?" },
  { role: "ai", text: "Use regex to remove non-alphanumeric chars..." },
];

export function InterviewPreview() {
  const [activeTab, setActiveTab] = useState<"editor" | "terminal" | "ai">("editor");
  const [typedCode, setTypedCode] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // Typewriter effect for code
  useEffect(() => {
    if (activeTab === "editor" && !isTyping) {
      setIsTyping(true);
      let i = 0;
      const interval = setInterval(() => {
        if (i < codeSnippet.length) {
          setTypedCode(codeSnippet.slice(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
          setIsTyping(false);
        }
      }, 30);

      return () => clearInterval(interval);
    }
  }, [activeTab]);

  return (
    <div className="relative">
      {/* Glow effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-primary/10 rounded-lg blur-xl" />

      <Card className="relative border-border-secondary bg-background overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-background-secondary px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-error" />
                <div className="h-3 w-3 rounded-full bg-warning" />
                <div className="h-3 w-3 rounded-full bg-success" />
              </div>
              <Badge variant="primary" className="gap-1">
                <Sparkles className="h-3 w-3" />
                Live Session
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <span className="font-mono">85:42</span>
              <span>remaining</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-border bg-background-secondary flex">
          <button
            onClick={() => setActiveTab("editor")}
            className={`px-4 py-2 text-sm flex items-center gap-2 border-r border-border transition-colors ${
              activeTab === "editor"
                ? "bg-background text-primary border-b-2 border-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Code2 className="h-4 w-4" />
            Code Editor
          </button>
          <button
            onClick={() => setActiveTab("terminal")}
            className={`px-4 py-2 text-sm flex items-center gap-2 border-r border-border transition-colors ${
              activeTab === "terminal"
                ? "bg-background text-success border-b-2 border-success"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <TerminalIcon className="h-4 w-4" />
            Terminal
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={`px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
              activeTab === "ai"
                ? "bg-background text-primary border-b-2 border-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Claude AI
          </button>
        </div>

        {/* Content */}
        <div className="h-64 p-4 bg-background overflow-hidden">
          {activeTab === "editor" && (
            <div className="h-full">
              <pre className="text-sm font-mono text-text-secondary leading-relaxed">
                <code>{typedCode}<span className="animate-pulse">|</span></code>
              </pre>
            </div>
          )}

          {activeTab === "terminal" && (
            <div className="h-full space-y-1">
              {terminalOutput.map((line, i) => (
                <div
                  key={i}
                  className={`text-sm font-mono ${
                    line.type === "command"
                      ? "text-primary"
                      : line.type === "success"
                      ? "text-success"
                      : line.type === "error"
                      ? "text-error"
                      : "text-text-secondary"
                  }`}
                >
                  {line.text}
                </div>
              ))}
              <div className="text-sm font-mono text-primary animate-pulse">$ _</div>
            </div>
          )}

          {activeTab === "ai" && (
            <div className="h-full space-y-3">
              {aiMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-white"
                        : "bg-background-tertiary border border-border text-text-secondary"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                </div>
                <div className="flex gap-1 items-center">
                  <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-background-secondary px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-text-tertiary">
              <span>Real-time AI assistance</span>
              <span>•</span>
              <span>Secure sandbox</span>
              <span>•</span>
              <span>Full session recording</span>
            </div>
            <Link href="/interview/demo">
              <Button size="sm">
                Try Demo
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIChatProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function AIChat({ messages, onSendMessage, isLoading = false, className }: AIChatProps) {
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-text-primary">Claude Code AI</h3>
        </div>
        <p className="text-xs text-text-tertiary mt-1">
          Ask questions, generate code, or get help with debugging
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-sm">
              <Bot className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary mb-2">Start a conversation with Claude</p>
              <p className="text-sm text-text-tertiary">
                Try: "Help me implement a binary search algorithm" or "Fix the bug in line 42"
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3 group",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[80%] rounded-lg p-3",
                    message.role === "user"
                      ? "bg-primary text-white"
                      : "bg-background-tertiary border border-border"
                  )}
                >
                  <div className="prose prose-invert prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {message.content}
                    </pre>
                  </div>

                  {message.role === "assistant" && (
                    <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => copyToClipboard(message.content, message.id)}
                        className="text-xs text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1"
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check className="h-3 w-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-background-tertiary flex items-center justify-center">
                      <User className="h-5 w-5 text-text-secondary" />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary animate-pulse" />
                  </div>
                </div>
                <div className="bg-background-tertiary border border-border rounded-lg p-3">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="h-2 w-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="h-2 w-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude for help..."
            className="resize-none"
            rows={3}
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-text-tertiary mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Copy, Check, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

interface AIChatProps {
  sessionId: string;
  className?: string;
}

export function AIChat({ sessionId, className }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStreamingMessage]);

  // Load initial chat history
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const response = await fetch(`/api/interview/${sessionId}/chat/history`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error("Failed to load chat history:", err);
      }
    };

    loadChatHistory();
  }, [sessionId]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);
    setCurrentStreamingMessage("");

    try {
      // Record user message
      await fetch(`/api/interview/${sessionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "chat_message",
          data: {
            role: "user",
            content: userMessage.content,
          },
        }),
      });

      // Connect to SSE endpoint for streaming response
      const eventSource = new EventSource(
        `/api/interview/${sessionId}/chat?message=${encodeURIComponent(input.trim())}`
      );
      eventSourceRef.current = eventSource;

      let assistantMessageId = (Date.now() + 1).toString();
      let fullContent = "";
      let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.addEventListener("content", (event) => {
        const data = JSON.parse(event.data);
        fullContent += data.delta;
        setCurrentStreamingMessage(fullContent);
      });

      eventSource.addEventListener("usage", (event) => {
        const data = JSON.parse(event.data);
        tokenUsage = {
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
        };
      });

      eventSource.addEventListener("done", async () => {
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: "assistant",
          content: fullContent,
          timestamp: new Date(),
          tokenUsage,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setCurrentStreamingMessage("");
        setIsLoading(false);

        // Record assistant message
        await fetch(`/api/interview/${sessionId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "chat_message",
            data: {
              role: "assistant",
              content: fullContent,
              tokenUsage,
            },
          }),
        });

        eventSource.close();
        eventSourceRef.current = null;
      });

      eventSource.onerror = (err) => {
        console.error("SSE error:", err);
        setError("Connection to AI service lost. Please try again.");
        setIsConnected(false);
        setIsLoading(false);
        setCurrentStreamingMessage("");
        eventSource.close();
        eventSourceRef.current = null;
      };
    } catch (err) {
      console.error("Failed to send message:", err);
      setError("Failed to send message. Please try again.");
      setIsLoading(false);
      setCurrentStreamingMessage("");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-text-primary">Claude Code AI</h3>
          </div>
          <div className="flex items-center gap-1">
            {isConnected ? (
              <Wifi className="h-4 w-4 text-success" />
            ) : (
              <WifiOff className="h-4 w-4 text-error" />
            )}
          </div>
        </div>
        <p className="text-xs text-text-tertiary mt-1">
          Ask questions, generate code, or get help with debugging
        </p>
        {error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-error bg-error/10 p-2 rounded">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
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
                    <div className="mt-2 flex items-center justify-between gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                      {message.tokenUsage && (
                        <div className="text-xs text-text-muted">
                          {message.tokenUsage.inputTokens + message.tokenUsage.outputTokens} tokens
                        </div>
                      )}
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

            {currentStreamingMessage && (
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <div className="bg-background-tertiary border border-border rounded-lg p-3 max-w-[80%]">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {currentStreamingMessage}
                      <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {isLoading && !currentStreamingMessage && (
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

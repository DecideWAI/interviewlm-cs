"use client";

import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Send, Bot, User, Copy, Check, AlertCircle, Wifi, WifiOff, Wrench, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fetchWithRetry } from "@/lib/chat-resilience";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  type?: "tool_use" | "tool_result" | "tool_error";
  toolName?: string;
  toolInput?: any;
  toolOutput?: any;
}

export interface AIChatHandle {
  resetConversation: () => void;
}

interface AIChatProps {
  sessionId: string;
  className?: string;
  onFileModified?: (path: string) => void;
  onTestResultsUpdated?: (results: any) => void;
  onSuggestNextQuestion?: (suggestion: {
    reason: string;
    performance: string;
  }) => void;
}

export const AIChat = forwardRef<AIChatHandle, AIChatProps>(function AIChat({
  sessionId,
  className,
  onFileModified,
  onTestResultsUpdated,
  onSuggestNextQuestion
}, ref) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState("");
  const [currentToolUse, setCurrentToolUse] = useState<{
    toolName: string;
    toolId: string;
    status: "running" | "complete" | "error";
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationHistory = useRef<any[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Reset conversation (called when moving to next question)
  const resetConversation = () => {
    setMessages([{
      id: Date.now().toString(),
      role: "system",
      content: "🔄 Conversation reset for new question. Previous context cleared.",
      timestamp: new Date(),
    }]);
    conversationHistory.current = [];
    setError(null);
    setInput("");
    setCurrentStreamingMessage("");
    setCurrentToolUse(null);
  };

  // Expose resetConversation to parent via ref
  useImperativeHandle(ref, () => ({
    resetConversation,
  }));

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStreamingMessage, currentToolUse]);

  // Load initial chat history
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const response = await fetch(`/api/interview/${sessionId}/chat/history`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);

          // Build conversation history for Agent SDK
          conversationHistory.current = (data.messages || [])
            .filter((msg: Message) => msg.role === "user" || msg.role === "assistant")
            .map((msg: Message) => ({
              role: msg.role,
              content: msg.content,
            }));
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
    setCurrentToolUse(null);

    // Add to conversation history
    conversationHistory.current.push({
      role: "user",
      content: userMessage.content,
    });

    try {
      // Send conversation history to agent endpoint with retry logic
      const response = await fetchWithRetry(
        `/api/interview/${sessionId}/chat/agent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: conversationHistory.current,
          }),
        },
        {
          maxRetries: 3,
          initialDelay: 2000,
          maxDelay: 16000,
          onRetry: (attempt, delay) => {
            setIsReconnecting(true);
            setError(`Connection issue. Retrying in ${delay / 1000}s... (attempt ${attempt}/3)`);
          },
        }
      );

      setIsReconnecting(false);

      if (!response.ok || !response.body) {
        throw new Error("Failed to connect to AI");
      }

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantMessageId = (Date.now() + 1).toString();
      let fullContent = "";
      let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("event:")) {
            const eventType = line.substring(6).trim();
            const nextLineIndex = lines.indexOf(line) + 1;
            if (nextLineIndex < lines.length && lines[nextLineIndex].startsWith("data:")) {
              const dataLine = lines[nextLineIndex];
              const data = JSON.parse(dataLine.substring(5).trim());

              switch (eventType) {
                case "content":
                  fullContent += data.delta;
                  setCurrentStreamingMessage(fullContent);
                  break;

                case "tool_use_start":
                  setCurrentToolUse({
                    toolName: data.toolName,
                    toolId: data.toolId,
                    status: "running",
                  });
                  break;

                case "tool_use":
                  const toolUseMessage: Message = {
                    id: `${Date.now()}_tool_use_${data.toolId}`,
                    role: "system",
                    content: formatToolUse(data.toolName, data.input),
                    timestamp: new Date(),
                    type: "tool_use",
                    toolName: data.toolName,
                    toolInput: data.input,
                  };
                  setMessages((prev) => [...prev, toolUseMessage]);
                  break;

                case "tool_result":
                  setCurrentToolUse(null);

                  const toolResultMessage: Message = {
                    id: `${Date.now()}_tool_result_${data.toolId}`,
                    role: "system",
                    content: formatToolResult(data.toolName, data.output),
                    timestamp: new Date(),
                    type: "tool_result",
                    toolName: data.toolName,
                    toolOutput: data.output,
                  };
                  setMessages((prev) => [...prev, toolResultMessage]);

                  // Handle side effects
                  if (data.toolName === "write_file" && data.output.success) {
                    onFileModified?.(data.output.path);
                  }

                  if (data.toolName === "run_tests" && data.output.success) {
                    onTestResultsUpdated?.(data.output);
                  }

                  if (data.toolName === "suggest_next_question" && data.output.success) {
                    onSuggestNextQuestion?.({
                      reason: data.output.reason,
                      performance: data.output.performance,
                    });
                  }
                  break;

                case "tool_error":
                  setCurrentToolUse(null);

                  const toolErrorMessage: Message = {
                    id: `${Date.now()}_tool_error`,
                    role: "system",
                    content: `❌ Error: ${data.error}`,
                    timestamp: new Date(),
                    type: "tool_error",
                    toolName: data.toolName,
                  };
                  setMessages((prev) => [...prev, toolErrorMessage]);
                  break;

                case "usage":
                  tokenUsage = {
                    inputTokens: data.inputTokens,
                    outputTokens: data.outputTokens,
                  };
                  break;

                case "done":
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
                  setIsConnected(true);

                  // Add to conversation history
                  conversationHistory.current.push({
                    role: "assistant",
                    content: fullContent,
                  });
                  break;

                case "error":
                  setError(data.error || "An error occurred");
                  setIsLoading(false);
                  setIsConnected(false);
                  setCurrentStreamingMessage("");
                  break;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setError("Failed to send message. Please try again.");
      setIsLoading(false);
      setIsConnected(false);
      setCurrentStreamingMessage("");
    }
  };

  // No cleanup needed for fetch-based streaming

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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-text-tertiary bg-primary/10 px-2 py-1 rounded">
              <Wrench className="h-3 w-3" />
              <span>Tools</span>
            </div>
            {isReconnecting ? (
              <div className="flex items-center gap-1 text-xs bg-warning/10 text-warning px-2 py-1 rounded">
                <Wifi className="h-3 w-3 animate-pulse" />
                <span>Reconnecting...</span>
              </div>
            ) : isConnected ? (
              <Wifi className="h-4 w-4 text-success" />
            ) : (
              <WifiOff className="h-4 w-4 text-error" />
            )}
          </div>
        </div>
        <p className="text-xs text-text-tertiary mt-1">
          AI can read files, write code, run tests, execute commands, and suggest next steps
        </p>
        {error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-error bg-error/10 p-2 rounded">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        role="log"
        aria-live="polite"
        aria-label="AI conversation messages"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-sm">
              <Bot className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary mb-2">Start a conversation with Claude</p>
              <p className="text-sm text-text-tertiary">
                Try: "Read solution.js and fix any bugs" or "Run the tests and show results"
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div key={message.id}>
                {message.type === "tool_use" || message.type === "tool_result" || message.type === "tool_error" ? (
                  <div className="flex items-start gap-2 my-2">
                    <div className="flex-shrink-0 mt-1">
                      {message.type === "tool_use" && (
                        <Wrench className="h-4 w-4 text-primary animate-pulse" />
                      )}
                      {message.type === "tool_result" && (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      )}
                      {message.type === "tool_error" && (
                        <XCircle className="h-4 w-4 text-error" />
                      )}
                    </div>
                    <div className="flex-1 text-sm bg-background-tertiary border border-border rounded p-2">
                      <pre className="whitespace-pre-wrap font-mono text-xs text-text-secondary">
                        {message.content}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div
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
                            aria-label={copiedId === message.id ? "Message copied" : "Copy message to clipboard"}
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
                            <div className="text-xs text-text-muted" aria-label={`Token usage: ${message.tokenUsage.inputTokens + message.tokenUsage.outputTokens} tokens`}>
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
                )}
              </div>
            ))}

            {/* Current tool use indicator */}
            {currentToolUse && (
              <div className="flex items-start gap-2 my-2">
                <div className="flex-shrink-0 mt-1">
                  <Wrench className="h-4 w-4 text-primary animate-spin" />
                </div>
                <div className="flex-1 text-sm bg-primary/10 border border-primary/20 rounded p-2">
                  <span className="text-text-primary font-medium">
                    Executing: {currentToolUse.toolName}
                  </span>
                </div>
              </div>
            )}

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

            {/* Loading indicator */}
            {isLoading && !currentStreamingMessage && !currentToolUse && (
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
            aria-label="Message input for AI assistant"
            aria-describedby="input-help-text"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="self-end"
            aria-label="Send message to AI assistant"
            aria-busy={isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p id="input-help-text" className="text-xs text-text-tertiary mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
});

/**
 * Format tool use for display
 */
function formatToolUse(toolName: string, input: any): string {
  const inputStr = JSON.stringify(input, null, 2);
  return `🔧 ${toolName}(${inputStr})`;
}

/**
 * Format tool result for display
 */
function formatToolResult(toolName: string, output: any): string {
  if (output.success === false) {
    return `❌ ${toolName} failed: ${output.error}`;
  }

  switch (toolName) {
    case "read_file":
      return `✅ Read ${output.path} (${output.content?.length || 0} bytes)`;

    case "write_file":
      return `✅ Wrote ${output.path} (${output.bytesWritten || 0} bytes)`;

    case "run_tests":
      return `✅ Tests: ${output.passed}/${output.total} passed`;

    case "execute_bash":
      return `✅ Command executed (exit code: ${output.exitCode || 0})`;

    case "suggest_next_question":
      return `🎉 ${output.performance}\n${output.reason}\n${output.suggestion}`;

    default:
      return `✅ ${toolName} completed`;
  }
}

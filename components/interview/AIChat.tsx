"use client";

import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Send, Bot, User, Copy, Check, AlertCircle, Wifi, WifiOff, Wrench, CheckCircle2, XCircle, RefreshCw, Loader2, MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AgentQuestion } from "@/components/interview/AgentQuestion";
import {
  useChatMessageQueue,
  type RecoveryState,
  initialRecoveryState,
} from "@/hooks/useChatMessageQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

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
  questionId?: string;
  className?: string;
  onFileModified?: (path: string) => void;
  onTestResultsUpdated?: (results: any) => void;
  onSuggestNextQuestion?: (suggestion: {
    reason: string;
    performance: string;
  }) => void;
  /** Called when agent starts/stops working (for gating completion UI) */
  onAgentStateChange?: (isWorking: boolean) => void;
}

export const AIChat = forwardRef<AIChatHandle, AIChatProps>(function AIChat({
  sessionId,
  questionId,
  className,
  onFileModified,
  onTestResultsUpdated,
  onSuggestNextQuestion,
  onAgentStateChange,
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
  // State for agent clarification questions (question-first approach)
  const [pendingQuestion, setPendingQuestion] = useState<{
    questionId: string;
    questionText: string;
    options: string[];
    allowCustomAnswer: boolean;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationHistory = useRef<any[]>([]);
  const messageIdCounter = useRef(0);

  // Recovery state
  const [recoveryState, setRecoveryState] = useState<RecoveryState>(initialRecoveryState);
  const currentMessageIdRef = useRef<string | null>(null);

  // Message queue for recovery
  const {
    enqueue,
    markSending,
    markComplete,
    markFailed,
    getPendingMessages,
    hasQueuedMessages,
  } = useChatMessageQueue({ candidateId: sessionId });

  // Online status for reconnection handling
  const { isOnline, wasOffline, resetWasOffline } = useOnlineStatus();

  const generateMessageId = (prefix: string) => {
    messageIdCounter.current += 1;
    return `${Date.now()}_${prefix}_${messageIdCounter.current}`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Reset conversation (called when moving to next question)
  const resetConversation = () => {
    setMessages([{
      id: generateMessageId("system"),
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
          const jsonResponse = await response.json();
          // Handle both wrapped { success, data: { messages } } and direct { messages } formats
          const data = jsonResponse.data ?? jsonResponse;

          // Expand messages with tool metadata into tool_use messages
          const expandedMessages: Message[] = [];
          for (const msg of (data.messages || [])) {
            // For assistant messages with tool metadata, insert tool blocks before the text
            // Handle both formats:
            // - toolBlocks: [{id, name, input}, ...] (detailed format)
            // - toolsUsed: ["list_files", "Read", ...] (simple format from streaming route)
            if (msg.role === "assistant" && msg.metadata) {
              // Detailed format with toolBlocks (includes input AND output)
              if (msg.metadata.toolBlocks?.length > 0) {
                for (const tool of msg.metadata.toolBlocks) {
                  // Use formatToolResult to show rich details like file paths and bytes
                  expandedMessages.push({
                    id: `${msg.id}_tool_${tool.id}`,
                    role: "system",
                    content: formatToolResultFromHistory(tool.name, tool.input, tool.output, tool.isError),
                    timestamp: new Date(msg.timestamp),
                    type: tool.isError ? "tool_error" : "tool_result",
                    toolName: tool.name,
                    toolInput: tool.input,
                    toolOutput: tool.output,
                  });
                }
              }
              // Simple format with just tool names (from streaming route)
              else if (msg.metadata.toolsUsed?.length > 0) {
                for (let i = 0; i < msg.metadata.toolsUsed.length; i++) {
                  const toolName = msg.metadata.toolsUsed[i];
                  expandedMessages.push({
                    id: `${msg.id}_tool_${i}`,
                    role: "system",
                    content: `✅ ${toolName} completed`,
                    timestamp: new Date(msg.timestamp),
                    type: "tool_result",
                    toolName: toolName,
                  });
                }
              }
            }
            // Add the original message (text content)
            expandedMessages.push({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: new Date(msg.timestamp),
              tokenUsage: msg.tokenUsage,
            });
          }

          setMessages(expandedMessages);

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

  // Check for active checkpoint on mount (recovery scenario)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const checkRecovery = async () => {
      try {
        const response = await fetch(`/api/interview/${sessionId}/chat/checkpoint`);
        if (!response.ok) return;

        const result = await response.json();
        const checkpoint = result.data?.checkpoint || result.checkpoint;

        if (checkpoint?.status === 'streaming') {
          console.log('[AIChat] Found active checkpoint, initiating recovery');
          setRecoveryState({
            isRecovering: true,
            partialResponse: checkpoint.partialResponse,
            userMessage: checkpoint.userMessage,
            checkpoint,
          });

          // Show partial response while recovering
          if (checkpoint.partialResponse) {
            setCurrentStreamingMessage(checkpoint.partialResponse);
          }

          // Auto-retry after a brief delay
          setTimeout(() => {
            sendMessageInternal(checkpoint.userMessage, true);
          }, 1500);
        }
      } catch (err) {
        console.error('[AIChat] Recovery check failed:', err);
      }
    };

    checkRecovery();
  }, [sessionId]);

  // Handle online/offline transitions
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isOnline && wasOffline) {
      console.log('[AIChat] Back online, checking for pending messages');
      resetWasOffline();

      // Process any queued messages
      const pendingMessages = getPendingMessages();
      if (pendingMessages.length > 0) {
        console.log(`[AIChat] Retrying ${pendingMessages.length} pending messages`);
        const nextMessage = pendingMessages[0];
        sendMessageInternal(nextMessage.message, false, nextMessage.id);
      }
    }
  }, [isOnline, wasOffline, resetWasOffline, getPendingMessages]);

  /**
   * Internal message sending function used by both normal sends and recovery
   */
  const sendMessageInternal = async (
    messageContent: string,
    isRecovery: boolean = false,
    queuedMessageId?: string
  ) => {
    if (!messageContent.trim() || isLoading) return;

    // Create or use existing queued message ID
    const msgId = queuedMessageId || enqueue(messageContent, sessionId, questionId || '');
    currentMessageIdRef.current = msgId;
    markSending(msgId);

    // Add user message to UI (skip if recovering - message already shown)
    if (!isRecovery) {
      const userMessage: Message = {
        id: generateMessageId("user"),
        role: "user",
        content: messageContent.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      conversationHistory.current.push({
        role: "user",
        content: userMessage.content,
      });
    }

    setInput("");
    setIsLoading(true);
    setError(null);
    if (!isRecovery) {
      setCurrentStreamingMessage("");
    }
    setCurrentToolUse(null);

    try {
      const response = await fetch(`/api/interview/${sessionId}/chat/agent/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify({
          message: messageContent,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to connect to AI");
      }

      // Handle SSE Streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantMessageId = generateMessageId("assistant");
      let fullHistoryContent = "";
      let pendingContent = isRecovery ? currentStreamingMessage : "";
      let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;
      let buffer = "";
      let currentEventType = "";
      let serverMessageId: string | null = null;

      // Clear recovery state once stream starts
      if (isRecovery) {
        setRecoveryState(initialRecoveryState);
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEventType = line.substring(6).trim();
          } else if (line.startsWith("data:") && currentEventType) {
            try {
              const data = JSON.parse(line.substring(5).trim());

              switch (currentEventType) {
                case "stream_start":
                  // Track server-assigned message ID for queue management
                  serverMessageId = data.messageId;
                  console.log(`[AIChat] Stream started with messageId: ${serverMessageId}`);
                  break;

                case "content":
                  fullHistoryContent += data.delta;
                  pendingContent += data.delta;
                  setCurrentStreamingMessage(pendingContent);
                  break;

                case "tool_use_start":
                  if (pendingContent.trim()) {
                    const preToolMessage: Message = {
                      id: generateMessageId("assistant_pre_tool"),
                      role: "assistant",
                      content: pendingContent,
                      timestamp: new Date(),
                    };
                    setMessages((prev) => [...prev, preToolMessage]);
                    pendingContent = "";
                    setCurrentStreamingMessage("");
                  }

                  setCurrentToolUse({
                    toolName: data.toolName,
                    toolId: data.toolId,
                    status: "running",
                  });
                  break;

                case "tool_result":
                  setCurrentToolUse(null);

                  const toolResultMessage: Message = {
                    id: generateMessageId(`tool_result_${data.toolId || "unknown"}`),
                    role: "system",
                    content: formatToolResult(data.toolName, data.output, data.input),
                    timestamp: new Date(),
                    type: data.isError ? "tool_error" : "tool_result",
                    toolName: data.toolName,
                    toolInput: data.input,
                    toolOutput: data.output,
                  };
                  setMessages((prev) => [...prev, toolResultMessage]);

                  // Handle side effects
                  const toolNameLower = data.toolName?.toLowerCase() || "";
                  if ((toolNameLower === "write" || toolNameLower === "write_file" ||
                       toolNameLower === "edit" || toolNameLower === "edit_file") && !data.isError) {
                    const filePath = data.output?.path;
                    if (filePath) {
                      onFileModified?.(filePath);
                    }
                  }

                  if (data.toolName === "run_tests" && !data.isError) {
                    onTestResultsUpdated?.(data.output);
                  }

                  if (data.toolName === "suggest_next_question" && !data.isError) {
                    onSuggestNextQuestion?.({
                      reason: data.output.reason,
                      performance: data.output.performance,
                    });
                  }

                  // Handle ask_question tool - render interactive question UI
                  if (data.toolName === "ask_question" && !data.isError && data.input) {
                    setPendingQuestion({
                      questionId: data.output?.questionId || `q_${Date.now()}`,
                      questionText: data.input.question_text,
                      options: data.input.options || [],
                      allowCustomAnswer: data.input.allow_custom_answer !== false,
                    });
                  }
                  break;

                case "iteration":
                  console.log(`[AIChat] Agent iteration ${data.iteration}`);
                  break;

                case "usage":
                  tokenUsage = {
                    inputTokens: data.inputTokens,
                    outputTokens: data.outputTokens,
                  };
                  break;

                case "done":
                  if (pendingContent.trim()) {
                    const assistantMessage: Message = {
                      id: assistantMessageId,
                      role: "assistant",
                      content: pendingContent,
                      timestamp: new Date(),
                      tokenUsage,
                    };
                    setMessages((prev) => [...prev, assistantMessage]);
                  }
                  setCurrentStreamingMessage("");
                  setIsLoading(false);
                  setIsConnected(true);

                  // Mark message as complete in queue
                  markComplete(msgId);
                  currentMessageIdRef.current = null;

                  // Clear checkpoint on server
                  fetch(`/api/interview/${sessionId}/chat/checkpoint`, { method: 'DELETE' })
                    .catch(err => console.error('[AIChat] Failed to clear checkpoint:', err));

                  if (fullHistoryContent) {
                    conversationHistory.current.push({
                      role: "assistant",
                      content: fullHistoryContent,
                    });
                  }
                  break;

                case "error":
                  setError(data.error || "An error occurred");
                  setIsLoading(false);
                  setIsConnected(false);
                  setCurrentStreamingMessage("");

                  // Mark message as failed for potential retry
                  markFailed(msgId);
                  currentMessageIdRef.current = null;

                  if (data.retryable) {
                    setIsReconnecting(true);
                    setTimeout(() => setIsReconnecting(false), 3000);
                  }
                  break;
              }
              currentEventType = "";
            } catch (parseErr) {
              console.error("[AIChat] Failed to parse SSE data:", parseErr);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to send message:", err);

      // Mark as failed for retry
      markFailed(msgId);
      currentMessageIdRef.current = null;

      const errorMessage = err?.message || String(err);
      const isOverloaded = errorMessage.includes('overloaded') ||
        errorMessage.includes('Overloaded') ||
        errorMessage.includes('503');

      if (isOverloaded) {
        setError("InterviewLM AI is experiencing high demand. The system will automatically retry. Please wait a moment...");
      } else {
        setError("Failed to send message. Please try again.");
      }

      setIsLoading(false);
      setIsConnected(false);
      setCurrentStreamingMessage("");
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    sendMessageInternal(input.trim());
  };

  // Retry a failed message from the queue
  const handleRetry = () => {
    const pendingMessages = getPendingMessages();
    if (pendingMessages.length > 0) {
      const nextMessage = pendingMessages[0];
      sendMessageInternal(nextMessage.message, false, nextMessage.id);
    }
  };

  // Handle answer to agent clarification question
  const handleQuestionAnswer = async (answer: { selectedOption?: string; customAnswer?: string }) => {
    if (!pendingQuestion) return;

    const questionId = pendingQuestion.questionId;
    const responseText = answer.selectedOption || answer.customAnswer || "";

    // Record the answer to the database
    try {
      await fetch(`/api/interview/${sessionId}/chat/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId,
          selectedOption: answer.selectedOption,
          customAnswer: answer.customAnswer,
        }),
      });
    } catch (err) {
      console.error("[AIChat] Failed to record question answer:", err);
    }

    // Clear the pending question
    setPendingQuestion(null);

    // Send the answer as a message to continue the conversation
    sendMessageInternal(responseText);
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
            <h3 className="font-semibold text-text-primary">InterviewLM AI</h3>
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
            {hasQueuedMessages() && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetry}
                disabled={isLoading}
                className="ml-auto text-xs h-6 px-2"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}
          </div>
        )}
        {recoveryState.isRecovering && (
          <div className="mt-2 flex items-center gap-2 text-xs text-info bg-info/10 p-2 rounded">
            <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" />
            <span>Resuming interrupted conversation...</span>
          </div>
        )}
        {!isOnline && (
          <div className="mt-2 flex items-center gap-2 text-xs text-warning bg-warning/10 p-2 rounded">
            <WifiOff className="h-3 w-3 flex-shrink-0" />
            <span>You're offline. Messages will be queued and sent when you reconnect.</span>
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
              <p className="text-text-secondary mb-2">Start a conversation with InterviewLM AI</p>
              <p className="text-sm text-text-tertiary">
                Try: "Read solution.js and fix any bugs" or "Run the tests and show results"
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div key={message.id}>
                {/* Skip tool_use messages - only show results and errors */}
                {message.type === "tool_use" ? null : message.type === "tool_result" || message.type === "tool_error" ? (
                  <div className="flex items-start gap-2 my-2">
                    <div className="flex-shrink-0 mt-1">
                      {message.type === "tool_result" && (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      )}
                      {message.type === "tool_error" && (
                        <XCircle className="h-4 w-4 text-error" />
                      )}
                    </div>
                    <div className="flex-1 text-sm bg-background-tertiary border border-border rounded p-2">
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-text-secondary">
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
                          ? "bg-primary text-white selection:bg-white/30 selection:text-white"
                          : "bg-background-tertiary border border-border"
                      )}
                    >
                      <div className="prose prose-invert prose-sm max-w-none">
                        <pre className="whitespace-pre-wrap break-words font-sans text-sm">
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
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                      {currentStreamingMessage}
                      <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Agent clarification question (question-first approach) */}
            {pendingQuestion && (
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <div className="max-w-[85%]">
                  <AgentQuestion
                    questionId={pendingQuestion.questionId}
                    questionText={pendingQuestion.questionText}
                    options={pendingQuestion.options}
                    allowCustomAnswer={pendingQuestion.allowCustomAnswer}
                    onAnswer={handleQuestionAnswer}
                    disabled={isLoading}
                  />
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
            placeholder="Ask AI for help..."
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
 * Format tool result for display
 * Uses input as fallback when output fields are missing
 */
function formatToolResult(toolName: string, output: any, input?: any): string {
  if (output?.success === false || output?.error) {
    return `❌ ${toolName} failed: ${output.error || 'Unknown error'}`;
  }

  // Helper to get path from output or input
  const getPath = () => {
    return output?.path || input?.path || input?.file_path || '(file)';
  };

  // Helper to get bytes/size
  const getBytes = () => {
    if (output?.bytesWritten !== undefined) return output.bytesWritten;
    if (output?.bytes_written !== undefined) return output.bytes_written;
    // Fallback: estimate from input content
    if (input?.content) {
      return typeof input.content === 'string' ? input.content.length : 0;
    }
    return 0;
  };

  switch (toolName) {
    case "Read":
    case "read_file":
      return `✅ Read ${getPath()} (${output?.content?.length || output?.totalSize || 0} chars)`;

    case "Write":
    case "write_file":
      // Support both camelCase (TypeScript) and snake_case (Python) formats
      return `✅ Wrote ${getPath()} (${getBytes()} bytes)`;

    case "Edit":
    case "edit_file":
      return `✅ Edited ${getPath()} (${output?.replacements || 1} replacement${(output?.replacements || 1) !== 1 ? 's' : ''})`;

    case "run_tests":
      return `✅ Tests: ${output?.passed || 0}/${output?.total || 0} passed`;

    case "Bash":
    case "run_bash":
    case "execute_bash":
      const exitInfo = output?.exitCode !== undefined ? ` (exit: ${output.exitCode})` : '';
      const cmdPreview = input?.command ? `: ${input.command.slice(0, 50)}${input.command.length > 50 ? '...' : ''}` : '';
      const stdoutPreview = output?.stdout?.slice(0, 100) || '';
      return `✅ Command executed${cmdPreview}${exitInfo}${stdoutPreview ? `\n${stdoutPreview}${output?.stdout?.length > 100 ? '...' : ''}` : ''}`;

    case "Grep":
    case "grep_files":
      return `✅ Found ${output?.matches?.length || output?.count || 0} matches`;

    case "Glob":
    case "glob_files":
      return `✅ Found ${output?.files?.length || output?.count || 0} files`;

    case "list_files":
      return `✅ Listed ${output?.count || output?.files?.length || 0} items in ${output?.path || input?.path || '/workspace'}`;

    case "suggest_next_question":
      return `🎉 ${output?.performance || ''}\n${output?.reason || ''}\n${output?.suggestion || ''}`;

    case "install_packages":
      const pkgs = input?.packages?.join(', ') || output?.packages?.join(', ') || '';
      return `✅ Installed packages${pkgs ? `: ${pkgs}` : ''}`;

    case "get_environment_info":
      return `✅ Environment info retrieved`;

    default:
      return `✅ ${toolName} completed`;
  }
}

/**
 * Format tool result from history (database)
 * Uses both input and output to show rich details like file paths
 */
function formatToolResultFromHistory(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
  isError: boolean
): string {
  const out = output as Record<string, any> | undefined;

  // Handle errors
  if (isError || out?.success === false || out?.error) {
    return `❌ ${toolName} failed: ${out?.error || 'Unknown error'}`;
  }

  switch (toolName) {
    case "Read":
    case "read_file": {
      const path = out?.path || input?.file_path || input?.path || '?';
      const size = out?.content?.length || out?.totalSize || '?';
      return `✅ Read ${path} (${size} chars)`;
    }

    case "Write":
    case "write_file": {
      const path = out?.path || input?.file_path || input?.path || '?';
      const bytes = out?.bytesWritten || (input?.content as string)?.length || '?';
      return `✅ Wrote ${path} (${bytes} bytes)`;
    }

    case "Edit":
    case "edit_file": {
      const path = out?.path || input?.file_path || input?.path || '?';
      const replacements = out?.replacements || 1;
      return `✅ Edited ${path} (${replacements} replacement${replacements !== 1 ? 's' : ''})`;
    }

    case "Bash":
    case "execute_bash": {
      const cmd = String(input?.command || '').slice(0, 60);
      const exitCode = out?.exitCode;
      const exitInfo = exitCode !== undefined ? ` (exit: ${exitCode})` : '';
      return `✅ Ran: ${cmd}${cmd.length >= 60 ? '...' : ''}${exitInfo}`;
    }

    case "Grep": {
      const pattern = input?.pattern || '?';
      const matchCount = out?.matches?.length || 0;
      return `✅ Searched for "${pattern}" - ${matchCount} matches`;
    }

    case "Glob": {
      const pattern = input?.pattern || '?';
      const fileCount = out?.files?.length || 0;
      return `✅ Found ${fileCount} files matching "${pattern}"`;
    }

    case "list_files": {
      const path = out?.path || input?.path || '/workspace';
      const count = out?.count || out?.files?.length || 0;
      return `✅ Listed ${count} items in ${path}`;
    }

    case "run_tests": {
      const passed = out?.passed || 0;
      const total = out?.total || 0;
      return `✅ Tests: ${passed}/${total} passed`;
    }

    case "suggest_next_question": {
      return `🎉 ${out?.performance || ''}\n${out?.reason || ''}\n${out?.suggestion || ''}`;
    }

    default:
      return `✅ ${toolName} completed`;
  }
}

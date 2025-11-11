"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { FileTree, FileNode } from "@/components/interview/FileTree";
import { AIChat, Message } from "@/components/interview/AIChat";
import { useInterviewKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsPanel, defaultInterviewShortcuts } from "@/components/interview/KeyboardShortcutsPanel";

// Dynamic import for Terminal (xterm.js requires client-side only)
const Terminal = dynamic(
  () => import("@/components/interview/Terminal").then((mod) => mod.Terminal),
  { ssr: false }
);
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
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

// Session initialization data interface
interface SessionData {
  sessionId: string;
  candidateId: string;
  question: {
    id: string;
    title: string;
    description: string;
    difficulty: string;
    language: string;
    starterCode: string;
    testCases: Array<{
      name: string;
      input: string;
      expectedOutput: string;
      hidden: boolean;
    }>;
  };
  sandbox: {
    volumeId: string;
    workspaceDir: string;
    status: string;
  };
  files: FileNode[];
  timeLimit: number;
  timeRemaining: number;
  startedAt: string;
}

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const candidateId = params.id as string;

  // Session state
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // UI state
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [code, setCode] = useState("");
  const [isAIChatOpen, setIsAIChatOpen] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [testResults, setTestResults] = useState({ passed: 0, total: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize session on mount
  useEffect(() => {
    const initializeSession = async () => {
      try {
        setIsInitializing(true);
        setInitError(null);

        const response = await fetch(`/api/interview/${candidateId}/initialize`, {
          method: "POST",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to initialize session");
        }

        const data: SessionData = await response.json();
        setSessionData(data);
        setTimeRemaining(data.timeRemaining);

        // Set default selected file and load its content
        if (data.files.length > 0) {
          const mainFile = data.files.find(
            (f) => f.name.includes("solution") || f.name.includes("index")
          ) || data.files[0];
          setSelectedFile(mainFile);

          // Load initial file content
          try {
            const fileResponse = await fetch(
              `/api/interview/${candidateId}/files?path=${encodeURIComponent(mainFile.path)}`
            );
            if (fileResponse.ok) {
              const fileData = await fileResponse.json();
              setCode(fileData.content || data.question.starterCode);
            } else {
              setCode(data.question.starterCode);
            }
          } catch {
            setCode(data.question.starterCode);
          }
        } else {
          setCode(data.question.starterCode);
        }
      } catch (err) {
        console.error("Session initialization error:", err);
        setInitError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsInitializing(false);
      }
    };

    initializeSession();
  }, [candidateId]);

  // Timer countdown
  useEffect(() => {
    if (!sessionData || timeRemaining <= 0) return;

    const intervalId = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up - auto-submit
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [sessionData, timeRemaining]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Confirmation before leaving page
  useEffect(() => {
    if (!sessionData || isSubmitting) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have an interview in progress. Are you sure you want to leave?';
      return 'You have an interview in progress. Are you sure you want to leave?';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionData, isSubmitting]);

  // Manual save handler (for Ctrl+S)
  const handleManualSave = useCallback(async () => {
    if (!sessionData || !selectedFile) return;

    try {
      await fetch(`/api/interview/${candidateId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedFile.path,
          content: code,
          language: sessionData.question.language,
        }),
      });

      // Show brief saved indicator
      console.log('File saved successfully');
      // TODO: Add toast notification
    } catch (err) {
      console.error("Failed to save file:", err);
      // TODO: Show error toast
    }
  }, [sessionData, selectedFile, candidateId, code]);

  // Keyboard shortcuts
  useInterviewKeyboardShortcuts({
    onSave: handleManualSave,
    onRunTests: handleRunTests,
    onToggleAIChat: () => setIsAIChatOpen((prev) => !prev),
    onSubmit: handleSubmit,
  });

  // Loading state
  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Spinner className="mx-auto mb-4" />
          <p className="text-text-secondary">Initializing interview session...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (initError || !sessionData) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Failed to Initialize Interview
          </h2>
          <p className="text-text-secondary mb-4">
            {initError || "Unknown error occurred"}
          </p>
          <Button onClick={() => router.push("/dashboard")}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!sessionData || isSubmitting) return;

    // Confirm submission
    const confirmSubmit = window.confirm(
      "Are you sure you want to submit your assessment? This action cannot be undone."
    );

    if (!confirmSubmit) return;

    try {
      setIsSubmitting(true);

      // Submit assessment
      const response = await fetch(`/api/interview/${candidateId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalCode: {
            [`solution.${sessionData.question.language === "python" ? "py" : "js"}`]: code,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Submission failed");
      }

      const result = await response.json();

      // Show success message
      alert(
        `Assessment submitted successfully!\n\n` +
        `Overall Score: ${result.overallScore?.toFixed(1) || "N/A"}/100\n` +
        `Tests Passed: ${result.testsPassed || 0}/${result.totalTests || 0}\n\n` +
        `Recommendation: ${result.recommendation?.decision || "Pending"}`
      );

      // Redirect to dashboard or thank you page
      router.push("/dashboard");
    } catch (err) {
      console.error("Submission error:", err);
      alert(`Failed to submit assessment: ${err instanceof Error ? err.message : "Unknown error"}`);
      setIsSubmitting(false);
    }
  };

  // Format time remaining
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleFileSelect = async (file: FileNode) => {
    if (file.type === "file") {
      setSelectedFile(file);

      // Load file content from Modal volume
      try {
        const response = await fetch(
          `/api/interview/${candidateId}/files?path=${encodeURIComponent(file.path)}`
        );

        if (response.ok) {
          const data = await response.json();
          setCode(data.content || "");
        } else {
          // Fallback to starter code if file read fails
          console.error("Failed to load file content");
          setCode(sessionData?.question.starterCode || "");
        }
      } catch (err) {
        console.error("Error loading file:", err);
        // Fallback to starter code
        setCode(sessionData?.question.starterCode || "");
      }
    }
  };

  const handleCodeChange = useCallback((newCode: string) => {
    // Update local state immediately (optimistic update)
    setCode(newCode);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce API call (2 seconds)
    debounceTimerRef.current = setTimeout(async () => {
      if (sessionData && selectedFile) {
        try {
          await fetch(`/api/interview/${candidateId}/files`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: selectedFile.path,
              content: newCode,
              language: sessionData.question.language,
            }),
          });
        } catch (err) {
          console.error("Failed to sync file:", err);
        }
      }
    }, 2000); // 2 second debounce
  }, [sessionData, selectedFile, candidateId]);

  const handleRunTests = async () => {
    if (!sessionData) return;

    try {
      const response = await fetch(`/api/interview/${candidateId}/run-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language: sessionData.question.language,
          testCases: sessionData.question.testCases,
          fileName: selectedFile?.name,
        }),
      });

      if (response.ok) {
        const results = await response.json();
        setTestResults({
          passed: results.passed,
          total: results.total,
        });
      }
    } catch (err) {
      console.error("Failed to run tests:", err);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                {sessionData.question.title}
              </h1>
              <p className="text-sm text-text-secondary">
                {sessionData.question.difficulty} • {sessionData.question.language}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Time Remaining */}
            <div className="flex items-center gap-2">
              <Clock className={`h-4 w-4 ${timeRemaining < 300 ? "text-error" : "text-warning"}`} />
              <span className={`text-sm font-mono ${timeRemaining < 300 ? "text-error" : "text-text-primary"}`}>
                {formatTime(timeRemaining)}
              </span>
            </div>

            {/* Test Status */}
            {testResults.total > 0 && (
              <Badge variant={testResults.passed === testResults.total ? "success" : "default"} className="gap-1">
                {testResults.passed === testResults.total ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {testResults.passed}/{testResults.total} tests passing
              </Badge>
            )}

            {/* Actions */}
            <Button size="sm" variant="outline" onClick={handleRunTests}>
              <Play className="h-4 w-4 mr-2" />
              Run Tests
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={handleSubmit}
              disabled={isSubmitting || timeRemaining === 0}
              loading={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit Assessment"}
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
                sessionId={sessionData.sessionId}
                files={sessionData.files}
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
                      sessionId={sessionData.sessionId}
                      questionId={sessionData.question.id}
                      value={code}
                      onChange={handleCodeChange}
                      language={sessionData.question.language as any}
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
                    <Terminal sessionId={sessionData.sessionId} />
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
                    sessionId={sessionData.sessionId}
                    onFileModified={async (path) => {
                      // Reload file content when AI modifies it
                      if (selectedFile && selectedFile.path === path) {
                        try {
                          const response = await fetch(
                            `/api/interview/${candidateId}/files?path=${encodeURIComponent(path)}`
                          );
                          if (response.ok) {
                            const data = await response.json();
                            setCode(data.content || "");
                          }
                        } catch (err) {
                          console.error("Failed to reload file:", err);
                        }
                      }
                    }}
                    onTestResultsUpdated={(results) => {
                      // Update test results display
                      setTestResults({
                        passed: results.passed || 0,
                        total: results.total || 0,
                      });
                    }}
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

      {/* Keyboard Shortcuts Panel */}
      <KeyboardShortcutsPanel shortcuts={defaultInterviewShortcuts} showOnFirstVisit={true} />
    </div>
  );
}

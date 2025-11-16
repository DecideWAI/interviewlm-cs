"use client";

import React, { useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { go } from "@codemirror/lang-go";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { Button } from "@/components/ui/button";
import { Play, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEventBatcher } from "@/lib/eventBatcher";

interface TestResult {
  passed: number;
  failed: number;
  total: number;
  output: string;
  error?: string;
}

interface CodeEditorProps {
  sessionId?: string;
  questionId?: string;
  value: string;
  onChange: (value: string) => void;
  language?: "javascript" | "typescript" | "python" | "go";
  fileName?: string;
  readOnly?: boolean;
  height?: string;
  showTestButton?: boolean;
}

export function CodeEditor({
  sessionId,
  questionId,
  value,
  onChange,
  language = "javascript",
  fileName,
  readOnly = false,
  height = "100%",
  showTestButton = true,
}: CodeEditorProps) {
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSnapshotRef = useRef<string>(value);
  const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize event batcher for efficient API calls
  const { addEvent, flush } = useEventBatcher(sessionId || "");

  // Select language extension
  const getLanguageExtension = (): Extension => {
    switch (language) {
      case "python":
        return python();
      case "go":
        return go();
      case "javascript":
      case "typescript":
      default:
        return javascript({ typescript: language === "typescript", jsx: true });
    }
  };

  const extensions = [
    getLanguageExtension(),
    EditorView.lineWrapping,
  ];

  // Record code change event (debounced)
  const recordCodeChange = (newValue: string) => {
    if (!sessionId) return; // Skip if no sessionId (e.g., in replay mode)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      // Use event batcher instead of direct fetch (90% cost reduction)
      addEvent({
        type: "code_change",
        data: {
          fileName: fileName || "unknown",
          content: newValue,
          language,
        },
      });
    }, 3000);
  };

  // Create periodic snapshots
  useEffect(() => {
    if (!sessionId) return; // Skip if no sessionId (e.g., in replay mode)

    snapshotIntervalRef.current = setInterval(() => {
      if (value !== lastSnapshotRef.current) {
        // Use event batcher for snapshots
        addEvent({
          type: "code_snapshot",
          data: {
            fileName: fileName || "unknown",
            content: value,
            language,
          },
        });

        lastSnapshotRef.current = value;
      }
    }, 30000); // Snapshot every 30 seconds

    return () => {
      if (snapshotIntervalRef.current) {
        clearInterval(snapshotIntervalRef.current);
      }
    };
  }, [sessionId, value, fileName, language, addEvent]);

  // Handle code change
  const handleChange = (newValue: string) => {
    onChange(newValue);
    recordCodeChange(newValue);
  };

  // Run tests
  const runTests = async () => {
    if (!sessionId || !questionId) {
      console.error("Cannot run tests: sessionId or questionId is missing");
      return;
    }

    setIsRunningTests(true);
    setTestResult(null);

    try {
      const response = await fetch(`/api/interview/${sessionId}/run-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          code: value,
          language,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to run tests");
      }

      const result = await response.json();
      setTestResult(result);

      // Record test run event using batcher
      addEvent({
        type: "test_run",
        data: {
          questionId,
          result,
        },
      });

      // Flush events to ensure test results are immediately saved
      await flush();
    } catch (err) {
      console.error("Failed to run tests:", err);
      setTestResult({
        passed: 0,
        failed: 0,
        total: 0,
        output: "",
        error: "Failed to run tests. Please try again.",
      });
    } finally {
      setIsRunningTests(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="h-full w-full flex flex-col bg-[#1e1e1e] overflow-hidden">
      {/* Test Button Header */}
      {showTestButton && (
        <div className="border-b border-border p-2 flex items-center justify-between bg-background">
          <div className="text-xs text-text-tertiary">
            {fileName && <span className="font-mono" aria-label={`Editing file: ${fileName}`}>{fileName}</span>}
          </div>
          <Button
            onClick={runTests}
            disabled={isRunningTests || readOnly}
            size="sm"
            variant="primary"
            className="gap-2"
            aria-label={isRunningTests ? "Running tests..." : "Run tests for current code"}
            aria-busy={isRunningTests}
          >
            {isRunningTests ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Tests
              </>
            )}
          </Button>
        </div>
      )}

      {/* Test Results */}
      {testResult && (
        <div
          className={cn(
            "border-b border-border p-3 text-sm",
            testResult.error || testResult.failed > 0
              ? "bg-error/10 border-error/20"
              : "bg-success/10 border-success/20"
          )}
          role="status"
          aria-live="polite"
          aria-label={`Test results: ${testResult.passed} of ${testResult.total} tests passed`}
        >
          <div className="flex items-center gap-2 mb-2">
            {testResult.error || testResult.failed > 0 ? (
              <>
                <XCircle className="h-4 w-4 text-error" aria-hidden="true" />
                <span className="font-semibold text-error">Tests Failed</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                <span className="font-semibold text-success">All Tests Passed</span>
              </>
            )}
            <span className="text-text-tertiary ml-auto">
              {testResult.passed}/{testResult.total} passed
            </span>
          </div>
          {testResult.error && (
            <div className="text-xs text-error font-mono bg-background/50 p-2 rounded">
              {testResult.error}
            </div>
          )}
          {testResult.output && (
            <details className="mt-2">
              <summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-primary">
                View test output
              </summary>
              <pre className="text-xs font-mono bg-background/50 p-2 rounded mt-2 overflow-auto max-h-32 text-text-secondary">
                {testResult.output}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0 overflow-auto">
          <CodeMirror
            value={value}
            height="auto"
            theme={vscodeDark}
          extensions={extensions}
          onChange={handleChange}
          readOnly={readOnly}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            searchKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
          className="text-sm"
        />
        </div>
      </div>
    </div>
  );
}

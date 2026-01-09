"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { go } from "@codemirror/lang-go";
import { markdown } from "@codemirror/lang-markdown";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { Radio, Eye, Code2 } from "lucide-react";
import { useEventBatcher } from "@/lib/eventBatcher";
import { useCodeStreaming } from "@/hooks/useCodeStreaming";
import { cn } from "@/lib/utils";

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
  // Defensive check: ensure value is always a string
  const safeValue = typeof value === "string" ? value : "";
  if (typeof value !== "string" && value !== undefined && value !== null) {
    console.warn("[CodeEditor] Received non-string value:", typeof value, value);
  }
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSnapshotRef = useRef<string>(value);
  const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isStreamingUpdateRef = useRef(false);

  // Markdown preview state
  const isMarkdownFile = fileName?.endsWith(".md") || fileName?.endsWith(".markdown");
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(true);

  // Initialize event batcher for efficient API calls
  const { addEvent } = useEventBatcher(sessionId || "");

  // Code streaming for real-time AI code generation
  const { isStreaming, currentFile, accumulatedContent } = useCodeStreaming({
    sessionId: sessionId || "",
    enabled: !!sessionId,
    onCodeUpdate: (streamedFileName, delta) => {
      // Only update if it's the current file
      if (streamedFileName === fileName) {
        isStreamingUpdateRef.current = true;
        const currentContent = accumulatedContent.get(streamedFileName) || "";
        onChange(currentContent + delta);
      }
    },
    onStreamComplete: (streamedFileName, fullContent) => {
      // Update with complete content
      if (streamedFileName === fileName) {
        isStreamingUpdateRef.current = true;
        onChange(fullContent);
        setTimeout(() => {
          isStreamingUpdateRef.current = false;
        }, 100);
      }
    },
  });

  // Select language extension
  const getLanguageExtension = (): Extension => {
    // Use markdown extension for .md files
    if (isMarkdownFile) {
      return markdown();
    }

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

    // Skip recording if this is a streaming update
    if (isStreamingUpdateRef.current) return;

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
      {/* Editor Header */}
      {showTestButton && (
        <div className="border-b border-border p-2 flex items-center justify-between bg-background">
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            {fileName && <span className="font-mono" aria-label={`Editing file: ${fileName}`}>{fileName}</span>}
            {isStreaming && currentFile === fileName && (
              <div className="flex items-center gap-1 text-primary bg-primary/10 px-2 py-0.5 rounded">
                <Radio className="h-3 w-3 animate-pulse" />
                <span>AI Writing Code...</span>
              </div>
            )}
          </div>
          {/* Markdown preview toggle */}
          {isMarkdownFile && (
            <div className="flex items-center gap-1 bg-background-secondary rounded p-0.5">
              <button
                onClick={() => setShowMarkdownPreview(true)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                  showMarkdownPreview
                    ? "bg-primary text-white"
                    : "text-text-tertiary hover:text-text-secondary"
                )}
              >
                <Eye className="h-3 w-3" />
                Preview
              </button>
              <button
                onClick={() => setShowMarkdownPreview(false)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                  !showMarkdownPreview
                    ? "bg-primary text-white"
                    : "text-text-tertiary hover:text-text-secondary"
                )}
              >
                <Code2 className="h-3 w-3" />
                Edit
              </button>
            </div>
          )}
        </div>
      )}

      {/* Markdown Preview */}
      {isMarkdownFile && showMarkdownPreview ? (
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-background">
          <div className="prose prose-sm prose-invert max-w-none prose-headings:text-text-primary prose-p:text-text-secondary prose-strong:text-text-primary prose-ul:text-text-secondary prose-li:text-text-secondary prose-code:text-primary prose-code:bg-background-tertiary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-background-tertiary">
            <ReactMarkdown>{safeValue}</ReactMarkdown>
          </div>
        </div>
      ) : (
        /* Code Editor */
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 overflow-auto">
            <CodeMirror
              value={safeValue}
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
      )}
    </div>
  );
}

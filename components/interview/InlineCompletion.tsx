"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Inline code completion suggestion
 */
export interface CompletionSuggestion {
  /** Unique ID for this suggestion */
  id: string;
  /** The suggested text to insert */
  text: string;
  /** Start position (line, column) */
  startPosition: { line: number; column: number };
  /** End position for replacement (if replacing existing text) */
  endPosition?: { line: number; column: number };
  /** Source of the suggestion (ai, snippet, etc.) */
  source: "ai" | "snippet" | "history";
  /** Confidence score 0-1 */
  confidence?: number;
  /** Display label */
  label?: string;
}

/**
 * Props for inline completion overlay
 */
interface InlineCompletionOverlayProps {
  /** Current suggestion to display */
  suggestion: CompletionSuggestion | null;
  /** Called when user accepts suggestion (Tab) */
  onAccept: () => void;
  /** Called when user dismisses suggestion (Escape) */
  onDismiss: () => void;
  /** Editor container ref for positioning */
  editorRef: React.RefObject<HTMLElement>;
  /** Current cursor position */
  cursorPosition: { line: number; column: number };
  /** Whether to show keyboard hints */
  showHints?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * InlineCompletionOverlay Component
 *
 * Displays ghost text for AI-suggested code completions inline with the editor.
 * Similar to Copilot/Cursor's inline suggestion display.
 */
export function InlineCompletionOverlay({
  suggestion,
  onAccept,
  onDismiss,
  editorRef,
  cursorPosition,
  showHints = true,
  className,
}: InlineCompletionOverlayProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Calculate position based on cursor
  useEffect(() => {
    if (!suggestion || !editorRef.current) {
      setPosition(null);
      return;
    }

    // Get editor's cursor position element or calculate from line/column
    const editor = editorRef.current;
    const editorRect = editor.getBoundingClientRect();

    // Estimate position based on line height and character width
    // These values should be adjusted based on your editor's font
    const lineHeight = 20; // px
    const charWidth = 8.4; // px for monospace font

    const top = (cursorPosition.line - 1) * lineHeight;
    const left = cursorPosition.column * charWidth;

    setPosition({ top, left });
  }, [suggestion, cursorPosition, editorRef]);

  // Keyboard handler
  useEffect(() => {
    if (!suggestion) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onAccept();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [suggestion, onAccept, onDismiss]);

  if (!suggestion || !position) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute pointer-events-none z-10",
        className
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Ghost text suggestion */}
      <span className="text-text-tertiary/60 font-mono text-sm whitespace-pre">
        {suggestion.text}
      </span>

      {/* Keyboard hint tooltip */}
      {showHints && (
        <div className="absolute -top-6 left-0 flex items-center gap-1 text-[10px] text-text-muted bg-background-tertiary/90 px-1.5 py-0.5 rounded border border-border/50">
          <kbd className="bg-background-hover px-1 rounded text-[9px]">Tab</kbd>
          <span>to accept</span>
        </div>
      )}
    </div>
  );
}

/**
 * Props for the completion panel (multi-line suggestions)
 */
interface CompletionPanelProps {
  /** List of completion suggestions */
  suggestions: CompletionSuggestion[];
  /** Currently selected index */
  selectedIndex: number;
  /** Called when selection changes */
  onSelect: (index: number) => void;
  /** Called when user accepts a suggestion */
  onAccept: (suggestion: CompletionSuggestion) => void;
  /** Called when panel is dismissed */
  onDismiss: () => void;
  /** Position of the panel */
  position: { top: number; left: number };
  /** Additional class names */
  className?: string;
}

/**
 * CompletionPanel Component
 *
 * Dropdown panel showing multiple completion options.
 * Similar to VS Code's autocomplete dropdown.
 */
export function CompletionPanel({
  suggestions,
  selectedIndex,
  onSelect,
  onAccept,
  onDismiss,
  position,
  className,
}: CompletionPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          onSelect(Math.min(selectedIndex + 1, suggestions.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          onSelect(Math.max(selectedIndex - 1, 0));
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (suggestions[selectedIndex]) {
            onAccept(suggestions[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onDismiss();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [suggestions, selectedIndex, onSelect, onAccept, onDismiss]);

  // Scroll selected item into view
  useEffect(() => {
    if (panelRef.current) {
      const selectedEl = panelRef.current.children[selectedIndex] as HTMLElement;
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute z-50 bg-background-secondary border border-border rounded-lg shadow-lg",
        "max-h-64 w-96 overflow-y-auto",
        className
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.id}
          onClick={() => onAccept(suggestion)}
          onMouseEnter={() => onSelect(index)}
          className={cn(
            "w-full text-left px-3 py-2 flex items-start gap-2 transition-colors",
            index === selectedIndex
              ? "bg-primary/20 text-text-primary"
              : "hover:bg-background-hover text-text-secondary"
          )}
        >
          {/* Source indicator */}
          <span
            className={cn(
              "flex-shrink-0 w-4 h-4 rounded text-[10px] flex items-center justify-center font-semibold",
              suggestion.source === "ai"
                ? "bg-primary/20 text-primary"
                : suggestion.source === "snippet"
                ? "bg-info/20 text-info"
                : "bg-background-tertiary text-text-tertiary"
            )}
          >
            {suggestion.source === "ai" ? "AI" : suggestion.source === "snippet" ? "S" : "H"}
          </span>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {suggestion.label && (
              <div className="text-xs font-medium text-text-primary mb-0.5">
                {suggestion.label}
              </div>
            )}
            <pre className="text-xs font-mono text-text-secondary truncate">
              {suggestion.text.split("\n")[0]}
              {suggestion.text.includes("\n") && "..."}
            </pre>
          </div>

          {/* Confidence indicator */}
          {suggestion.confidence !== undefined && (
            <div className="flex-shrink-0">
              <div
                className="h-1 w-8 bg-background-tertiary rounded-full overflow-hidden"
                title={`${Math.round(suggestion.confidence * 100)}% confidence`}
              >
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${suggestion.confidence * 100}%` }}
                />
              </div>
            </div>
          )}
        </button>
      ))}

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-border bg-background-tertiary text-[10px] text-text-muted flex items-center gap-3">
        <span>
          <kbd className="bg-background px-1 rounded">↑</kbd>
          <kbd className="bg-background px-1 rounded ml-0.5">↓</kbd>
          {" "}navigate
        </span>
        <span>
          <kbd className="bg-background px-1 rounded">Tab</kbd>
          {" "}accept
        </span>
        <span>
          <kbd className="bg-background px-1 rounded">Esc</kbd>
          {" "}dismiss
        </span>
      </div>
    </div>
  );
}

/**
 * Hook to manage inline completion state
 */
export interface UseInlineCompletionOptions {
  /** Debounce delay for fetching suggestions (ms) */
  debounceMs?: number;
  /** Minimum characters before triggering */
  minChars?: number;
  /** Fetch suggestions function */
  fetchSuggestions?: (context: CompletionContext) => Promise<CompletionSuggestion[]>;
}

export interface CompletionContext {
  /** Current file path */
  filePath: string;
  /** Current file content */
  content: string;
  /** Cursor position */
  cursor: { line: number; column: number };
  /** Text before cursor on current line */
  prefix: string;
  /** Text after cursor on current line */
  suffix: string;
  /** Language of the file */
  language: string;
}

export interface UseInlineCompletionReturn {
  /** Current suggestion (if any) */
  suggestion: CompletionSuggestion | null;
  /** List of suggestions (for panel) */
  suggestions: CompletionSuggestion[];
  /** Currently selected index */
  selectedIndex: number;
  /** Whether suggestions are loading */
  isLoading: boolean;
  /** Trigger completion fetch */
  triggerCompletion: (context: CompletionContext) => void;
  /** Accept current suggestion */
  acceptSuggestion: () => string | null;
  /** Dismiss current suggestion */
  dismissSuggestion: () => void;
  /** Select a suggestion by index */
  selectSuggestion: (index: number) => void;
  /** Clear all suggestions */
  clearSuggestions: () => void;
}

/**
 * Hook for managing inline code completions
 */
export function useInlineCompletion(
  options: UseInlineCompletionOptions = {}
): UseInlineCompletionReturn {
  const {
    debounceMs = 300,
    minChars = 2,
    fetchSuggestions,
  } = options;

  const [suggestions, setSuggestions] = useState<CompletionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const triggerCompletion = useCallback(
    (context: CompletionContext) => {
      // Cancel previous debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Check minimum characters
      if (context.prefix.trim().length < minChars) {
        setSuggestions([]);
        return;
      }

      // Debounce the fetch
      debounceRef.current = setTimeout(async () => {
        if (!fetchSuggestions) {
          // Use mock suggestions if no fetch function provided
          setSuggestions(generateMockSuggestions(context));
          return;
        }

        setIsLoading(true);
        try {
          const results = await fetchSuggestions(context);
          setSuggestions(results);
          setSelectedIndex(0);
        } catch (error) {
          console.error("[InlineCompletion] Error fetching suggestions:", error);
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      }, debounceMs);
    },
    [fetchSuggestions, debounceMs, minChars]
  );

  const acceptSuggestion = useCallback((): string | null => {
    const suggestion = suggestions[selectedIndex];
    if (!suggestion) return null;

    setSuggestions([]);
    setSelectedIndex(0);

    return suggestion.text;
  }, [suggestions, selectedIndex]);

  const dismissSuggestion = useCallback(() => {
    setSuggestions([]);
    setSelectedIndex(0);
  }, []);

  const selectSuggestion = useCallback((index: number) => {
    setSelectedIndex(Math.max(0, Math.min(index, suggestions.length - 1)));
  }, [suggestions.length]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setSelectedIndex(0);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    suggestion: suggestions[selectedIndex] || null,
    suggestions,
    selectedIndex,
    isLoading,
    triggerCompletion,
    acceptSuggestion,
    dismissSuggestion,
    selectSuggestion,
    clearSuggestions,
  };
}

/**
 * Generate mock suggestions for development/demo
 */
function generateMockSuggestions(context: CompletionContext): CompletionSuggestion[] {
  const { prefix, language } = context;

  // Common patterns based on prefix
  const suggestions: CompletionSuggestion[] = [];

  if (prefix.includes("function") || prefix.includes("def ")) {
    suggestions.push({
      id: `mock_${Date.now()}_1`,
      text: language === "python"
        ? "name(self, arg1, arg2):\n    pass"
        : "(name, arg1, arg2) {\n  return null;\n}",
      startPosition: context.cursor,
      source: "ai",
      confidence: 0.85,
      label: "Function definition",
    });
  }

  if (prefix.includes("if") || prefix.includes("if ")) {
    suggestions.push({
      id: `mock_${Date.now()}_2`,
      text: language === "python"
        ? " condition:\n    pass"
        : " (condition) {\n  \n}",
      startPosition: context.cursor,
      source: "ai",
      confidence: 0.9,
      label: "If statement",
    });
  }

  if (prefix.includes("for")) {
    suggestions.push({
      id: `mock_${Date.now()}_3`,
      text: language === "python"
        ? " item in items:\n    pass"
        : " (let i = 0; i < length; i++) {\n  \n}",
      startPosition: context.cursor,
      source: "ai",
      confidence: 0.88,
      label: "For loop",
    });
  }

  // Add a generic completion
  if (suggestions.length === 0 && prefix.trim().length > 0) {
    suggestions.push({
      id: `mock_${Date.now()}_4`,
      text: "// TODO: implement",
      startPosition: context.cursor,
      source: "snippet",
      confidence: 0.5,
      label: "TODO comment",
    });
  }

  return suggestions;
}

export default InlineCompletionOverlay;

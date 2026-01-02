"use client";

import React, { useState, useMemo } from "react";
import {
  Check,
  X,
  ChevronDown,
  ChevronRight,
  FileCode,
  Plus,
  Minus,
  Edit3,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Line change types for diff visualization
 */
type ChangeType = "add" | "remove" | "unchanged" | "context";

interface DiffLine {
  type: ChangeType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * A single file change in a diff
 */
export interface FileChange {
  path: string;
  oldContent: string;
  newContent: string;
  language?: string;
}

/**
 * Props for the DiffPreview component
 */
interface DiffPreviewProps {
  /** List of file changes to display */
  changes: FileChange[];
  /** Called when user accepts all changes */
  onAcceptAll?: () => void;
  /** Called when user rejects all changes */
  onRejectAll?: () => void;
  /** Called when user accepts a single file change */
  onAcceptFile?: (path: string) => void;
  /** Called when user rejects a single file change */
  onRejectFile?: (path: string) => void;
  /** Whether the changes are being applied */
  isApplying?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * DiffPreview Component
 *
 * Displays a visual diff of proposed code changes with accept/reject actions.
 * Similar to Cursor's diff view for AI-suggested changes.
 *
 * Features:
 * - Side-by-side or unified diff view
 * - Syntax highlighting context
 * - Accept/reject per file or all at once
 * - Collapsible file sections
 * - Line-by-line change visualization
 */
export function DiffPreview({
  changes,
  onAcceptAll,
  onRejectAll,
  onAcceptFile,
  onRejectFile,
  isApplying = false,
  className,
}: DiffPreviewProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(changes.map((c) => c.path))
  );
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Calculate statistics
  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    let files = changes.length;

    changes.forEach((change) => {
      const diff = computeDiff(change.oldContent, change.newContent);
      diff.forEach((line) => {
        if (line.type === "add") additions++;
        if (line.type === "remove") deletions++;
      });
    });

    return { additions, deletions, files };
  }, [changes]);

  if (changes.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "border border-border rounded-lg overflow-hidden bg-background-secondary",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background-tertiary">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Edit3 className="h-4 w-4 text-primary" />
            Proposed Changes
          </h3>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-success">
              <Plus className="h-3 w-3" />
              {stats.additions}
            </span>
            <span className="flex items-center gap-1 text-error">
              <Minus className="h-3 w-3" />
              {stats.deletions}
            </span>
            <span className="text-text-tertiary">
              {stats.files} file{stats.files !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRejectAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRejectAll}
              disabled={isApplying}
              className="text-error hover:text-error hover:bg-error/10"
            >
              <X className="h-4 w-4 mr-1" />
              Reject All
            </Button>
          )}
          {onAcceptAll && (
            <Button
              variant="primary"
              size="sm"
              onClick={onAcceptAll}
              disabled={isApplying}
              loading={isApplying}
            >
              <Check className="h-4 w-4 mr-1" />
              Accept All
            </Button>
          )}
        </div>
      </div>

      {/* File Changes */}
      <div className="divide-y divide-border">
        {changes.map((change) => (
          <FileChangeSection
            key={change.path}
            change={change}
            isExpanded={expandedFiles.has(change.path)}
            onToggle={() => toggleFile(change.path)}
            onAccept={onAcceptFile ? () => onAcceptFile(change.path) : undefined}
            onReject={onRejectFile ? () => onRejectFile(change.path) : undefined}
            onCopyPath={() => copyPath(change.path)}
            isCopied={copiedPath === change.path}
            isApplying={isApplying}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual file change section
 */
interface FileChangeSectionProps {
  change: FileChange;
  isExpanded: boolean;
  onToggle: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onCopyPath: () => void;
  isCopied: boolean;
  isApplying: boolean;
}

function FileChangeSection({
  change,
  isExpanded,
  onToggle,
  onAccept,
  onReject,
  onCopyPath,
  isCopied,
  isApplying,
}: FileChangeSectionProps) {
  const diffLines = useMemo(
    () => computeDiff(change.oldContent, change.newContent),
    [change.oldContent, change.newContent]
  );

  const fileStats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    diffLines.forEach((line) => {
      if (line.type === "add") additions++;
      if (line.type === "remove") deletions++;
    });
    return { additions, deletions };
  }, [diffLines]);

  const isNewFile = change.oldContent === "";
  const isDeletedFile = change.newContent === "";

  return (
    <div className="bg-background">
      {/* File Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-background-tertiary transition-colors group"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-text-tertiary" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-tertiary" />
          )}
          <FileCode className="h-4 w-4 text-text-secondary" />
          <span className="text-sm font-mono text-text-primary">{change.path}</span>
          {isNewFile && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-success/10 text-success">
              new
            </span>
          )}
          {isDeletedFile && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-error/10 text-error">
              deleted
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            {fileStats.additions > 0 && (
              <span className="text-success">+{fileStats.additions}</span>
            )}
            {fileStats.deletions > 0 && (
              <span className="text-error">-{fileStats.deletions}</span>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyPath();
              }}
              className="p-1 rounded hover:bg-background-hover"
              title="Copy path"
            >
              {isCopied ? (
                <CheckCircle2 className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3 text-text-tertiary" />
              )}
            </button>

            {onReject && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReject();
                }}
                className="p-1 rounded hover:bg-error/10 text-error"
                disabled={isApplying}
                title="Reject this change"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {onAccept && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept();
                }}
                className="p-1 rounded hover:bg-success/10 text-success"
                disabled={isApplying}
                title="Accept this change"
              >
                <Check className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </button>

      {/* Diff Content */}
      {isExpanded && (
        <div className="border-t border-border overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <tbody>
              {diffLines.map((line, index) => (
                <DiffLineRow key={index} line={line} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Single diff line row
 */
function DiffLineRow({ line }: { line: DiffLine }) {
  const bgColor = {
    add: "bg-success/10",
    remove: "bg-error/10",
    unchanged: "",
    context: "bg-background-tertiary",
  }[line.type];

  const textColor = {
    add: "text-success",
    remove: "text-error",
    unchanged: "text-text-secondary",
    context: "text-text-tertiary",
  }[line.type];

  const prefix = {
    add: "+",
    remove: "-",
    unchanged: " ",
    context: " ",
  }[line.type];

  return (
    <tr className={cn("group", bgColor)}>
      {/* Old line number */}
      <td className="w-12 px-2 py-0.5 text-right text-text-muted select-none border-r border-border/50">
        {line.oldLineNumber || ""}
      </td>
      {/* New line number */}
      <td className="w-12 px-2 py-0.5 text-right text-text-muted select-none border-r border-border/50">
        {line.newLineNumber || ""}
      </td>
      {/* Prefix (+/-/space) */}
      <td className={cn("w-6 px-1 py-0.5 text-center select-none", textColor)}>
        {prefix}
      </td>
      {/* Content */}
      <td className={cn("py-0.5 pr-4", textColor)}>
        <pre className="whitespace-pre">{line.content}</pre>
      </td>
    </tr>
  );
}

/**
 * Compute a simple diff between two strings
 * Returns an array of DiffLine objects
 */
function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  // Use a simple LCS-based diff algorithm
  const diff: DiffLine[] = [];

  // Build LCS matrix
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  let oldLineNum = m;
  let newLineNum = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({
        type: "unchanged",
        content: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({
        type: "add",
        content: newLines[j - 1],
        newLineNumber: j,
      });
      j--;
    } else if (i > 0) {
      result.unshift({
        type: "remove",
        content: oldLines[i - 1],
        oldLineNumber: i,
      });
      i--;
    }
  }

  return result;
}

/**
 * Compute diff with context (only show N lines around changes)
 */
export function computeDiffWithContext(
  oldContent: string,
  newContent: string,
  contextLines: number = 3
): DiffLine[] {
  const fullDiff = computeDiff(oldContent, newContent);

  // Find changed line indices
  const changedIndices = new Set<number>();
  fullDiff.forEach((line, index) => {
    if (line.type === "add" || line.type === "remove") {
      // Add surrounding context
      for (let i = Math.max(0, index - contextLines); i <= Math.min(fullDiff.length - 1, index + contextLines); i++) {
        changedIndices.add(i);
      }
    }
  });

  // Build result with context markers
  const result: DiffLine[] = [];
  let lastIncludedIndex = -1;

  fullDiff.forEach((line, index) => {
    if (changedIndices.has(index)) {
      // Add context separator if there's a gap
      if (lastIncludedIndex !== -1 && index - lastIncludedIndex > 1) {
        result.push({
          type: "context",
          content: "...",
        });
      }

      result.push(line);
      lastIncludedIndex = index;
    }
  });

  return result;
}

export default DiffPreview;

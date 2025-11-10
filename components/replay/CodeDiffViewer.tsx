"use client";

import React, { useState, useMemo } from "react";
import { diffLines, Change } from "diff";
import { File, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeSnapshot } from "./types";

interface CodeDiffViewerProps {
  snapshots: CodeSnapshot[];
  currentSnapshotIndex: number;
  onSnapshotChange: (index: number) => void;
  className?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber: number | null;
  oldLineNumber?: number | null;
  newLineNumber?: number | null;
}

function calculateDiff(oldContent: string, newContent: string): DiffLine[] {
  const changes = diffLines(oldContent, newContent);
  const lines: DiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;

  changes.forEach((change: Change) => {
    const content = change.value;
    const lineCount = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);

    if (change.added) {
      for (let i = 0; i < lineCount; i++) {
        lines.push({
          type: 'added',
          content: content.split('\n')[i] || '',
          lineNumber: newLineNum++,
          newLineNumber: newLineNum - 1,
          oldLineNumber: null,
        });
      }
    } else if (change.removed) {
      for (let i = 0; i < lineCount; i++) {
        lines.push({
          type: 'removed',
          content: content.split('\n')[i] || '',
          lineNumber: oldLineNum++,
          oldLineNumber: oldLineNum - 1,
          newLineNumber: null,
        });
      }
    } else {
      for (let i = 0; i < lineCount; i++) {
        lines.push({
          type: 'unchanged',
          content: content.split('\n')[i] || '',
          lineNumber: null,
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
    }
  });

  return lines;
}

export function CodeDiffViewer({
  snapshots,
  currentSnapshotIndex,
  onSnapshotChange,
  className,
}: CodeDiffViewerProps) {
  const [selectedFile, setSelectedFile] = useState<string>(snapshots[0]?.fileName || '');

  // Get unique file names
  const fileNames = useMemo(() => {
    const names = new Set<string>();
    snapshots.forEach(snapshot => names.add(snapshot.fileName));
    return Array.from(names);
  }, [snapshots]);

  // Get current and previous snapshot for selected file
  const currentSnapshot = useMemo(() => {
    return snapshots
      .slice(0, currentSnapshotIndex + 1)
      .reverse()
      .find(s => s.fileName === selectedFile);
  }, [snapshots, currentSnapshotIndex, selectedFile]);

  const previousSnapshot = useMemo(() => {
    const currentIndex = snapshots.findIndex(s => s === currentSnapshot);
    if (currentIndex <= 0) return null;

    return snapshots
      .slice(0, currentIndex)
      .reverse()
      .find(s => s.fileName === selectedFile);
  }, [snapshots, currentSnapshot, selectedFile]);

  // Calculate diff
  const diffLines = useMemo(() => {
    if (!currentSnapshot) return [];
    const oldContent = previousSnapshot?.content || '';
    const newContent = currentSnapshot.content;
    return calculateDiff(oldContent, newContent);
  }, [currentSnapshot, previousSnapshot]);

  // Split diff into old and new columns
  const { oldLines, newLines } = useMemo(() => {
    const old: DiffLine[] = [];
    const new_: DiffLine[] = [];

    diffLines.forEach(line => {
      if (line.type === 'removed') {
        old.push(line);
      } else if (line.type === 'added') {
        new_.push(line);
      } else {
        old.push(line);
        new_.push(line);
      }
    });

    // Pad shorter array to match length
    const maxLength = Math.max(old.length, new_.length);
    while (old.length < maxLength) {
      old.push({ type: 'unchanged', content: '', lineNumber: null });
    }
    while (new_.length < maxLength) {
      new_.push({ type: 'unchanged', content: '', lineNumber: null });
    }

    return { oldLines: old, newLines: new_ };
  }, [diffLines]);

  const stats = useMemo(() => {
    const added = diffLines.filter(l => l.type === 'added').length;
    const removed = diffLines.filter(l => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header with file tabs */}
      <div className="border-b border-border bg-background-secondary">
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
          {fileNames.map((fileName) => (
            <button
              key={fileName}
              onClick={() => setSelectedFile(fileName)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors whitespace-nowrap",
                selectedFile === fileName
                  ? "bg-background-tertiary text-text-primary border border-border"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-hover"
              )}
            >
              <File className="h-3 w-3" />
              {fileName}
            </button>
          ))}
        </div>

        {/* Stats */}
        {currentSnapshot && (
          <div className="flex items-center gap-4 px-4 py-2 text-xs border-t border-border">
            <div className="flex items-center gap-2">
              <span className="text-text-tertiary">Changes:</span>
              {stats.added > 0 && (
                <span className="text-success">+{stats.added}</span>
              )}
              {stats.removed > 0 && (
                <span className="text-error">-{stats.removed}</span>
              )}
            </div>
            <div className="text-text-tertiary">
              Snapshot {currentSnapshotIndex + 1} of {snapshots.length}
            </div>
          </div>
        )}
      </div>

      {/* Diff View */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 h-full">
          {/* Old Version */}
          <div className="border-r border-border bg-background">
            <div className="sticky top-0 bg-background-secondary border-b border-border px-4 py-2 text-xs text-text-tertiary font-medium">
              {previousSnapshot ? 'Previous' : 'Empty File'}
            </div>
            <div className="font-mono text-xs">
              {oldLines.map((line, index) => (
                <div
                  key={`old-${index}`}
                  className={cn(
                    "flex",
                    line.type === 'removed' && "bg-error/10",
                    line.type === 'unchanged' && "bg-background"
                  )}
                >
                  <div className={cn(
                    "flex-shrink-0 w-12 px-2 py-1 text-right select-none border-r",
                    line.type === 'removed'
                      ? "bg-error/5 text-error/60 border-error/20"
                      : "bg-background-secondary text-text-muted border-border"
                  )}>
                    {line.oldLineNumber || ''}
                  </div>
                  <div className={cn(
                    "flex-1 px-3 py-1 whitespace-pre",
                    line.type === 'removed' && "text-text-primary",
                    line.type === 'unchanged' && "text-text-secondary"
                  )}>
                    {line.content || ' '}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* New Version */}
          <div className="bg-background">
            <div className="sticky top-0 bg-background-secondary border-b border-border px-4 py-2 text-xs text-text-tertiary font-medium">
              Current
            </div>
            <div className="font-mono text-xs">
              {newLines.map((line, index) => (
                <div
                  key={`new-${index}`}
                  className={cn(
                    "flex",
                    line.type === 'added' && "bg-success/10",
                    line.type === 'unchanged' && "bg-background"
                  )}
                >
                  <div className={cn(
                    "flex-shrink-0 w-12 px-2 py-1 text-right select-none border-r",
                    line.type === 'added'
                      ? "bg-success/5 text-success/60 border-success/20"
                      : "bg-background-secondary text-text-muted border-border"
                  )}>
                    {line.newLineNumber || ''}
                  </div>
                  <div className={cn(
                    "flex-1 px-3 py-1 whitespace-pre",
                    line.type === 'added' && "text-text-primary",
                    line.type === 'unchanged' && "text-text-secondary"
                  )}>
                    {line.content || ' '}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      {snapshots.length > 1 && (
        <div className="border-t border-border bg-background-secondary px-4 py-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => onSnapshotChange(Math.max(0, currentSnapshotIndex - 1))}
              disabled={currentSnapshotIndex === 0}
              className="px-3 py-1 text-xs rounded bg-background-tertiary text-text-primary hover:bg-background-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous Snapshot
            </button>
            <span className="text-xs text-text-tertiary">
              {currentSnapshotIndex + 1} / {snapshots.length}
            </span>
            <button
              onClick={() => onSnapshotChange(Math.min(snapshots.length - 1, currentSnapshotIndex + 1))}
              disabled={currentSnapshotIndex === snapshots.length - 1}
              className="px-3 py-1 text-xs rounded bg-background-tertiary text-text-primary hover:bg-background-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next Snapshot
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

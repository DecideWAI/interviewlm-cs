/**
 * usePendingChanges Hook
 *
 * Manages pending AI-suggested changes before they are applied.
 * Provides a Cursor-like experience where users can review and
 * accept/reject changes before they modify files.
 */

import { useState, useCallback } from "react";
import type { FileChange } from "@/components/interview/DiffPreview";

export interface PendingChange extends FileChange {
  id: string;
  timestamp: Date;
  toolName: string;
  toolInput: unknown;
  status: "pending" | "accepted" | "rejected" | "applied";
}

export interface UsePendingChangesOptions {
  /** Callback when a change is applied */
  onChangeApplied?: (change: PendingChange) => void;
  /** Callback when a change is rejected */
  onChangeRejected?: (change: PendingChange) => void;
  /** Auto-apply changes without review (for full-copilot mode) */
  autoApply?: boolean;
}

export interface UsePendingChangesReturn {
  /** List of pending changes awaiting review */
  pendingChanges: PendingChange[];
  /** Add a new pending change */
  addPendingChange: (change: Omit<PendingChange, "id" | "timestamp" | "status">) => string;
  /** Accept a single change */
  acceptChange: (id: string) => Promise<void>;
  /** Reject a single change */
  rejectChange: (id: string) => void;
  /** Accept all pending changes */
  acceptAllChanges: () => Promise<void>;
  /** Reject all pending changes */
  rejectAllChanges: () => void;
  /** Clear all changes (both pending and processed) */
  clearChanges: () => void;
  /** Check if there are any pending changes */
  hasPendingChanges: boolean;
  /** Check if changes are being applied */
  isApplying: boolean;
  /** Get changes as FileChange array for DiffPreview */
  getFileChanges: () => FileChange[];
}

/**
 * Hook to manage pending AI-suggested file changes
 */
export function usePendingChanges(
  options: UsePendingChangesOptions = {}
): UsePendingChangesReturn {
  const { onChangeApplied, onChangeRejected, autoApply = false } = options;

  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [isApplying, setIsApplying] = useState(false);

  /**
   * Add a new pending change
   */
  const addPendingChange = useCallback(
    (change: Omit<PendingChange, "id" | "timestamp" | "status">): string => {
      const id = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newChange: PendingChange = {
        ...change,
        id,
        timestamp: new Date(),
        status: autoApply ? "applied" : "pending",
      };

      setChanges((prev) => [...prev, newChange]);

      // Auto-apply if enabled
      if (autoApply) {
        onChangeApplied?.(newChange);
      }

      return id;
    },
    [autoApply, onChangeApplied]
  );

  /**
   * Accept and apply a single change
   */
  const acceptChange = useCallback(
    async (id: string): Promise<void> => {
      setIsApplying(true);

      try {
        setChanges((prev) =>
          prev.map((change) =>
            change.id === id ? { ...change, status: "accepted" } : change
          )
        );

        const change = changes.find((c) => c.id === id);
        if (change) {
          // Actually apply the change via API
          await applyFileChange(change);

          setChanges((prev) =>
            prev.map((c) =>
              c.id === id ? { ...c, status: "applied" } : c
            )
          );

          onChangeApplied?.(change);
        }
      } finally {
        setIsApplying(false);
      }
    },
    [changes, onChangeApplied]
  );

  /**
   * Reject a single change
   */
  const rejectChange = useCallback(
    (id: string): void => {
      const change = changes.find((c) => c.id === id);

      setChanges((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: "rejected" } : c
        )
      );

      if (change) {
        onChangeRejected?.(change);
      }

      // Remove rejected changes after a delay
      setTimeout(() => {
        setChanges((prev) => prev.filter((c) => c.id !== id));
      }, 300);
    },
    [changes, onChangeRejected]
  );

  /**
   * Accept all pending changes
   */
  const acceptAllChanges = useCallback(async (): Promise<void> => {
    setIsApplying(true);

    try {
      const pending = changes.filter((c) => c.status === "pending");

      // Apply changes sequentially to avoid conflicts
      for (const change of pending) {
        await applyFileChange(change);

        setChanges((prev) =>
          prev.map((c) =>
            c.id === change.id ? { ...c, status: "applied" } : c
          )
        );

        onChangeApplied?.(change);
      }
    } finally {
      setIsApplying(false);
    }
  }, [changes, onChangeApplied]);

  /**
   * Reject all pending changes
   */
  const rejectAllChanges = useCallback((): void => {
    const pending = changes.filter((c) => c.status === "pending");

    setChanges((prev) =>
      prev.map((c) =>
        c.status === "pending" ? { ...c, status: "rejected" } : c
      )
    );

    pending.forEach((change) => {
      onChangeRejected?.(change);
    });

    // Remove rejected changes after a delay
    setTimeout(() => {
      setChanges((prev) => prev.filter((c) => c.status !== "rejected"));
    }, 300);
  }, [changes, onChangeRejected]);

  /**
   * Clear all changes
   */
  const clearChanges = useCallback((): void => {
    setChanges([]);
  }, []);

  /**
   * Get pending changes as FileChange array for DiffPreview component
   */
  const getFileChanges = useCallback((): FileChange[] => {
    return changes
      .filter((c) => c.status === "pending")
      .map((c) => ({
        path: c.path,
        oldContent: c.oldContent,
        newContent: c.newContent,
        language: c.language,
      }));
  }, [changes]);

  const pendingChanges = changes.filter((c) => c.status === "pending");

  return {
    pendingChanges,
    addPendingChange,
    acceptChange,
    rejectChange,
    acceptAllChanges,
    rejectAllChanges,
    clearChanges,
    hasPendingChanges: pendingChanges.length > 0,
    isApplying,
    getFileChanges,
  };
}

/**
 * Apply a file change via the API
 */
async function applyFileChange(change: PendingChange): Promise<void> {
  // This would call the actual file write API
  // For now, we'll simulate the API call
  console.log(`[PendingChanges] Applying change to ${change.path}`);

  // In production, this would be:
  // await fetch(`/api/interview/${sessionId}/files`, {
  //   method: 'POST',
  //   body: JSON.stringify({ path: change.path, content: change.newContent }),
  // });

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * Parse tool output to extract file change information
 */
export function parseToolOutputAsChange(
  toolName: string,
  toolInput: unknown,
  toolOutput: unknown,
  currentFileContent: string = ""
): Omit<PendingChange, "id" | "timestamp" | "status"> | null {
  switch (toolName) {
    case "Write":
    case "write_file": {
      const input = toolInput as { file_path?: string; path?: string; content?: string };
      const path = input.file_path || input.path;
      const newContent = input.content;

      if (path && newContent !== undefined) {
        return {
          path,
          oldContent: currentFileContent,
          newContent,
          toolName,
          toolInput,
          language: detectLanguage(path),
        };
      }
      break;
    }

    case "Edit":
    case "edit_file": {
      const input = toolInput as {
        file_path?: string;
        path?: string;
        old_string?: string;
        new_string?: string;
      };
      const path = input.file_path || input.path;
      const oldString = input.old_string;
      const newString = input.new_string;

      if (path && oldString !== undefined && newString !== undefined && currentFileContent) {
        const newContent = currentFileContent.replace(oldString, newString);
        return {
          path,
          oldContent: currentFileContent,
          newContent,
          toolName,
          toolInput,
          language: detectLanguage(path),
        };
      }
      break;
    }
  }

  return null;
}

/**
 * Detect programming language from file extension
 */
function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    rb: "ruby",
    php: "php",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    html: "html",
    css: "css",
    scss: "scss",
    sql: "sql",
    sh: "bash",
    bash: "bash",
  };

  return languageMap[ext || ""] || "text";
}

export default usePendingChanges;

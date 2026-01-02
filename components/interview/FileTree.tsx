"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, FolderPlus, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  path: string;
}

interface FileTreeProps {
  sessionId: string;
  files: FileNode[];
  selectedFile?: string;
  onFileSelect: (file: FileNode) => void;
  onFileCreate?: (path: string, type: "file" | "folder") => void;
  onFileDelete?: (path: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

interface FileTreeNodeProps {
  sessionId: string;
  node: FileNode;
  level: number;
  selectedFile?: string;
  onFileSelect: (file: FileNode) => void;
  onFileCreate?: (path: string, type: "file" | "folder") => void;
  onFileDelete?: (path: string) => void;
}

// Inline creation input component
function InlineCreationInput({
  type,
  level,
  onSubmit,
  onCancel,
}: {
  type: "file" | "folder";
  level: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && name.trim()) {
      onSubmit(name.trim());
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleBlur = () => {
    // Small delay to allow click events to register first
    setTimeout(() => {
      onCancel();
    }, 150);
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 bg-background-tertiary/50"
      style={{ paddingLeft: `${level * 12 + 8}px` }}
    >
      <div className="w-4" />
      {type === "folder" ? (
        <Folder className="h-4 w-4 flex-shrink-0 text-primary" />
      ) : (
        <File className="h-4 w-4 flex-shrink-0 text-text-secondary" />
      )}
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={type === "folder" ? "folder-name" : "filename.ts"}
        className="h-6 flex-1 text-sm py-0 px-1.5 bg-background border-primary/50 focus:border-primary"
      />
    </div>
  );
}

function FileTreeNode({
  sessionId,
  node,
  level,
  selectedFile,
  onFileSelect,
  onFileCreate,
  onFileDelete
}: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isCreating, setIsCreating] = useState<"file" | "folder" | null>(null);
  const isSelected = selectedFile === node.path;
  const isFolder = node.type === "folder";

  const handleClick = () => {
    if (isFolder) {
      setIsExpanded(!isExpanded);
    } else {
      onFileSelect(node);

      // Record file open event
      fetch(`/api/interview/${sessionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "file_open",
          data: {
            path: node.path,
            name: node.name,
          },
        }),
      }).catch((err) => console.error("Failed to record file open:", err));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        handleClick();
        break;
      case "ArrowRight":
        if (isFolder && !isExpanded) {
          e.preventDefault();
          setIsExpanded(true);
        }
        break;
      case "ArrowLeft":
        if (isFolder && isExpanded) {
          e.preventDefault();
          setIsExpanded(false);
        }
        break;
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${node.name}"?`)) {
      onFileDelete?.(node.path);
    }
  };

  const handleCreateInFolder = (e: React.MouseEvent, type: "file" | "folder") => {
    e.stopPropagation();
    setIsCreating(type);
    // Expand folder when creating inside it
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const handleCreateSubmit = (name: string) => {
    // Create file/folder with full path inside this folder
    const newPath = `${node.path}/${name}`;
    onFileCreate?.(newPath, isCreating!);
    setIsCreating(null);
  };

  return (
    <div>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-level={level + 1}
        aria-label={`${isFolder ? 'Folder' : 'File'}: ${node.name}`}
        tabIndex={isSelected ? 0 : -1}
        className={cn(
          "group flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-background-hover transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          isSelected && "bg-background-tertiary text-primary",
          !isSelected && "text-text-secondary"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isFolder ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-primary" />
            ) : (
              <Folder className="h-4 w-4 flex-shrink-0 text-primary" />
            )}
          </>
        ) : (
          <>
            <div className="w-4" />
            <File className="h-4 w-4 flex-shrink-0" />
          </>
        )}
        <span className="truncate flex-1">{node.name}</span>

        {/* Action buttons on hover */}
        {isHovered && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Show create buttons only for folders */}
            {isFolder && onFileCreate && (
              <>
                <button
                  onClick={(e) => handleCreateInFolder(e, "file")}
                  className="text-text-tertiary hover:text-primary transition-colors p-0.5 rounded"
                  title="New File"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => handleCreateInFolder(e, "folder")}
                  className="text-text-tertiary hover:text-primary transition-colors p-0.5 rounded"
                  title="New Folder"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {onFileDelete && (
              <button
                onClick={handleDelete}
                className="text-text-tertiary hover:text-error transition-colors p-0.5 rounded"
                title={`Delete ${node.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Children and inline creation input */}
      {isFolder && isExpanded && (
        <div>
          {/* Inline creation input at the top of folder contents */}
          {isCreating && (
            <InlineCreationInput
              type={isCreating}
              level={level + 1}
              onSubmit={handleCreateSubmit}
              onCancel={() => setIsCreating(null)}
            />
          )}
          {node.children?.map((child) => (
            <FileTreeNode
              key={child.id}
              sessionId={sessionId}
              node={child}
              level={level + 1}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
              onFileCreate={onFileCreate}
              onFileDelete={onFileDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  sessionId,
  files,
  selectedFile,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onRefresh,
  isRefreshing,
  className
}: FileTreeProps) {
  const [isCreating, setIsCreating] = useState<"file" | "folder" | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when creating
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const handleCreate = (name: string, type: "file" | "folder") => {
    // Record file creation event
    fetch(`/api/interview/${sessionId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "file_create",
        data: {
          path: name,
          type,
        },
      }),
    }).catch((err) => console.error("Failed to record file creation:", err));

    onFileCreate?.(name, type);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newItemName.trim()) {
      handleCreate(newItemName.trim(), isCreating!);
      setIsCreating(null);
      setNewItemName("");
    } else if (e.key === "Escape") {
      setIsCreating(null);
      setNewItemName("");
    }
  };

  const handleInputBlur = () => {
    // Small delay to allow click events to register first
    setTimeout(() => {
      setIsCreating(null);
      setNewItemName("");
    }, 150);
  };

  const handleFileDelete = (path: string) => {
    // Record file deletion event
    fetch(`/api/interview/${sessionId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "file_delete",
        data: {
          path,
        },
      }),
    }).catch((err) => console.error("Failed to record file deletion:", err));

    onFileDelete?.(path);
  };

  return (
    <div className={cn("bg-background flex flex-col h-full", className)}>
      {/* Header with action buttons - fixed at top */}
      <div className="border-b border-border p-2 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-text-primary">Files</span>
        <div className="flex items-center gap-0.5">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-text-tertiary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded p-1 disabled:opacity-50"
              title="Refresh files from server"
              aria-label="Refresh files"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </button>
          )}
          {onFileCreate && (
            <>
              <button
                onClick={() => setIsCreating("file")}
                className="text-text-tertiary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded p-1"
                title="New File (root)"
                aria-label="New File"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsCreating("folder")}
                className="text-text-tertiary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded p-1"
                title="New Folder (root)"
                aria-label="New Folder"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline creation input for root level */}
      {isCreating && (
        <div
          className="flex items-center gap-1.5 px-2 py-1 bg-background-tertiary/50 border-b border-border flex-shrink-0"
          style={{ paddingLeft: "20px" }}
        >
          {isCreating === "folder" ? (
            <Folder className="h-4 w-4 flex-shrink-0 text-primary" />
          ) : (
            <File className="h-4 w-4 flex-shrink-0 text-text-secondary" />
          )}
          <Input
            ref={inputRef}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            placeholder={isCreating === "folder" ? "folder-name" : "filename.ts"}
            className="h-6 flex-1 text-sm py-0 px-1.5 bg-background border-primary/50 focus:border-primary"
          />
        </div>
      )}

      {/* File tree - scrollable area */}
      <div role="tree" aria-label="Project files" className="py-2 flex-1 overflow-y-auto min-h-0">
        {files.map((node) => (
          <FileTreeNode
            key={node.id}
            sessionId={sessionId}
            node={node}
            level={0}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            onFileCreate={onFileCreate}
            onFileDelete={onFileDelete ? handleFileDelete : undefined}
          />
        ))}
      </div>
    </div>
  );
}

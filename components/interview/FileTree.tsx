"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, FolderPlus, Trash2 } from "lucide-react";
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
  className?: string;
}

interface FileTreeNodeProps {
  sessionId: string;
  node: FileNode;
  level: number;
  selectedFile?: string;
  onFileSelect: (file: FileNode) => void;
  onFileDelete?: (path: string) => void;
}

function FileTreeNode({ sessionId, node, level, selectedFile, onFileSelect, onFileDelete }: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
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
        {isHovered && onFileDelete && (
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-error transition-all p-0.5 rounded"
            title={`Delete ${node.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.id}
              sessionId={sessionId}
              node={child}
              level={level + 1}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
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
    <div className={cn("bg-background overflow-y-auto", className)}>
      {/* Header with action buttons */}
      <div className="border-b border-border p-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-primary">Files</span>
        {onFileCreate && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setIsCreating("file")}
              className="text-text-tertiary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded p-1"
              title="New File"
              aria-label="New File"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsCreating("folder")}
              className="text-text-tertiary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded p-1"
              title="New Folder"
              aria-label="New Folder"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Inline creation input (VS Code style) */}
      {isCreating && (
        <div
          className="flex items-center gap-1.5 px-2 py-1 bg-background-tertiary/50 border-b border-border"
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

      {/* File tree */}
      <div role="tree" aria-label="Project files" className="py-2">
        {files.map((node) => (
          <FileTreeNode
            key={node.id}
            sessionId={sessionId}
            node={node}
            level={0}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            onFileDelete={onFileDelete ? handleFileDelete : undefined}
          />
        ))}
      </div>
    </div>
  );
}

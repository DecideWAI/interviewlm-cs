"use client";

import React, { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

function FileTreeNode({ sessionId, node, level, selectedFile, onFileSelect }: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
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

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-background-hover transition-colors text-sm",
          isSelected && "bg-background-tertiary text-primary",
          !isSelected && "text-text-secondary"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
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
        <span className="truncate">{node.name}</span>
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
  const handleFileCreate = (path: string, type: "file" | "folder") => {
    // Record file creation event
    fetch(`/api/interview/${sessionId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "file_create",
        data: {
          path,
          type,
        },
      }),
    }).catch((err) => console.error("Failed to record file creation:", err));

    onFileCreate?.(path, type);
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
      <div className="border-b border-border p-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-primary">Files</span>
        {onFileCreate && (
          <button
            onClick={() => {
              const fileName = prompt("Enter file name:");
              if (fileName) {
                handleFileCreate(fileName, "file");
              }
            }}
            className="text-text-tertiary hover:text-primary transition-colors"
            title="Create new file"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="py-2">
        {files.map((node) => (
          <FileTreeNode
            key={node.id}
            sessionId={sessionId}
            node={node}
            level={0}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
          />
        ))}
      </div>
    </div>
  );
}

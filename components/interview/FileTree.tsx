"use client";

import React, { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  path: string;
}

interface FileTreeProps {
  files: FileNode[];
  selectedFile?: string;
  onFileSelect: (file: FileNode) => void;
  className?: string;
}

interface FileTreeNodeProps {
  node: FileNode;
  level: number;
  selectedFile?: string;
  onFileSelect: (file: FileNode) => void;
}

function FileTreeNode({ node, level, selectedFile, onFileSelect }: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isSelected = selectedFile === node.path;
  const isFolder = node.type === "folder";

  const handleClick = () => {
    if (isFolder) {
      setIsExpanded(!isExpanded);
    } else {
      onFileSelect(node);
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

export function FileTree({ files, selectedFile, onFileSelect, className }: FileTreeProps) {
  return (
    <div className={cn("bg-background overflow-y-auto", className)}>
      <div className="py-2">
        {files.map((node) => (
          <FileTreeNode
            key={node.id}
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

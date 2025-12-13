"use client";

import { ReactNode, useState, useEffect, useCallback } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { BookOpen, FileCode, MessageSquare, ClipboardCheck, Terminal as TerminalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PanelSizes {
  horizontal: [number, number, number];
  vertical: [number, number];
}

export const DEFAULT_PANEL_SIZES: PanelSizes = {
  horizontal: [25, 48, 27],
  vertical: [60, 40],
};

interface InterviewLayoutProps {
  // Session/storage key for persisting panel sizes
  storageKey: string;

  // Left sidebar content
  problemContent: ReactNode;
  filesContent: ReactNode;
  leftSidebarTab?: "problem" | "files";
  onLeftSidebarTabChange?: (tab: "problem" | "files") => void;

  // Center panel content
  editorContent: ReactNode;
  terminalContent: ReactNode;
  terminalHeaderContent?: ReactNode; // Optional extra content for terminal header (badges, etc.)
  terminalOverlay?: ReactNode; // Optional overlay on terminal (completion card)

  // Right sidebar content
  chatContent: ReactNode;
  evaluationContent?: ReactNode;
  rightPanelTab?: "chat" | "evaluation";
  onRightPanelTabChange?: (tab: "chat" | "evaluation") => void;
  showEvaluationBadge?: boolean;

  // Right panel visibility
  isRightPanelOpen?: boolean;
  onRightPanelToggle?: () => void;

  // Panel size control
  panelSizes?: PanelSizes; // External control of panel sizes
  onPanelSizesChange?: (sizes: PanelSizes) => void; // Callback when sizes change

  // Mode indicator
  mode?: "live" | "replay";
}

export function InterviewLayout({
  storageKey,
  problemContent,
  filesContent,
  leftSidebarTab: controlledLeftTab,
  onLeftSidebarTabChange,
  editorContent,
  terminalContent,
  terminalHeaderContent,
  terminalOverlay,
  chatContent,
  evaluationContent,
  rightPanelTab: controlledRightTab,
  onRightPanelTabChange,
  showEvaluationBadge = false,
  isRightPanelOpen = true,
  onRightPanelToggle,
  panelSizes: controlledPanelSizes,
  onPanelSizesChange,
  mode = "live",
}: InterviewLayoutProps) {
  const [mounted, setMounted] = useState(false);
  const [internalPanelSizes, setInternalPanelSizes] = useState<PanelSizes>(DEFAULT_PANEL_SIZES);

  // Use controlled or internal panel sizes
  const panelSizes = controlledPanelSizes ?? internalPanelSizes;

  // Internal state for uncontrolled tabs
  const [internalLeftTab, setInternalLeftTab] = useState<"problem" | "files">("problem");
  const [internalRightTab, setInternalRightTab] = useState<"chat" | "evaluation">("chat");

  // Use controlled or internal state
  const leftSidebarTab = controlledLeftTab ?? internalLeftTab;
  const rightPanelTab = controlledRightTab ?? internalRightTab;

  const handleLeftTabChange = (tab: "problem" | "files") => {
    if (onLeftSidebarTabChange) {
      onLeftSidebarTabChange(tab);
    } else {
      setInternalLeftTab(tab);
    }
    localStorage.setItem(`${storageKey}-sidebar-tab`, tab);
  };

  const handleRightTabChange = (tab: "chat" | "evaluation") => {
    if (onRightPanelTabChange) {
      onRightPanelTabChange(tab);
    } else {
      setInternalRightTab(tab);
    }
  };

  // Load saved preferences (only for internal state)
  useEffect(() => {
    setMounted(true);

    // Restore sidebar tab
    const savedSidebarTab = localStorage.getItem(`${storageKey}-sidebar-tab`);
    if (savedSidebarTab === "problem" || savedSidebarTab === "files") {
      if (!controlledLeftTab) {
        setInternalLeftTab(savedSidebarTab);
      }
    }

    // Restore panel sizes (only if not controlled externally)
    if (!controlledPanelSizes) {
      const savedPanelSizes = localStorage.getItem(`${storageKey}-panel-sizes-v2`);
      if (savedPanelSizes) {
        try {
          const parsed = JSON.parse(savedPanelSizes);
          setInternalPanelSizes(parsed);
        } catch (e) {
          console.error("Failed to parse panel sizes:", e);
        }
      }
    }
  }, [storageKey, controlledLeftTab, controlledPanelSizes]);

  const handleHorizontalLayout = useCallback(
    (sizes: number[]) => {
      const newSizes: PanelSizes = {
        ...panelSizes,
        horizontal: sizes as [number, number, number],
      };

      if (onPanelSizesChange) {
        onPanelSizesChange(newSizes);
      } else {
        setInternalPanelSizes(newSizes);
        localStorage.setItem(`${storageKey}-panel-sizes-v2`, JSON.stringify(newSizes));
      }
    },
    [panelSizes, storageKey, onPanelSizesChange]
  );

  const handleVerticalLayout = useCallback(
    (sizes: number[]) => {
      const newSizes: PanelSizes = {
        ...panelSizes,
        vertical: sizes as [number, number],
      };

      if (onPanelSizesChange) {
        onPanelSizesChange(newSizes);
      } else {
        setInternalPanelSizes(newSizes);
        localStorage.setItem(`${storageKey}-panel-sizes-v2`, JSON.stringify(newSizes));
      }
    },
    [panelSizes, storageKey, onPanelSizesChange]
  );

  if (!mounted) return null;

  return (
    <div className="flex-1 overflow-hidden">
      <PanelGroup direction="horizontal" onLayout={handleHorizontalLayout}>
        {/* Left Sidebar - Problem/Files Tabs */}
        <Panel defaultSize={panelSizes.horizontal[0]} minSize={20} maxSize={35}>
          <div className="h-full border-r border-border flex flex-col bg-background">
            {/* Tabs */}
            <div className="border-b border-border bg-background-secondary flex">
              <button
                onClick={() => handleLeftTabChange("problem")}
                className={cn(
                  "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
                  leftSidebarTab === "problem"
                    ? "text-primary border-b-2 border-primary bg-background"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-background-hover"
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  <span>Problem</span>
                </div>
              </button>
              <button
                onClick={() => handleLeftTabChange("files")}
                className={cn(
                  "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
                  leftSidebarTab === "files"
                    ? "text-primary border-b-2 border-primary bg-background"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-background-hover"
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <FileCode className="h-4 w-4" />
                  <span>Files</span>
                </div>
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden min-h-0">
              {leftSidebarTab === "problem" ? problemContent : filesContent}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

        {/* Center - Editor and Terminal */}
        <Panel defaultSize={isRightPanelOpen ? panelSizes.horizontal[1] : 73} minSize={40}>
          <PanelGroup direction="vertical" onLayout={handleVerticalLayout}>
            {/* Editor */}
            <Panel defaultSize={panelSizes.vertical[0]} minSize={30}>
              <div className="h-full flex flex-col border-b border-border">
                {editorContent}
              </div>
            </Panel>

            <PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors" />

            {/* Terminal */}
            <Panel defaultSize={panelSizes.vertical[1]} minSize={20}>
              <div className="h-full flex flex-col">
                <div className="border-b border-border bg-background-secondary px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TerminalIcon className="h-4 w-4 text-success" />
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      Terminal
                    </p>
                    {mode === "replay" && (
                      <span className="text-xs text-text-muted">(Replay)</span>
                    )}
                  </div>
                  {terminalHeaderContent}
                </div>
                <div className="flex-1 min-h-0 relative">
                  {terminalContent}
                  {terminalOverlay}
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        {/* Right Sidebar - AI Chat / Evaluation */}
        {isRightPanelOpen && (
          <>
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />
            <Panel defaultSize={panelSizes.horizontal[2]} minSize={20} maxSize={50}>
              <div className="h-full border-l border-border flex flex-col bg-background">
                {/* Tab Headers */}
                <div className="border-b border-border bg-background-secondary flex">
                  <button
                    onClick={() => handleRightTabChange("chat")}
                    className={cn(
                      "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
                      rightPanelTab === "chat"
                        ? "text-primary border-b-2 border-primary bg-background"
                        : "text-text-tertiary hover:text-text-secondary hover:bg-background-hover"
                    )}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      <span>AI Chat</span>
                      {mode === "replay" && (
                        <span className="text-[10px] text-text-muted">(Replay)</span>
                      )}
                    </div>
                  </button>
                  {evaluationContent && (
                    <button
                      onClick={() => handleRightTabChange("evaluation")}
                      className={cn(
                        "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
                        rightPanelTab === "evaluation"
                          ? "text-primary border-b-2 border-primary bg-background"
                          : "text-text-tertiary hover:text-text-secondary hover:bg-background-hover"
                      )}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <ClipboardCheck className="h-4 w-4" />
                        <span>Evaluation</span>
                        {showEvaluationBadge && (
                          <span className="h-2 w-2 rounded-full bg-success" />
                        )}
                      </div>
                    </button>
                  )}
                </div>

                {/* Tab Content - Both panels rendered but only active one visible */}
                <div className="flex-1 min-h-0 relative">
                  <div className={cn("h-full", rightPanelTab !== "chat" && "hidden")}>
                    {chatContent}
                  </div>
                  {evaluationContent && (
                    <div className={cn("h-full", rightPanelTab !== "evaluation" && "hidden")}>
                      {evaluationContent}
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>

      {/* Toggle Right Panel Button */}
      {!isRightPanelOpen && onRightPanelToggle && (
        <button
          onClick={onRightPanelToggle}
          className="fixed bottom-4 right-4 h-12 w-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-hover transition-colors"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}

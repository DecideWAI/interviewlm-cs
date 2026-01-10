"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { FileTree, FileNode } from "@/components/interview/FileTree";
import { AIChat, AIChatHandle, Message } from "@/components/interview/AIChat";
import { ProblemPanel } from "@/components/interview/ProblemPanel";
import { InterviewLayout, PanelSizes, DEFAULT_PANEL_SIZES } from "@/components/interview/InterviewLayout";
import { PanelGroup, Panel, PanelResizeHandle, ImperativePanelHandle } from "react-resizable-panels";
import { useInterviewKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsPanel, defaultInterviewShortcuts } from "@/components/interview/KeyboardShortcutsPanel";
import { QuestionProgressHeader } from "@/components/interview/QuestionProgressHeader";
import { QuestionCompletionCard } from "@/components/interview/QuestionCompletionCard";
import { NextQuestionLoading } from "@/components/interview/NextQuestionLoading";
import { QuestionTransition } from "@/components/interview/QuestionTransition";
import { EvaluationPanel, EvaluationResult } from "@/components/interview/EvaluationPanel";
import { TechStackRequirements } from "@/types/assessment";
import type { QuestionPerformance } from "@/components/interview/QuestionTransition";
import { resetConversation } from "@/lib/chat-resilience";
import { useSessionRecovery, SessionState } from "@/hooks/useSessionRecovery";

/**
 * Safely extract starter code from various API response formats
 * API may return string, array of {content}, or object with {content}
 */
function extractStarterCode(starterCode: unknown): string {
  if (typeof starterCode === "string") {
    return starterCode;
  }
  if (Array.isArray(starterCode) && starterCode.length > 0) {
    const first = starterCode[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "content" in first) {
      return String(first.content || "");
    }
  }
  if (starterCode && typeof starterCode === "object" && "content" in starterCode) {
    return String((starterCode as { content?: unknown }).content || "");
  }
  return "";
}
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useIsMobile } from "@/lib/device-detection";
import { MobileBlocker } from "@/components/interview/MobileBlocker";
import { toast } from "sonner";

// Dynamic import for Terminal (xterm.js requires client-side only)
const Terminal = dynamic(
  () => import("@/components/interview/Terminal").then((mod) => mod.Terminal),
  { ssr: false }
);
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Play,
  Square,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Code2,
  Terminal as TerminalIcon,
  BookOpen,
  FileCode,
  X,
  Loader2,
  Check,
  Sparkles,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  PanelBottomClose,
  PanelBottom,
} from "lucide-react";

// Tab interface for multi-tab editor support
interface OpenTab {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

// Session initialization data interface
interface SessionData {
  sessionId: string;
  candidateId: string;
  totalQuestions?: number; // Total number of questions in assessment
  question: {
    id: string;
    title: string;
    description: string;
    difficulty: string;
    language: string;
    starterCode: string;
    testCases: Array<{
      name: string;
      input: string;
      expectedOutput: string;
      hidden: boolean;
    }>;
    evaluationResult?: EvaluationResult; // Persisted evaluation for reload recovery
  };
  sandbox: {
    volumeId: string;
    workspaceDir: string;
    status: string;
  };
  files: FileNode[];
  timeLimit: number;
  timeRemaining: number;
  startedAt: string;
  techStack?: TechStackRequirements;
}

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const candidateId = params.id as string;

  // Mobile device detection - block mobile devices
  const { isMobile, isChecking } = useIsMobile();

  // Session state
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // UI state
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [code, setCode] = useState("");
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [fileCache, setFileCache] = useState<Map<string, string>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(true);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [testResults, setTestResults] = useState({ passed: 0, total: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leftSidebarTab, setLeftSidebarTab] = useState<"problem" | "files">("problem");
  const [panelSizes, setPanelSizes] = useState<PanelSizes>(DEFAULT_PANEL_SIZES);

  // Question progression state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(3); // Default, will be updated
  const [questionStartTime, setQuestionStartTime] = useState<Date | null>(null);
  const [questionTimeElapsed, setQuestionTimeElapsed] = useState(0);
  const [isLoadingNextQuestion, setIsLoadingNextQuestion] = useState(false);
  const [showCompletionCard, setShowCompletionCard] = useState(false);
  const [previousQuestionPerformance, setPreviousQuestionPerformance] = useState<QuestionPerformance | null>(null);

  // Incremental assessment state
  const [isIncrementalAssessment, setIsIncrementalAssessment] = useState(false);
  const [progressionContext, setProgressionContext] = useState<{
    trend: "improving" | "declining" | "stable";
    action: "extend" | "maintain" | "simplify";
    averageScore: number;
  } | null>(null);
  const [buildingOn, setBuildingOn] = useState<string>("");
  const [difficultyCalibrated, setDifficultyCalibrated] = useState(false);

  // Evaluation state
  const [rightPanelTab, setRightPanelTab] = useState<"chat" | "evaluation">("chat");
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [passingThreshold, setPassingThreshold] = useState(70);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Terminal panel ref for imperative collapse/expand
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);

  // AI Chat ref for resetConversation
  const aiChatRef = useRef<AIChatHandle>(null);

  // Prevent duplicate initialization in React 18 strict mode
  const initializationStartedRef = useRef(false);

  // Ref to track selected file for use in event handlers (avoids stale closure)
  const selectedFileRef = useRef<FileNode | null>(null);
  useEffect(() => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  const onRestore = useCallback((state: SessionState) => {
    // Auto-restore session state without showing prompt
    console.log('Auto-restoring session from:', new Date(state.lastSaved));

    // Defensive check: ensure code is a string (could be corrupted by bad API responses)
    const restoredCode = typeof state.code === 'string' ? state.code : '';
    setCode(restoredCode);
    setTestResults(state.testResults);
    setTimeRemaining(state.timeRemaining);
    setCurrentQuestionIndex(state.currentQuestionIndex);
    setQuestionTimeElapsed(state.questionTimeElapsed);

    if (state.questionStartTime) {
      setQuestionStartTime(new Date(state.questionStartTime));
    }

    // FAST PATH: If we have cached question + fileTree, restore sessionData immediately
    // This allows the UI to show instantly on browser refresh!
    if (state.question && state.fileTree && state.sessionId) {
      console.log('[FastRestore] Using cached question/fileTree for instant UI');

      // Build sessionData from cached state
      const cachedSessionData: SessionData = {
        sessionId: state.sessionId,
        candidateId,
        totalQuestions: state.totalQuestions || 3,
        question: {
          id: state.question.id,
          title: state.question.title,
          description: state.question.description,
          difficulty: state.question.difficulty,
          language: state.question.language,
          starterCode: state.question.starterCode || '',
          testCases: state.question.testCases || [],
        },
        sandbox: {
          volumeId: state.volumeId || '',
          workspaceDir: '/workspace',
          status: state.sandboxReady ? 'ready' : 'pending',
        },
        files: state.fileTree,
        timeLimit: state.timeRemaining + state.questionTimeElapsed, // Approximate
        timeRemaining: state.timeRemaining,
        startedAt: new Date(Date.now() - state.questionTimeElapsed * 1000).toISOString(),
      };

      setSessionData(cachedSessionData);
      setTotalQuestions(state.totalQuestions || 3);
      setIsInitializing(false); // Hide loading screen immediately!

      // Find and select the correct file
      if (state.selectedFilePath && state.fileTree) {
        const fileNode = state.fileTree.find(f => f.path === state.selectedFilePath);
        if (fileNode) {
          setSelectedFile(fileNode as FileNode);
        }
      }

      // Mark that we used fast restore (skip API file fetch, validate in background)
      sessionStorage.setItem(`fast-restored-${candidateId}`, 'true');

      toast.success("Session resumed instantly", {
        description: "Your progress has been restored from cache.",
        duration: 2000,
        icon: "⚡",
      });
      return;
    }

    // SLOW PATH: No cached question data - wait for API initialization
    // Mark that session was restored to prevent overwriting code during init
    sessionStorage.setItem(`session-restored-${candidateId}`, 'true');

    // File will be restored after sessionData loads
    if (state.selectedFilePath) {
      sessionStorage.setItem(`restore-file-${candidateId}`, state.selectedFilePath);
    }

    toast.success("Session resumed", {
      description: "Your progress has been restored automatically.",
      duration: 3000,
      icon: "💾",
    });
  }, [candidateId]);

  // Session recovery for preventing data loss on refresh (auto-resume without prompt)
  const { saveSessionState, clearSessionState, checkRecoverableSession } = useSessionRecovery({
    candidateId,
    onRestore,
  });

  // Offline detection for better error handling
  const { isOnline, wasOffline, resetWasOffline } = useOnlineStatus();

  // Load UI preferences from localStorage
  useEffect(() => {
    const savedTab = localStorage.getItem(`interview-sidebar-tab-${candidateId}`);
    if (savedTab === "problem" || savedTab === "files") {
      setLeftSidebarTab(savedTab);
    }

    const savedPanelSizes = localStorage.getItem(`interview-panel-sizes-${candidateId}-v2`);
    if (savedPanelSizes) {
      try {
        const parsed = JSON.parse(savedPanelSizes);
        setPanelSizes(parsed);
      } catch (e) {
        console.error("Failed to parse panel sizes:", e);
      }
    }

    // Load terminal collapsed state and sync with actual panel state
    const savedTerminalCollapsed = localStorage.getItem(`interview-terminal-collapsed-${candidateId}`);

    // Sync state with actual panel after it mounts
    const syncPanelState = () => {
      const panel = terminalPanelRef.current;
      if (!panel) {
        // Retry if panel ref not ready yet
        setTimeout(syncPanelState, 50);
        return;
      }

      const isActuallyCollapsed = panel.isCollapsed();
      const shouldBeCollapsed = savedTerminalCollapsed === "true";

      // Sync the React state with what we want
      setIsTerminalCollapsed(shouldBeCollapsed);

      // Sync the actual panel with what we want
      if (shouldBeCollapsed && !isActuallyCollapsed) {
        panel.collapse();
      } else if (!shouldBeCollapsed && isActuallyCollapsed) {
        // Expand to a reasonable size (default 40%)
        panel.resize(DEFAULT_PANEL_SIZES.vertical[1]);
      }
    };

    // Small delay to ensure panel is mounted
    setTimeout(syncPanelState, 100);
  }, [candidateId]);

  // Save sidebar tab preference
  const handleTabChange = (tab: "problem" | "files") => {
    setLeftSidebarTab(tab);
    localStorage.setItem(`interview-sidebar-tab-${candidateId}`, tab);
  };

  // Handle panel size changes from InterviewLayout
  const handlePanelSizesChange = useCallback((newSizes: PanelSizes) => {
    setPanelSizes(newSizes);
    localStorage.setItem(`interview-panel-sizes-${candidateId}-v2`, JSON.stringify(newSizes));
  }, [candidateId]);

  // Handle horizontal panel layout changes
  const handleHorizontalLayout = useCallback((sizes: number[]) => {
    const newSizes: PanelSizes = {
      ...panelSizes,
      horizontal: sizes as [number, number, number],
    };
    setPanelSizes(newSizes);
    localStorage.setItem(`interview-panel-sizes-${candidateId}-v2`, JSON.stringify(newSizes));
  }, [candidateId, panelSizes]);

  // Handle vertical panel layout changes
  // Don't save collapsed sizes (< 5%) - restore to default when expanding
  const handleVerticalLayout = useCallback((sizes: number[]) => {
    const terminalSize = sizes[1];

    // Only save if terminal has a meaningful size (not collapsed)
    if (terminalSize >= 5) {
      const newSizes: PanelSizes = {
        ...panelSizes,
        vertical: sizes as [number, number],
      };
      setPanelSizes(newSizes);
      localStorage.setItem(`interview-panel-sizes-${candidateId}-v2`, JSON.stringify(newSizes));
    }
  }, [candidateId, panelSizes]);

  // Handle terminal collapse toggle using imperative Panel API
  const handleTerminalCollapse = useCallback(() => {
    const panel = terminalPanelRef.current;
    if (!panel) return;

    // Check actual panel state to handle out-of-sync scenarios
    const isActuallyCollapsed = panel.isCollapsed();

    if (isActuallyCollapsed) {
      // Expand the panel - resize to saved size or default (40%)
      const savedSize = panelSizes.vertical[1];
      const targetSize = savedSize >= 10 ? savedSize : DEFAULT_PANEL_SIZES.vertical[1];
      panel.resize(targetSize);
      setIsTerminalCollapsed(false);
      localStorage.setItem(`interview-terminal-collapsed-${candidateId}`, "false");
    } else {
      // Collapse the panel
      panel.collapse();
      setIsTerminalCollapsed(true);
      localStorage.setItem(`interview-terminal-collapsed-${candidateId}`, "true");
    }
  }, [candidateId, panelSizes.vertical]);

  // Prefetch all file contents for instant navigation
  const prefetchAllFiles = useCallback(async () => {
    try {
      const response = await fetch(`/api/interview/${candidateId}/files?bulk=true`);
      if (response.ok) {
        const { contents } = await response.json();
        if (contents && typeof contents === 'object') {
          setFileCache(new Map(Object.entries(contents)));
          console.log(`[FileCache] Pre-fetched ${Object.keys(contents).length} files`);
        }
      }
    } catch (error) {
      console.error('[FileCache] Failed to prefetch files:', error);
    }
  }, [candidateId]);

  // Initialize session on mount
  useEffect(() => {
    // Prevent duplicate initialization in React 18 strict mode
    if (initializationStartedRef.current) {
      return;
    }
    initializationStartedRef.current = true;

    // Check if we already did a fast-restore from localStorage cache
    const wasFastRestored = sessionStorage.getItem(`fast-restored-${candidateId}`);
    if (wasFastRestored) {
      console.log('[FastRestore] Skipping API init - using cached data');
      sessionStorage.removeItem(`fast-restored-${candidateId}`);

      // Background validation: verify session is still valid and prefetch files
      // This runs in background while UI is already showing
      (async () => {
        try {
          // Validate session with API (will use fast path since session exists)
          const response = await fetch(`/api/interview/${candidateId}/initialize`, {
            method: "POST",
          });

          if (!response.ok) {
            console.warn('[FastRestore] Background validation failed - session may have expired');
            // Don't force reload - let user continue with cached data
            // They'll see errors when they try to interact
          } else {
            console.log('[FastRestore] Background validation successful');

            // Restore evaluation result from API if available (not cached in localStorage)
            const responseJson = await response.json();
            const data = responseJson.data || responseJson;
            if (data.question?.evaluationResult) {
              console.log('[FastRestore] Restoring evaluation result from server');
              setEvaluationResult(data.question.evaluationResult);
              setRightPanelTab('evaluation');
            }

            // Optionally refresh file contents in background
            prefetchAllFiles();
          }
        } catch (error) {
          console.warn('[FastRestore] Background validation error:', error);
        }
      })();

      return; // Skip full initialization - UI already showing from cache
    }

    const initializeSession = async () => {
      try {
        setIsInitializing(true);
        setInitError(null);

        const response = await fetch(`/api/interview/${candidateId}/initialize`, {
          method: "POST",
        });

        if (!response.ok) {
          const errorResponse = await response.json();
          throw new Error(errorResponse.error?.message || errorResponse.error || "Failed to initialize session");
        }

        const responseJson = await response.json();
        // API returns { success: true, data: {...}, meta: {...} } format
        const data: SessionData = responseJson.data || responseJson;

        // Transform techStack array to requirements object if needed
        if (data.techStack && Array.isArray(data.techStack)) {
          data.techStack = {
            required: data.techStack.map((t: string, i: number) => ({
              id: `tech-${i}`,
              name: t,
              category: 'framework' as const,
            })),
            optional: [],
          };
        }

        setSessionData(data);
        setTimeRemaining(data.timeRemaining);

        // Restore evaluation state if available (persistence across page reloads)
        if (data.question.evaluationResult) {
          console.log('[Session] Restoring evaluation result from server');
          setEvaluationResult(data.question.evaluationResult);
          // Switch to evaluation tab to show the restored results
          setRightPanelTab('evaluation');
        }

        // Pre-fetch all file contents for instant navigation (non-blocking)
        prefetchAllFiles();

        // Update total questions from API response
        if (data.totalQuestions) {
          setTotalQuestions(data.totalQuestions);
        }

        // Set default selected file and load its content
        // Check if we need to restore a specific file from session recovery
        const restoredFilePath = sessionStorage.getItem(`restore-file-${candidateId}`);
        let fileToSelect: FileNode | undefined;

        // Ensure files array exists (defensive check)
        const files = data.files || [];

        if (files.length > 0) {
          if (restoredFilePath) {
            // Restore previously selected file
            fileToSelect = files.find(f => f.path === restoredFilePath);
            sessionStorage.removeItem(`restore-file-${candidateId}`);
            console.log('Restored previously selected file:', fileToSelect?.name);
          }

          if (!fileToSelect) {
            // Default to main file if no restoration or file not found
            fileToSelect = files.find(
              (f) => f.name.includes("solution") || f.name.includes("index")
            ) || files[0];
          }

          setSelectedFile(fileToSelect);

          // Load file content only if not already restored from session recovery
          // (code state is already set by onRestore if session was recovered)
          const hasRestoredSession = sessionStorage.getItem(`session-restored-${candidateId}`);
          if (!hasRestoredSession) {
            try {
              const fileResponse = await fetch(
                `/api/interview/${candidateId}/files?path=${encodeURIComponent(fileToSelect.path)}`
              );
              if (fileResponse.ok) {
                const fileResponseJson = await fileResponse.json();
                // Handle both wrapped { success, data } and direct response formats
                const fileData = fileResponseJson.data || fileResponseJson;
                // Ensure content is a string (defensive check)
                const fileContent = typeof fileData.content === 'string' ? fileData.content : '';
                setCode(fileContent || extractStarterCode(data.question.starterCode));
              } else {
                setCode(extractStarterCode(data.question.starterCode));
              }
            } catch {
              setCode(extractStarterCode(data.question.starterCode));
            }
          } else {
            // Clear the flag after using it
            sessionStorage.removeItem(`session-restored-${candidateId}`);
            console.log('Skipped loading file content - using restored session code');
          }
        } else {
          setCode(extractStarterCode(data.question.starterCode));
        }
      } catch (err) {
        console.error("Session initialization error:", err);
        setInitError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsInitializing(false);
      }
    };

    initializeSession();
  }, [candidateId, prefetchAllFiles]);

  // Subscribe to file updates via SSE for real-time file tree updates
  useEffect(() => {
    // Skip for demo mode or if not initialized
    if (candidateId === 'demo' || !sessionData) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isCleanedUp = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const BASE_RECONNECT_DELAY = 1000; // 1 second

    const connect = () => {
      if (isCleanedUp) return;

      console.log(`[FileUpdates] Connecting to SSE (attempt ${reconnectAttempts + 1})`);
      eventSource = new EventSource(`/api/interview/${candidateId}/file-updates`);

      eventSource.addEventListener('file-change', async (event) => {
        try {
          const change = JSON.parse(event.data);
          console.log('[FileUpdates] Received:', change);

          if (change.type === 'create') {
            setSessionData(prev => {
              if (!prev) return prev;

              // Create new file node
              const newNode: FileNode = {
                id: `file-${Date.now()}`,
                name: change.name,
                type: change.fileType === 'folder' ? 'folder' : 'file',
                path: change.path,
              };

              // Determine parent path
              const pathParts = change.path.split('/');
              pathParts.pop(); // Remove the file/folder name
              const parentPath = pathParts.join('/') || '/workspace';

              return {
                ...prev,
                files: addToFileTree(prev.files, newNode, parentPath),
              };
            });
          } else if (change.type === 'delete') {
            setSessionData(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                files: removeFromFileTree(prev.files, change.path),
              };
            });
            // Remove from file cache
            setFileCache(prev => {
              const newCache = new Map(prev);
              newCache.delete(change.path);
              return newCache;
            });
          } else if (change.type === 'update') {
            // Refresh the updated file content from the server
            console.log('[FileUpdates] Refreshing content for:', change.path);
            try {
              const response = await fetch(`/api/interview/${candidateId}/files?path=${encodeURIComponent(change.path)}`);
              if (response.ok) {
                const { content } = await response.json();
                // Update the file cache
                setFileCache(prev => {
                  const newCache = new Map(prev);
                  newCache.set(change.path, content);
                  return newCache;
                });
                // If this file is currently selected in the editor, update the code too
                // Use ref to get current value (avoids stale closure)
                if (selectedFileRef.current?.path === change.path) {
                  console.log('[FileUpdates] Updating editor content for selected file:', change.path);
                  setCode(content);
                }
                // Also update the open tab content
                setOpenTabs(prevTabs =>
                  prevTabs.map(tab =>
                    tab.path === change.path
                      ? { ...tab, content, isDirty: false }
                      : tab
                  )
                );
                console.log('[FileUpdates] Content refreshed for:', change.path);
              }
            } catch (fetchErr) {
              console.error('[FileUpdates] Failed to refresh content:', fetchErr);
            }
          }
        } catch (err) {
          console.error('[FileUpdates] Parse error:', err);
        }
      });

      eventSource.addEventListener('connected', () => {
        console.log('[FileUpdates] SSE connected successfully');
        reconnectAttempts = 0; // Reset on successful connection
      });

      eventSource.onerror = () => {
        if (isCleanedUp) return;

        // EventSource errors are common and often just mean the connection was closed
        // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSED
        const state = eventSource?.readyState;

        if (state === EventSource.CLOSED) {
          console.log('[FileUpdates] SSE connection closed, will reconnect');
          eventSource?.close();
          eventSource = null;

          // Reconnect with exponential backoff
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000);
            reconnectAttempts++;
            console.log(`[FileUpdates] Reconnecting in ${delay}ms...`);
            reconnectTimeout = setTimeout(connect, delay);
          } else {
            console.warn('[FileUpdates] Max reconnect attempts reached, giving up');
          }
        } else {
          console.warn('[FileUpdates] SSE error (readyState:', state, ')');
        }
      };
    };

    // Initial connection
    connect();

    return () => {
      isCleanedUp = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (eventSource) {
        eventSource.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, !!sessionData]); // Only re-run when candidateId changes or sessionData existence changes

  // Timer countdown
  useEffect(() => {
    if (!sessionData || timeRemaining <= 0) return;

    const intervalId = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up - auto-submit
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [sessionData, timeRemaining]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Track question time elapsed
  useEffect(() => {
    if (!questionStartTime) {
      // Set start time when session initializes
      if (sessionData) {
        setQuestionStartTime(new Date());
      }
      return;
    }

    const intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - questionStartTime.getTime()) / 1000);
      setQuestionTimeElapsed(elapsed);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [questionStartTime, sessionData]);

  // Show completion card when evaluation passes (NOT based on tests)
  // Tests are informational but the evaluation agent's verdict is the gate
  useEffect(() => {
    if (evaluationResult?.passed) {
      setShowCompletionCard(true);
    } else {
      setShowCompletionCard(false);
    }
  }, [evaluationResult]);

  // Auto-save session state to localStorage (prevents data loss on refresh)
  // Also caches question/fileTree for fast restore on browser refresh
  useEffect(() => {
    if (!sessionData) return;

    saveSessionState({
      // Core state that changes frequently
      code,
      selectedFilePath: selectedFile?.path || null,
      testResults,
      timeRemaining,
      currentQuestionIndex,
      questionStartTime: questionStartTime?.toISOString() || null,
      questionTimeElapsed,

      // Cached data for fast restore on browser refresh (from sessionData)
      sessionId: sessionData.sessionId,
      question: {
        id: sessionData.question.id,
        title: sessionData.question.title,
        description: sessionData.question.description,
        difficulty: sessionData.question.difficulty,
        language: sessionData.question.language,
        starterCode: sessionData.question.starterCode,
        testCases: sessionData.question.testCases,
      },
      fileTree: sessionData.files,
      sandboxReady: sessionData.sandbox?.status === 'ready',
      volumeId: sessionData.sandbox?.volumeId,
      totalQuestions: sessionData.totalQuestions || totalQuestions,
    });
  }, [
    code,
    selectedFile,
    testResults,
    timeRemaining,
    currentQuestionIndex,
    questionStartTime,
    questionTimeElapsed,
    sessionData,
    saveSessionState,
    totalQuestions,
  ]);

  // Show reconnection notification
  useEffect(() => {
    if (isOnline && wasOffline) {
      toast.success("Connection restored", {
        description: "You're back online. All changes will be synchronized.",
        duration: 3000,
        icon: "🌐",
      });
      resetWasOffline();
    }
  }, [isOnline, wasOffline, resetWasOffline]);

  // Confirmation before leaving page
  useEffect(() => {
    if (!sessionData || isSubmitting) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have an interview in progress. Are you sure you want to leave?';
      return 'You have an interview in progress. Are you sure you want to leave?';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionData, isSubmitting]);

  // Manual save handler (for Ctrl+S)
  const handleManualSave = useCallback(async () => {
    if (!sessionData || !selectedFile) return;

    // Check online status
    if (!isOnline) {
      toast.warning("You're offline", {
        description: "Changes are saved locally and will sync when reconnected.",
        duration: 3000,
      });
      return;
    }

    const toastId = toast.loading(`Saving ${selectedFile.name}...`);

    try {
      await fetch(`/api/interview/${candidateId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedFile.path,
          content: code,
          language: sessionData.question.language,
        }),
      });

      toast.success("File saved", {
        id: toastId,
        description: `${selectedFile.name} saved successfully`,
        duration: 2000,
        icon: "💾",
      });
    } catch (err) {
      console.error("Failed to save file:", err);
      toast.error("Save failed", {
        id: toastId,
        description: err instanceof Error ? err.message : "Failed to save file",
        duration: 4000,
      });
    }
  }, [sessionData, selectedFile, candidateId, code, isOnline]);

  const handleCodeChange = useCallback((newCode: string) => {
    // Update local state immediately (optimistic update)
    setCode(newCode);

    // Mark current tab as dirty and reset save status
    if (selectedFile) {
      setOpenTabs(prev => prev.map(tab =>
        tab.path === selectedFile.path
          ? { ...tab, content: newCode, isDirty: true }
          : tab
      ));
      setSaveStatus("idle"); // Reset when user types
    }

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce API call (1 second for faster auto-save)
    debounceTimerRef.current = setTimeout(async () => {
      if (sessionData && selectedFile) {
        setSaveStatus("saving");
        try {
          await fetch(`/api/interview/${candidateId}/files`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: selectedFile.path,
              content: newCode,
              language: sessionData.question.language,
            }),
          });
          // Mark tab as clean after successful save
          setOpenTabs(prev => prev.map(tab =>
            tab.path === selectedFile.path
              ? { ...tab, isDirty: false }
              : tab
          ));
          setSaveStatus("saved");
          // Clear "saved" status after 2 seconds
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (err) {
          console.error("Failed to sync file:", err);
          setSaveStatus("idle");
        }
      }
    }, 1000); // 1 second debounce for faster auto-save
  }, [sessionData, selectedFile, candidateId]);

  const handleRunTests = async () => {
    if (!sessionData) return;

    try {
      const response = await fetch(`/api/interview/${candidateId}/run-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language: sessionData.question.language,
          questionId: sessionData.question.id, // Critical fix: add questionId
          fileName: selectedFile?.name,
        }),
      });

      if (response.ok) {
        const responseJson = await response.json();
        // Handle both wrapped { success, data } and direct response formats
        const results = responseJson.data || responseJson;
        setTestResults({
          passed: results.passed,
          total: results.total,
        });
      } else {
        const errorData = await response.json();
        console.error("Run tests failed:", JSON.stringify(errorData, null, 2));
      }
    } catch (err) {
      console.error("Failed to run tests:", err);
    }
  };

  const handleEvaluate = async () => {
    if (!sessionData || isEvaluating) return;

    setIsEvaluating(true);
    setRightPanelTab("evaluation"); // Switch to evaluation tab

    // Debug: Log evaluation context
    console.log("[Evaluate Debug] Question ID:", sessionData.question.id);
    console.log("[Evaluate Debug] Test Results:", testResults);
    console.log("[Evaluate Debug] Selected file:", selectedFile?.name);

    try {
      // Use the new fast progression endpoint
      // This endpoint uses an optimized agent with Haiku model for quick evaluation
      const response = await fetch(`/api/interview/${candidateId}/evaluate-progression`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: sessionData.question.id,
          language: sessionData.question.language,
          testResults: {
            passed: testResults.passed,
            failed: testResults.total - testResults.passed,
            total: testResults.total,
          },
          fileName: selectedFile?.name,
        }),
      });

      if (response.ok) {
        const responseJson = await response.json();
        const result = responseJson.data || responseJson;
        setEvaluationResult(result);

        if (result.passed) {
          toast.success("Evaluation passed!", {
            description: `Score: ${result.overallScore}/100`,
          });
        } else {
          toast.warning("Needs improvement", {
            description: result.blockingReason || `Score: ${result.overallScore}/100. Review feedback to improve.`,
          });
        }
      } else {
        const errorData = await response.json();
        console.error("Evaluation failed:", errorData);
        toast.error("Evaluation failed", {
          description: errorData.error?.message || errorData.error || "Please try again.",
        });
      }
    } catch (err) {
      console.error("Failed to evaluate:", err);
      toast.error("Evaluation failed", {
        description: "An unexpected error occurred.",
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSubmit = async () => {
    if (!sessionData || isSubmitting) return;

    // Confirm submission
    const confirmSubmit = window.confirm(
      "Are you sure you want to submit your assessment? This action cannot be undone."
    );

    if (!confirmSubmit) return;

    try {
      setIsSubmitting(true);

      // Submit assessment
      const response = await fetch(`/api/interview/${candidateId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalCode: {
            [`solution.${sessionData.question.language === "python" ? "py" : "js"}`]: code,
          },
        }),
      });

      if (!response.ok) {
        const errorResponse = await response.json();
        throw new Error(errorResponse.error?.message || errorResponse.error || "Submission failed");
      }

      const responseJson = await response.json();
      // Handle both wrapped { success, data } and direct response formats
      const result = responseJson.data || responseJson;

      // Queue comprehensive evaluation for background processing
      // This creates detailed reports for hiring managers
      try {
        await fetch(`/api/interview/${candidateId}/evaluate-comprehensive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priority: "normal",
          }),
        });
        console.log("[Submit] Comprehensive evaluation queued for background processing");
      } catch (evalErr) {
        // Don't block submission if evaluation queueing fails
        console.error("[Submit] Failed to queue comprehensive evaluation:", evalErr);
      }

      // Clear session state - assessment is complete
      clearSessionState();

      // Show success message
      toast.success("Assessment submitted!", {
        description: "Your submission is being evaluated. Results will be available shortly.",
        duration: 5000,
      });

      // Redirect to dashboard or thank you page
      router.push("/dashboard");
    } catch (err) {
      console.error("Submission error:", err);
      toast.error("Submission failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setIsSubmitting(false);
    }
  };

  // Keyboard shortcuts - must be before early returns (Rules of Hooks)
  useInterviewKeyboardShortcuts({
    onSave: handleManualSave,
    onRunTests: handleRunTests,
    onToggleAIChat: () => setIsAIChatOpen((prev) => !prev),
    onSubmit: handleSubmit,
  });

  // Mobile check loading
  if (isChecking) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Spinner className="mx-auto mb-4" />
      </div>
    );
  }

  // Block mobile devices
  if (isMobile) {
    return <MobileBlocker />;
  }

  // Loading state - informative initialization screen
  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-lg px-6">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <h1 className="text-2xl font-semibold text-text-primary mb-2">
              Preparing Your Interview
            </h1>
            <p className="text-text-secondary">
              Setting up a personalized coding environment
            </p>
          </div>

          {/* Progress Steps */}
          <div className="space-y-4 mb-8">
            {[
              { label: "Generating unique challenge", icon: Code2, tip: "AI is crafting a problem tailored to your role" },
              { label: "Setting up cloud sandbox", icon: TerminalIcon, tip: "Spinning up an isolated development environment" },
              { label: "Preparing workspace", icon: FileCode, tip: "Installing tools and configuring your editor" },
            ].map((step) => (
              <div
                key={step.label}
                className="flex items-center gap-4 p-4 rounded-lg bg-background-secondary border border-border"
              >
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{step.label}</span>
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5">{step.tip}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-primary-hover rounded-full animate-progress-grow" />
            </div>
            <p className="text-xs text-text-muted text-center mt-2">
              This usually takes 30-60 seconds
            </p>
          </div>

          {/* Tips */}
          <div className="p-4 rounded-lg bg-background-tertiary/50 border border-border">
            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">Pro Tip</p>
                <p className="text-xs text-text-secondary">
                  You&apos;ll have access to InterviewLM AI to help you during the interview.
                  Use it like a pair programming partner - ask questions, debug together,
                  and think out loud!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (initError || !sessionData) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Failed to Initialize Interview
          </h2>
          <p className="text-text-secondary mb-4">
            {initError || "Unknown error occurred"}
          </p>
          <Button onClick={() => router.push("/dashboard")}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const handleNextQuestion = async () => {
    if (!sessionData || isLoadingNextQuestion) return;

    try {
      setIsLoadingNextQuestion(true);
      setShowCompletionCard(false);

      // Store current test results before resetting (for performance calculation)
      const currentTestResults = { ...testResults };
      // Reset test results immediately to prevent completion card from re-showing
      setTestResults({ passed: 0, total: 0 });

      // Calculate performance score
      // Prefer evaluation score (from AI evaluation) over simple test pass rate
      const timeSpent = questionTimeElapsed;
      const testsPassedRatio = currentTestResults.total > 0 ? currentTestResults.passed / currentTestResults.total : 0;
      const score = evaluationResult?.overallScore ?? Math.round(testsPassedRatio * 100);

      // Store performance for loading screen (full context for incremental)
      setPreviousQuestionPerformance({
        questionNumber: currentQuestionIndex + 1,
        title: sessionData.question.title,
        rawScore: score,
        timeSpent,
        testsPassedRatio,
      });

      // Call API to generate next question
      const response = await fetch(`/api/interview/${candidateId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousPerformance: {
            questionId: sessionData.question.id,
            score,
            timeSpent,
            testsPassedRatio,
          },
        }),
      });

      if (!response.ok) {
        const errorResponse = await response.json();
        throw new Error(errorResponse.error?.message || errorResponse.error || "Failed to generate next question");
      }

      const responseJson = await response.json();
      // Handle both wrapped { success, data } and direct response formats
      const data = responseJson.data || responseJson;

      // Check if this was the last question
      if (data.completed) {
        // Show final summary and submit
        alert("All questions completed! Ready to submit your assessment.");
        await handleSubmit();
        return;
      }

      // Update incremental assessment context from API response
      if (data.isIncremental !== undefined) {
        setIsIncrementalAssessment(data.isIncremental);
      }
      if (data.progressionContext) {
        setProgressionContext(data.progressionContext);
      }
      if (data.buildingOn) {
        setBuildingOn(data.buildingOn);
      }
      if (data.question.difficultyAssessment) {
        setDifficultyCalibrated(true);
      }

      // Update session with new question
      const newStarterCode = extractStarterCode(data.question.starterCode);
      setSessionData({
        ...sessionData,
        question: {
          id: data.question.id,
          title: data.question.title,
          description: data.question.description,
          difficulty: data.question.difficulty.toUpperCase(),
          language: data.question.language,
          starterCode: newStarterCode,
          testCases: data.question.testCases,
        },
      });

      // Update question tracking
      setCurrentQuestionIndex((prev) => prev + 1);
      setQuestionStartTime(new Date());
      setQuestionTimeElapsed(0);
      // Note: testResults already reset at start of function

      // CRITICAL: Reset evaluation result for the new question
      // Without this, the previous question's evaluation shows "Continue to Next Question"
      // instead of prompting the user to evaluate the new question
      setEvaluationResult(null);

      // Switch to AI Chat tab for the new question (evaluation panel will be empty)
      setRightPanelTab("chat");

      // Reset editor with new starter code
      setCode(newStarterCode);

      // CRITICAL: Reset AI conversation history for new question
      // This prevents context leakage between questions
      // If this fails after retries, we BLOCK progression (security risk)
      try {
        await resetConversation(candidateId, data.question.id);
        // Sync UI: Clear conversation in frontend
        aiChatRef.current?.resetConversation();
      } catch (resetError) {
        // Conversation reset failed after 3 retries - CRITICAL
        console.error("CRITICAL: Conversation reset failed:", resetError);
        setIsLoadingNextQuestion(false);

        toast.error("Security error", {
          description: "Failed to prepare for next question. Please refresh the page and try again.",
          duration: 8000,
          action: {
            label: "Refresh",
            onClick: () => window.location.reload(),
          },
        });
        return; // BLOCK question progression
      }

      // Clear previous performance after loading
      setTimeout(() => {
        setPreviousQuestionPerformance(null);
        setIsLoadingNextQuestion(false);
      }, 2000); // Show loading screen for 2 seconds
    } catch (err) {
      console.error("Failed to load next question:", err);
      setIsLoadingNextQuestion(false);

      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      toast.error("Failed to load next question", {
        description: errorMessage,
        duration: 6000,
        action: {
          label: "Try Again",
          onClick: handleNextQuestion,
        },
      });
    }
  };

  // Format time remaining
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleFileSelect = async (file: FileNode) => {
    if (file.type === "file") {
      // Save current tab's content before switching
      if (selectedFile && openTabs.length > 0) {
        setOpenTabs(prev => prev.map(tab =>
          tab.path === selectedFile.path
            ? { ...tab, content: code }
            : tab
        ));
      }

      // CRITICAL FIX: Flush pending save before switching files
      // Without this, debounced changes to current file are lost
      if (debounceTimerRef.current && sessionData && selectedFile) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;

        // Save current file immediately to server
        try {
          await fetch(`/api/interview/${candidateId}/files`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: selectedFile.path,
              content: code,
              language: sessionData.question.language,
            }),
          });
          console.debug('Flushed pending changes before file switch');
        } catch (err) {
          console.error("Failed to flush pending save:", err);
        }
      }

      setSelectedFile(file);

      // Check if file is already open in a tab
      const existingTab = openTabs.find(tab => tab.path === file.path);

      if (existingTab) {
        // Switch to existing tab, use cached content
        setCode(existingTab.content);
      } else {
        // Check if file content is in the pre-fetched cache
        const cachedContent = fileCache.get(file.path);

        if (cachedContent !== undefined) {
          // Use cached content - instant navigation!
          console.log(`[FileCache] Using cached content for ${file.name}`);
          setCode(cachedContent);

          // Create tab with cached content
          const newTab: OpenTab = {
            id: `tab-${Date.now()}`,
            name: file.name,
            path: file.path,
            content: cachedContent,
            language: getLanguageFromFileName(file.name),
            isDirty: false,
          };

          setOpenTabs(prev => {
            if (prev.some(tab => tab.path === file.path)) {
              return prev;
            }
            return [...prev, newTab];
          });
        } else {
          // Fallback: Create tab IMMEDIATELY with loading state, then load content async
          console.log(`[FileCache] Cache miss for ${file.name}, fetching from server`);
          const newTabId = `tab-${Date.now()}`;
          const newTab: OpenTab = {
            id: newTabId,
            name: file.name,
            path: file.path,
            content: "", // Will be populated after fetch
            language: getLanguageFromFileName(file.name),
            isDirty: false,
          };

          // Add tab immediately (with duplicate check)
          setOpenTabs(prev => {
            if (prev.some(tab => tab.path === file.path)) {
              return prev;
            }
            return [...prev, newTab];
          });

          // Set empty code and show loading state
          setCode("");
          setIsFileLoading(true);

          // Load file content from Modal volume asynchronously
          try {
            const response = await fetch(
              `/api/interview/${candidateId}/files?path=${encodeURIComponent(file.path)}`
            );

            if (response.ok) {
              const responseJson = await response.json();
              const data = responseJson.data || responseJson;
              const fileContent = typeof data.content === 'string' ? data.content : '';

              // Update code and tab content
              setCode(fileContent);
              setOpenTabs(prev => prev.map(tab =>
                tab.path === file.path ? { ...tab, content: fileContent } : tab
              ));

              // Also update the cache for future access
              setFileCache(prev => new Map(prev).set(file.path, fileContent));
            } else {
              console.error("Failed to load file content:", response.status);
            }
          } catch (err) {
            console.error("Error loading file:", err);
          } finally {
            setIsFileLoading(false);
          }
        }
      }
    }
  };

  // Handle tab close
  const handleTabClose = async (tabPath: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent tab selection

    const tabToClose = openTabs.find(tab => tab.path === tabPath);
    if (!tabToClose) return;

    // If tab has unsaved changes, save first
    if (tabToClose.isDirty && sessionData) {
      try {
        await fetch(`/api/interview/${candidateId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: tabToClose.path,
            content: tabToClose.content,
            language: tabToClose.language,
          }),
        });
      } catch (err) {
        console.error("Failed to save file before closing:", err);
      }
    }

    // Remove tab
    const newTabs = openTabs.filter(tab => tab.path !== tabPath);
    setOpenTabs(newTabs);

    // If we closed the active tab, switch to another
    if (selectedFile?.path === tabPath) {
      if (newTabs.length > 0) {
        // Switch to the last tab
        const lastTab = newTabs[newTabs.length - 1];
        setSelectedFile({ id: lastTab.id, name: lastTab.name, path: lastTab.path, type: "file" });
        setCode(lastTab.content);
      } else {
        // No tabs left
        setSelectedFile(null);
        setCode("");
      }
    }
  };

  // Handle switching to a tab
  const handleTabSwitch = (tab: OpenTab) => {
    // Save current tab's content first
    if (selectedFile && openTabs.length > 0) {
      setOpenTabs(prev => prev.map(t =>
        t.path === selectedFile.path
          ? { ...t, content: code }
          : t
      ));
    }

    setSelectedFile({ id: tab.id, name: tab.name, path: tab.path, type: "file" });
    setCode(tab.content);
  };

  // Refresh file list from server
  const refreshFiles = async () => {
    if (!sessionData) return;

    try {
      const response = await fetch(`/api/interview/${candidateId}/files`);
      if (response.ok) {
        const responseJson = await response.json();
        const data = responseJson.data || responseJson;
        // Update files in session data
        if (data.files) {
          setSessionData(prev => prev ? { ...prev, files: data.files } : null);
        }
      }
    } catch (err) {
      console.error("Failed to refresh files:", err);
    }
  };

  // Helper to get language from file path
  const getLanguageFromPath = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      md: 'markdown',
      json: 'json',
      html: 'html',
      css: 'css',
      sql: 'sql',
      sh: 'bash',
      yaml: 'yaml',
      yml: 'yaml',
      txt: 'text',
    };
    return languageMap[ext] || 'text';
  };

  // Helper to add a file/folder to the nested file tree
  const addToFileTree = (
    files: FileNode[],
    newItem: FileNode,
    parentPath: string | null
  ): FileNode[] => {
    // If no parent (root level), add to root
    if (!parentPath || parentPath === "/workspace") {
      return [...files, newItem];
    }

    // Find parent folder and add to its children
    return files.map((file) => {
      if (file.path === parentPath && file.type === "folder") {
        return {
          ...file,
          children: [...(file.children || []), newItem],
        };
      }
      if (file.children) {
        return {
          ...file,
          children: addToFileTree(file.children, newItem, parentPath),
        };
      }
      return file;
    });
  };

  // Helper to remove a file/folder from the nested file tree
  const removeFromFileTree = (files: FileNode[], path: string): FileNode[] => {
    return files
      .filter((file) => file.path !== path)
      .map((file) => {
        if (file.children) {
          return { ...file, children: removeFromFileTree(file.children, path) };
        }
        return file;
      });
  };

  // Handle manual refresh of all files from server
  const handleRefreshFiles = async () => {
    setIsRefreshing(true);
    try {
      // Use dedicated refresh API that fetches directly from sandbox
      // This returns both file tree and all file contents in one call
      const response = await fetch(`/api/interview/${candidateId}/files/refresh`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to refresh files");
      }

      const { files, contents } = await response.json();

      // Update file tree
      if (files && Array.isArray(files)) {
        setSessionData(prev => prev ? { ...prev, files } : null);
      }

      // Update file cache with all contents from sandbox
      if (contents && typeof contents === 'object') {
        setFileCache(new Map(Object.entries(contents)));
        console.log(`[FileRefresh] Loaded ${Object.keys(contents).length} files from sandbox`);
      }

      // If a file is currently selected, update its content from the new data
      if (selectedFile && contents[selectedFile.path] !== undefined) {
        const fileContent = contents[selectedFile.path];
        if (fileContent !== code) {
          setCode(fileContent);
          // Update tab content too
          setOpenTabs(prev => prev.map(tab =>
            tab.path === selectedFile.path ? { ...tab, content: fileContent, isDirty: false } : tab
          ));
        }
      }

      toast.success("Files refreshed", {
        duration: 2000,
      });
    } catch (error) {
      console.error("Failed to refresh files:", error);
      toast.error("Failed to refresh files");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle file creation from FileTree (optimistic update)
  const handleFileCreate = (fileName: string, type: "file" | "folder") => {
    if (!sessionData) return;

    // Normalize the path
    const fullPath = fileName.startsWith("/")
      ? fileName
      : `/workspace/${fileName}`;

    // Extract parent path and file name
    const pathParts = fullPath.split("/");
    const name = pathParts.pop() || fileName;
    const parentPath = pathParts.join("/") || null;

    // Create optimistic file node
    const optimisticNode: FileNode = {
      id: `optimistic-${Date.now()}`,
      name,
      type: type === "folder" ? "folder" : "file",
      path: fullPath,
      children: type === "folder" ? [] : undefined,
    };

    // Optimistically update UI immediately
    setSessionData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        files: addToFileTree(prev.files, optimisticNode, parentPath),
      };
    });

    // Show immediate feedback
    toast.success(type === "folder" ? "Folder created" : "File created", {
      description: `Created ${name}`,
      duration: 2000,
    });

    // Create file/folder in background (don't await)
    fetch(`/api/interview/${candidateId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: fullPath,
        content: "",
        language: type === "file" ? getLanguageFromFileName(fileName) : undefined,
        type,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || error.error || "Failed to create");
        }
        // Optionally refresh to get server-assigned IDs (background, low priority)
        // refreshFiles(); // Uncomment if you need server IDs
      })
      .catch((err) => {
        console.error(`Failed to create ${type}:`, err);
        // Revert optimistic update on failure
        setSessionData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            files: removeFromFileTree(prev.files, fullPath),
          };
        });
        toast.error(`Failed to create ${type}`, {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      });
  };

  // Helper to determine language from file name
  const getLanguageFromFileName = (fileName: string): string => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      js: "javascript",
      ts: "typescript",
      py: "python",
      go: "go",
      md: "markdown",
      json: "json",
    };
    return languageMap[ext || ""] || "text";
  };

  // Handle file deletion from FileTree (optimistic update)
  const handleFileDelete = (path: string) => {
    if (!sessionData) return;

    const fileName = path.split("/").pop() || path;

    // Store current state for potential rollback
    const previousFiles = sessionData.files;
    const previousTabs = openTabs;
    const previousSelectedFile = selectedFile;
    const previousCode = code;

    // Optimistically remove from UI immediately
    setSessionData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        files: removeFromFileTree(prev.files, path),
      };
    });

    // Remove the tab for the deleted file
    const newTabs = openTabs.filter(tab => tab.path !== path);
    setOpenTabs(newTabs);

    // If the deleted file was selected, switch to another tab or clear
    if (selectedFile?.path === path) {
      if (newTabs.length > 0) {
        const lastTab = newTabs[newTabs.length - 1];
        setSelectedFile({ id: lastTab.id, name: lastTab.name, path: lastTab.path, type: "file" });
        setCode(lastTab.content);
      } else {
        setSelectedFile(null);
        setCode("");
      }
    }

    // Show immediate feedback
    toast.success("Deleted", {
      description: fileName,
      duration: 2000,
    });

    // Delete in background (don't await)
    fetch(`/api/interview/${candidateId}/files`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to delete");
        }
      })
      .catch((err) => {
        console.error("Failed to delete file:", err);
        // Revert optimistic update on failure
        setSessionData((prev) => {
          if (!prev) return null;
          return { ...prev, files: previousFiles };
        });
        setOpenTabs(previousTabs);
        setSelectedFile(previousSelectedFile);
        setCode(previousCode);
        toast.error("Failed to delete", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      });
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Loading Next Question Overlay */}
      {isLoadingNextQuestion && (
        <>
          {isIncrementalAssessment && previousQuestionPerformance ? (
            <QuestionTransition
              previousPerformance={previousQuestionPerformance}
              nextQuestionNumber={currentQuestionIndex + 2}
              progressionContext={progressionContext ?? undefined}
              estimatedDifficulty={
                progressionContext?.action === "extend" ? "harder" :
                  progressionContext?.action === "simplify" ? "easier" :
                    "similar"
              }
              buildingOn={buildingOn}
            />
          ) : (
            <NextQuestionLoading
              previousScore={previousQuestionPerformance?.rawScore}
              previousTime={previousQuestionPerformance?.timeSpent}
              nextDifficulty={sessionData.question.difficulty.toLowerCase() as "easy" | "medium" | "hard"}
              nextQuestionNumber={currentQuestionIndex + 2}
            />
          )}
        </>
      )}

      {/* Compact Header */}
      <div className="border-b border-border bg-background-secondary px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-sm font-semibold text-text-primary">
              Question {currentQuestionIndex + 1}/{totalQuestions}: {sessionData.question.title}
            </h1>

            <Badge
              variant={
                sessionData.question.difficulty === "EASY"
                  ? "success"
                  : sessionData.question.difficulty === "MEDIUM"
                    ? "warning"
                    : "error"
              }
            >
              {sessionData.question.difficulty}
            </Badge>

            {/* Incremental Assessment Indicators */}
            {isIncrementalAssessment && (
              <Badge variant="primary" className="text-xs">
                Adaptive
              </Badge>
            )}
            {difficultyCalibrated && (
              <Badge variant="default" className="text-xs">
                AI-Calibrated
              </Badge>
            )}
            {buildingOn && currentQuestionIndex > 0 && (
              <span className="text-xs text-text-tertiary">
                → Building on: {buildingOn}
              </span>
            )}

            {/* Test Status */}
            {testResults.total > 0 && (
              <Badge
                variant={testResults.passed === testResults.total ? "success" : "default"}
                className="gap-1"
              >
                {testResults.passed === testResults.total ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {testResults.passed}/{testResults.total}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Time Elapsed / Time Remaining */}
            <div className="flex items-center gap-2 text-sm text-text-tertiary">
              <Clock className="h-4 w-4" />
              <span className="font-mono">{formatTime(timeRemaining)}</span>
            </div>

            {/* Actions */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleEvaluate}
              disabled={isEvaluating}
              loading={isEvaluating}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {isEvaluating ? "Evaluating..." : "Evaluate"}
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={handleSubmit}
              disabled={isSubmitting || timeRemaining === 0}
              loading={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit Assessment"}
            </Button>
          </div>
        </div>
      </div>

      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="bg-warning/10 border-b border-warning/30 px-6 py-3">
          <div className="flex items-center gap-3 text-warning">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">You're offline</p>
              <p className="text-xs text-warning/80">
                Changes are saved locally and will sync when your connection is restored.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" onLayout={handleHorizontalLayout}>
          {/* Left Sidebar - Problem/Files Tabs */}
          <Panel defaultSize={panelSizes.horizontal[0]} minSize={20} maxSize={35}>
            <div className="h-full border-r border-border flex flex-col bg-background">
              {/* Tabs */}
              <div className="border-b border-border bg-background-secondary flex">
                <button
                  onClick={() => handleTabChange("problem")}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${leftSidebarTab === "problem"
                    ? "text-primary border-b-2 border-primary bg-background"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-background-hover"
                    }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <span>Problem</span>
                  </div>
                </button>
                <button
                  onClick={() => handleTabChange("files")}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${leftSidebarTab === "files"
                    ? "text-primary border-b-2 border-primary bg-background"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-background-hover"
                    }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <FileCode className="h-4 w-4" />
                    <span>Files</span>
                  </div>
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden min-h-0">
                {leftSidebarTab === "problem" ? (
                  <ProblemPanel
                    title={sessionData.question.title}
                    description={sessionData.question.description}
                    difficulty={sessionData.question.difficulty.toLowerCase() as "easy" | "medium" | "hard"}
                    testCases={sessionData.question.testCases}
                    techStack={sessionData.techStack}
                  />
                ) : (
                  <FileTree
                    sessionId={candidateId}
                    files={sessionData.files}
                    selectedFile={selectedFile?.path}
                    onFileSelect={handleFileSelect}
                    onFileCreate={handleFileCreate}
                    onFileDelete={handleFileDelete}
                    onRefresh={handleRefreshFiles}
                    isRefreshing={isRefreshing}
                    className="h-full"
                  />
                )}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

          {/* Center - Editor and Terminal */}
          <Panel defaultSize={isAIChatOpen ? panelSizes.horizontal[1] : 73} minSize={40}>
            <PanelGroup direction="vertical" onLayout={handleVerticalLayout}>
              {/* Editor */}
              <Panel defaultSize={panelSizes.vertical[0]} minSize={30}>
                <div className="h-full flex flex-col border-b border-border">
                  {/* Editor Tabs */}
                  <div className="border-b border-border bg-background-secondary flex items-center">
                    <div className="flex items-center overflow-x-auto flex-1">
                      {openTabs.length === 0 ? (
                        // Show placeholder when no tabs
                        <div className="flex items-center gap-1 px-3 py-2 text-sm text-text-tertiary">
                          <Code2 className="h-4 w-4" />
                          <span>No file open</span>
                        </div>
                      ) : (
                        // Show all open tabs
                        openTabs.map((tab) => (
                          <div
                            key={tab.path}
                            onClick={() => handleTabSwitch(tab)}
                            className={cn(
                              "group flex items-center gap-1 px-3 py-2 text-sm cursor-pointer border-r border-border transition-colors",
                              selectedFile?.path === tab.path
                                ? "bg-background text-text-primary"
                                : "bg-background-secondary text-text-secondary hover:bg-background-tertiary"
                            )}
                          >
                            <Code2 className={cn(
                              "h-4 w-4",
                              selectedFile?.path === tab.path ? "text-primary" : "text-text-tertiary"
                            )} />
                            <span className="truncate max-w-[120px]">{tab.name}</span>
                            {tab.isDirty && (
                              <span className="w-2 h-2 rounded-full bg-primary ml-1" title="Unsaved changes" />
                            )}
                            <button
                              onClick={(e) => handleTabClose(tab.path, e)}
                              className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-background-hover transition-all"
                              title="Close tab"
                            >
                              <X className="h-3 w-3 text-text-tertiary hover:text-text-primary" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    {/* Auto-save status indicator */}
                    {openTabs.length > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-tertiary border-l border-border">
                        {saveStatus === "saving" && (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Saving...</span>
                          </>
                        )}
                        {saveStatus === "saved" && (
                          <>
                            <Check className="h-3 w-3 text-success" />
                            <span className="text-success">Saved</span>
                          </>
                        )}
                        {saveStatus === "idle" && (
                          <span className="text-text-muted">Auto-save on</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Editor */}
                  <div className="flex-1 min-h-0 relative">
                    {isFileLoading && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <span className="text-sm text-text-secondary">Loading file...</span>
                        </div>
                      </div>
                    )}
                    <CodeEditor
                      sessionId={candidateId}
                      questionId={sessionData.question.id}
                      value={code}
                      onChange={handleCodeChange}
                      language={sessionData.question.language as any}
                      fileName={selectedFile?.name}
                    />
                  </div>
                </div>
              </Panel>

              {/* Terminal resize handle - VS Code style */}
              <PanelResizeHandle className={cn(
                "h-1 bg-border hover:bg-primary transition-colors",
                isTerminalCollapsed && "hover:bg-primary cursor-row-resize"
              )} />

              {/* Terminal Panel - VS Code style collapsible */}
              <Panel
                ref={terminalPanelRef}
                defaultSize={panelSizes.vertical[1]}
                minSize={3}
                collapsible={true}
                collapsedSize={3}
                onCollapse={() => setIsTerminalCollapsed(true)}
                onExpand={() => setIsTerminalCollapsed(false)}
              >
                <div className="h-full flex flex-col bg-background">
                  {/* VS Code-style terminal header - clickable to toggle */}
                  <div
                    className={cn(
                      "border-t border-border bg-background-secondary px-2 flex items-center justify-between select-none",
                      isTerminalCollapsed ? "py-1 cursor-pointer hover:bg-background-tertiary" : "py-1.5"
                    )}
                    onClick={isTerminalCollapsed ? handleTerminalCollapse : undefined}
                    onDoubleClick={!isTerminalCollapsed ? handleTerminalCollapse : undefined}
                    title={isTerminalCollapsed ? "Click to expand" : "Double-click to collapse"}
                  >
                    {/* Left side - Terminal label with icon */}
                    <div className="flex items-center gap-1.5">
                      <TerminalIcon className="h-3.5 w-3.5 text-text-tertiary" />
                      <span className={cn(
                        "text-xs font-medium uppercase tracking-wider",
                        isTerminalCollapsed ? "text-text-tertiary" : "text-text-secondary"
                      )}>
                        Terminal
                      </span>
                      {showCompletionCard && !isTerminalCollapsed && (
                        <Badge variant="success" className="ml-2 animate-pulse text-[10px] py-0 px-1.5">
                          Ready!
                        </Badge>
                      )}
                    </div>

                    {/* Right side - VS Code style action buttons */}
                    <div className="flex items-center gap-0.5">
                      {/* Toggle button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTerminalCollapse();
                        }}
                        className="p-1 rounded hover:bg-background-hover transition-colors text-text-tertiary hover:text-text-secondary"
                        title={isTerminalCollapsed ? "Maximize Panel" : "Minimize Panel"}
                      >
                        {isTerminalCollapsed ? (
                          <Maximize2 className="h-3.5 w-3.5" />
                        ) : (
                          <Minimize2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Terminal content - hidden when collapsed to preserve history */}
                  <div className={cn(
                    "flex-1 min-h-0 relative",
                    isTerminalCollapsed && "hidden"
                  )}>
                    <Terminal sessionId={candidateId} />

                    {/* Completion Card Overlay */}
                    {showCompletionCard && (
                      <div className="absolute bottom-4 left-4 right-4 z-10">
                        <QuestionCompletionCard
                          testsPassed={testResults.passed}
                          testsTotal={testResults.total}
                          timeSpent={questionTimeElapsed}
                          score={Math.round((testResults.passed / testResults.total) * 100)}
                          onNext={currentQuestionIndex + 1 >= totalQuestions ? handleSubmit : handleNextQuestion}
                          isLastQuestion={currentQuestionIndex + 1 >= totalQuestions}
                          isLoading={isLoadingNextQuestion || isSubmitting}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          {/* Right Sidebar - AI Chat / Evaluation */}
          {isAIChatOpen && (
            <>
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />
              <Panel defaultSize={panelSizes.horizontal[2]} minSize={20} maxSize={50}>
                <div className="h-full border-l border-border flex flex-col bg-background">
                  {/* Tab Headers */}
                  <div className="border-b border-border bg-background-secondary flex">
                    <button
                      onClick={() => setRightPanelTab("chat")}
                      className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${rightPanelTab === "chat"
                        ? "text-primary border-b-2 border-primary bg-background"
                        : "text-text-tertiary hover:text-text-secondary hover:bg-background-hover"
                        }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <span>AI Chat</span>
                      </div>
                    </button>
                    <button
                      onClick={() => setRightPanelTab("evaluation")}
                      className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${rightPanelTab === "evaluation"
                        ? "text-primary border-b-2 border-primary bg-background"
                        : "text-text-tertiary hover:text-text-secondary hover:bg-background-hover"
                        }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <ClipboardCheck className="h-4 w-4" />
                        <span>Evaluation</span>
                        {evaluationResult?.passed && (
                          <CheckCircle2 className="h-3 w-3 text-success" />
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Tab Content - Both panels rendered but only active one visible */}
                  {/* This keeps both mounted to preserve state when switching tabs */}
                  <div className="flex-1 min-h-0 relative">
                    <div className={cn("h-full", rightPanelTab !== "chat" && "hidden")}>
                      <AIChat
                        ref={aiChatRef}
                        sessionId={candidateId}
                        onFileModified={async (path) => {
                          // Always refresh file tree when AI modifies files
                          await refreshFiles();

                          // Fetch the modified file content (smart refresh - only this file)
                          try {
                            const response = await fetch(
                              `/api/interview/${candidateId}/files?path=${encodeURIComponent(path)}`
                            );
                            if (response.ok) {
                              const responseJson = await response.json();
                              const data = responseJson.data || responseJson;
                              const fileContent = typeof data.content === 'string' ? data.content : '';

                              // Update the file cache with new content
                              setFileCache(prev => new Map(prev).set(path, fileContent));
                              console.log(`[FileCache] Updated cache for AI-modified file: ${path}`);

                              // Update code editor if this file is currently selected
                              if (selectedFile && selectedFile.path === path) {
                                setCode(fileContent);
                              }

                              // Update tab content if file is open
                              setOpenTabs(prev => prev.map(tab =>
                                tab.path === path ? { ...tab, content: fileContent, isDirty: false } : tab
                              ));
                            }
                          } catch (err) {
                            console.error("Failed to reload file:", err);
                          }
                        }}
                        onTestResultsUpdated={(results) => {
                          // Update test results display
                          setTestResults({
                            passed: results.passed || 0,
                            total: results.total || 0,
                          });
                        }}
                        onSuggestNextQuestion={(suggestion) => {
                          // AI suggests the candidate is ready - but completion requires evaluation
                          // Don't auto-show completion card; candidate must run evaluation
                          console.log("AI suggests evaluation:", suggestion.reason);
                          // Switch to evaluation tab to prompt candidate to evaluate
                          setRightPanelTab("evaluation");
                        }}
                      />
                    </div>
                    <div className={cn("h-full", rightPanelTab !== "evaluation" && "hidden")}>
                      <EvaluationPanel
                        evaluationResult={evaluationResult}
                        isEvaluating={isEvaluating}
                        onEvaluate={handleEvaluate}
                        onProceed={currentQuestionIndex + 1 >= totalQuestions ? handleSubmit : handleNextQuestion}
                        isLastQuestion={currentQuestionIndex + 1 >= totalQuestions}
                        passingThreshold={passingThreshold}
                      />
                    </div>
                  </div>
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* Toggle AI Chat */}
      {!isAIChatOpen && (
        <button
          onClick={() => setIsAIChatOpen(true)}
          className="fixed bottom-4 right-4 h-12 w-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-hover transition-colors"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}

      {/* Keyboard Shortcuts Panel */}
      <KeyboardShortcutsPanel shortcuts={defaultInterviewShortcuts} showOnFirstVisit={true} />
    </div>
  );
}

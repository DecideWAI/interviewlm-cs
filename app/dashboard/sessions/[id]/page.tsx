"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  ArrowLeft,
  Zap,
  Code2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  Brain,
  MessageSquare,
  Users,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Shared components
import { InterviewLayout } from "@/components/interview/InterviewLayout";
import { FileTree, FileNode } from "@/components/interview/FileTree";
import { ProblemPanel } from "@/components/interview/ProblemPanel";

// Dynamically import CodeMirror to avoid SSR issues
const CodeEditor = dynamic(
  () => import("@/components/interview/CodeEditor").then((mod) => mod.CodeEditor),
  { ssr: false }
);

// Types
interface TimelineEvent {
  id: string;
  timestamp: string;
  type: string;
  category: string;
  data: any;
  checkpoint?: boolean;
}

interface EvaluationData {
  id: string;
  overallScore: number;
  confidence: number;
  codeQualityScore: number;
  codeQualityEvidence: any;
  codeQualityConfidence: number;
  problemSolvingScore: number;
  problemSolvingEvidence: any;
  problemSolvingConfidence: number;
  aiCollaborationScore: number;
  aiCollaborationEvidence: any;
  aiCollaborationConfidence: number;
  communicationScore: number;
  communicationEvidence: any;
  communicationConfidence: number;
  hiringRecommendation: string | null;
  hiringConfidence: number | null;
  hiringReasoning: any;
  expertiseLevel: string | null;
  expertiseGrowth: number | null;
  expertiseGrowthTrend: string | null;
}

interface SessionData {
  session: {
    id: string;
    candidateId: string;
    startTime: string;
    endTime: string | null;
    duration: number | null;
    status: string;
    eventCount: number;
    trackedFiles?: string[]; // Array of file paths created during session
  };
  candidate: {
    id: string;
    name: string;
    email: string;
    status: string;
    overallScore: number | null;
  };
  assessment: {
    title: string;
    role: string;
    seniority: string;
    duration: number;
  };
  questions: Array<{
    title: string;
    description: string;
    difficulty: string;
    language: string;
    requirements: string[];
    starterCode: any;
    testCases: any;
    score: number | null;
  }>;
  evaluation: EvaluationData | null;
  timeline: TimelineEvent[];
  metrics: {
    totalEvents: number;
    claudeInteractions: number;
    codeSnapshots: number;
    testRuns: number;
    totalTokens: number;
    avgPromptQuality: number;
    testPassRate: number;
    codeActivityRate: number;
  };
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  type?: string;
}

interface PlaybackState {
  isPlaying: boolean;
  currentIndex: number;
  playbackSpeed: number;
  currentTime: number;
  skipInactivity: boolean;
}

interface ReplayState {
  code: string;
  files: FileNode[];
  openTabs: Array<{ id: string; name: string; path: string; content: string; language: string }>;
  activeTabId: string | null;
  terminalLines: string[];
  chatMessages: Message[];
  currentFile: string;
}

// Simple Read-Only Chat Component for Replay
function ReplayChat({ messages }: { messages: Message[] }) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-12 w-12 text-text-tertiary mb-3" />
            <p className="text-sm text-text-secondary">No AI interactions at this point in time</p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id}>
              {message.type === "tool_use" ? null : message.type === "tool_result" || message.type === "tool_error" ? (
                <div className="flex items-start gap-2 my-2">
                  <div className="flex-1 text-sm bg-background-tertiary border border-border rounded p-2">
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs text-text-secondary">
                      {message.content}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className={`flex gap-3 group ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 ${message.role === "user"
                    ? "bg-primary text-white"
                    : "bg-background-tertiary border border-border"
                  }`}>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                        {message.content}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

// Read-Only Evaluation Display for Replay
function ReplayEvaluation({ evaluation }: { evaluation: EvaluationData | null }) {
  if (!evaluation) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-12 w-12 text-text-tertiary mb-3" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">No Evaluation Available</h3>
        <p className="text-sm text-text-secondary max-w-xs">
          This session has not been evaluated yet or the evaluation data is not available.
        </p>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-error";
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 80) return "bg-success";
    if (score >= 60) return "bg-warning";
    return "bg-error";
  };

  const getRecommendationDisplay = (recommendation: string | null) => {
    switch (recommendation) {
      case "strong_yes":
        return { label: "Strong Yes", color: "text-success", icon: <ThumbsUp className="h-4 w-4" /> };
      case "yes":
        return { label: "Yes", color: "text-success", icon: <ThumbsUp className="h-4 w-4" /> };
      case "maybe":
        return { label: "Maybe", color: "text-warning", icon: <AlertCircle className="h-4 w-4" /> };
      case "no":
        return { label: "No", color: "text-error", icon: <ThumbsDown className="h-4 w-4" /> };
      case "strong_no":
        return { label: "Strong No", color: "text-error", icon: <ThumbsDown className="h-4 w-4" /> };
      default:
        return { label: "Not Evaluated", color: "text-text-tertiary", icon: <AlertCircle className="h-4 w-4" /> };
    }
  };

  const dimensions = [
    { key: "codeQuality", name: "Code Quality", score: evaluation.codeQualityScore, icon: <Code2 className="h-4 w-4" /> },
    { key: "problemSolving", name: "Problem Solving", score: evaluation.problemSolvingScore, icon: <Brain className="h-4 w-4" /> },
    { key: "aiCollaboration", name: "AI Collaboration", score: evaluation.aiCollaborationScore, icon: <MessageSquare className="h-4 w-4" /> },
    { key: "communication", name: "Communication", score: evaluation.communicationScore, icon: <Users className="h-4 w-4" /> },
  ];

  const recommendation = getRecommendationDisplay(evaluation.hiringRecommendation);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Overall Score */}
        <div className={cn(
          "rounded-lg p-4 border",
          evaluation.overallScore >= 70 ? "bg-success/5 border-success/20" : "bg-warning/5 border-warning/20"
        )}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {evaluation.overallScore >= 70 ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <AlertCircle className="h-5 w-5 text-warning" />
              )}
              <span className="text-sm font-medium text-text-primary">Overall Score</span>
            </div>
            <span className={cn("text-2xl font-bold", getScoreColor(evaluation.overallScore))}>
              {evaluation.overallScore}
              <span className="text-sm text-text-tertiary">/100</span>
            </span>
          </div>
          <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", getScoreBarColor(evaluation.overallScore))}
              style={{ width: `${evaluation.overallScore}%` }}
            />
          </div>
          <p className="text-xs text-text-tertiary mt-2">
            Confidence: {Math.round(evaluation.confidence * 100)}%
          </p>
        </div>

        {/* Hiring Recommendation */}
        {evaluation.hiringRecommendation && (
          <div className="rounded-lg p-4 border border-border bg-background-secondary">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">Hiring Recommendation</span>
              <div className={cn("flex items-center gap-2", recommendation.color)}>
                {recommendation.icon}
                <span className="font-semibold">{recommendation.label}</span>
              </div>
            </div>
          </div>
        )}

        {/* Dimension Scores */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-text-tertiary" />
            Dimension Scores
          </h4>
          <div className="space-y-2">
            {dimensions.map(({ key, name, score, icon }) => (
              <div key={key} className="bg-background-secondary rounded-lg p-3 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "p-1 rounded",
                      score >= 70 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    )}>
                      {icon}
                    </span>
                    <span className="text-sm text-text-primary">{name}</span>
                  </div>
                  <span className={cn("text-sm font-semibold", getScoreColor(score))}>
                    {score}/100
                  </span>
                </div>
                <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-300", getScoreBarColor(score))}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Expertise Level */}
        {evaluation.expertiseLevel && (
          <div className="rounded-lg p-4 border border-border bg-background-secondary">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">Expertise Level</span>
              <Badge variant="primary" className="capitalize">
                {evaluation.expertiseLevel}
              </Badge>
            </div>
            {evaluation.expertiseGrowthTrend && (
              <p className="text-xs text-text-tertiary mt-2">
                Trend: <span className="capitalize">{evaluation.expertiseGrowthTrend}</span>
                {evaluation.expertiseGrowth && ` (${evaluation.expertiseGrowth > 0 ? '+' : ''}${evaluation.expertiseGrowth.toFixed(1)}%)`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SessionReplayPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [initialState, setInitialState] = useState<{
    code: string;
    fileName: string;
    language: string;
    files: FileNode[];
    tabs: ReplayState["openTabs"];
  } | null>(null);

  // Map of file paths to their latest content (built from code_snapshots)
  const [fileContentMap, setFileContentMap] = useState<Map<string, string>>(new Map());

  // Map of file paths to their GCS checksums (for lazy loading from GCS)
  const [fileChecksumMap, setFileChecksumMap] = useState<Map<string, string>>(new Map());

  // Set of checksums currently being fetched (to avoid duplicate requests)
  const [fetchingChecksums, setFetchingChecksums] = useState<Set<string>>(new Set());

  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    currentIndex: 0,
    playbackSpeed: 1,
    currentTime: 0,
    skipInactivity: true,
  });

  const [replayState, setReplayState] = useState<ReplayState>({
    code: "",
    files: [],
    openTabs: [],
    activeTabId: null,
    terminalLines: [],
    chatMessages: [],
    currentFile: "solution.ts",
  });

  const [leftSidebarTab, setLeftSidebarTab] = useState<"problem" | "files">("problem");
  const [rightPanelTab, setRightPanelTab] = useState<"chat" | "evaluation">("chat");

  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch session data
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) throw new Error("Failed to fetch session");

        const data: SessionData = await response.json();
        setSessionData(data);

        // Build file content map from all code_snapshots in timeline
        // This gives us the latest content for each file
        const contentMap = new Map<string, string>();
        const checksumMap = new Map<string, string>();

        data.timeline.forEach((event) => {
          if (event.type === "code_snapshot") {
            const fileName = event.data.fileName || event.data.fileId;
            if (fileName) {
              // Normalize path
              const path = fileName.startsWith('/') ? fileName : `/${fileName}`;
              const justName = fileName.split('/').pop() || fileName;

              // If fullContent is available, use it directly
              if (event.data.fullContent) {
                contentMap.set(path, event.data.fullContent);
                contentMap.set(justName, event.data.fullContent);
              }
              // If contentHash is available, store for GCS lookup
              else if (event.data.contentHash) {
                checksumMap.set(path, event.data.contentHash);
                checksumMap.set(justName, event.data.contentHash);
              }
            }
          }
        });

        setFileContentMap(contentMap);
        setFileChecksumMap(checksumMap);

        // Initialize replay state with starter code
        if (data.questions.length > 0) {
          const question = data.questions[0];
          const starterCode = question.starterCode;
          let initialCode = "";

          // Determine generic filename based on language
          const lang = (question.language || "typescript").toLowerCase();
          const extMap: Record<string, string> = {
            python: "py",
            javascript: "js",
            typescript: "ts",
            go: "go",
            java: "java",
            cplusplus: "cpp",
          };
          const ext = extMap[lang] || "txt";
          let initialFileName = `solution.${ext}`;

          // Handle array or string format
          if (Array.isArray(starterCode) && starterCode.length > 0) {
            initialCode = starterCode[0].content || "";
            initialFileName = starterCode[0].fileName || initialFileName;
          } else if (typeof starterCode === 'string') {
            initialCode = starterCode;
          }

          // Build file list from trackedFiles (authoritative source)
          // and add starter code file if not already included
          const trackedFiles = data.session.trackedFiles || [];
          const allFiles = new Set<string>(trackedFiles);

          // Ensure starter code file is in the list
          const starterPath = initialFileName.startsWith('/') ? initialFileName : `/${initialFileName}`;
          allFiles.add(starterPath);

          // Convert to FileNode array
          const initialFiles: FileNode[] = Array.from(allFiles).map((filePath, index) => {
            const name = filePath.split('/').pop() || filePath;
            return {
              id: `file-${index}`,
              name,
              type: "file" as const,
              path: filePath.startsWith('/') ? filePath : `/${filePath}`
            };
          });

          const initialTabs = [{
            id: initialFileName,
            name: initialFileName,
            path: starterPath,
            content: initialCode,
            language: question.language || "typescript"
          }];

          // Store initial state for resets during seeking
          setInitialState({
            code: initialCode,
            fileName: initialFileName,
            language: question.language || "typescript",
            files: initialFiles,
            tabs: initialTabs,
          });

          setReplayState({
            code: initialCode,
            currentFile: initialFileName,
            files: initialFiles,
            openTabs: initialTabs,
            activeTabId: initialFileName,
            terminalLines: [],
            chatMessages: [],
          });
        }

        setLoading(false);
      } catch (err) {
        console.error("Error fetching session:", err);
        setError("Failed to load session recording");
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  // Apply timeline event to replay state
  const applyEvent = useCallback((event: TimelineEvent) => {
    setReplayState((prev) => {
      const newState = { ...prev };

      switch (event.type) {
        case "code_snapshot":
          // Get fileName from various possible locations in the event data
          const fileName = event.data.fileName || event.data.fileId || prev.currentFile;

          if (fileName) {
            const fileExists = prev.files.some(f => f.name === fileName || f.path === `/${fileName}` || f.path === fileName);

            // Add new file to tree if doesn't exist (even without content)
            if (!fileExists) {
              newState.files = [...prev.files, {
                id: fileName,
                name: fileName,
                type: "file" as const,
                path: fileName.startsWith('/') ? fileName : `/${fileName}`
              }];
            }

            // Only handle content if fullContent is available
            if (event.data.fullContent) {
              // Add or update tab for the file
              const existingTab = newState.openTabs.find(t => t.name === fileName);
              if (!existingTab) {
                newState.openTabs = [...newState.openTabs, {
                  id: fileName,
                  name: fileName,
                  path: fileName.startsWith('/') ? fileName : `/${fileName}`,
                  content: event.data.fullContent,
                  language: event.data.language || "typescript"
                }];
              } else {
                // Update tab content
                newState.openTabs = newState.openTabs.map(tab =>
                  tab.name === fileName ? { ...tab, content: event.data.fullContent } : tab
                );
              }

              // If this is the active file, update the code view
              if (prev.currentFile === fileName) {
                newState.code = event.data.fullContent;
              }
            }
          }
          break;

        case "code_edit":
          if (event.data.content) {
            newState.code = event.data.content;
          }
          break;

        case "terminal_output":
          if (event.data.output) {
            const line = event.data.command ? `$ ${event.data.command}\n${event.data.output}` : event.data.output;
            newState.terminalLines = [...prev.terminalLines, line];
          }
          break;

        case "ai_message":
          const newMessage: Message = {
            id: event.id,
            role: event.data.role,
            content: event.data.content,
            timestamp: new Date(event.timestamp),
            type: event.data.type,
          };
          if (!prev.chatMessages.some(m => m.id === newMessage.id)) {
            newState.chatMessages = [...prev.chatMessages, newMessage];
          }
          break;

        case "conversation_reset":
          newState.chatMessages = [];
          break;

        case "file_write":
        case "file_create":
          // Handle file creation events
          const fileWritePath = event.data.filePath || event.data.path || event.data.fileName;
          if (fileWritePath) {
            const writeName = fileWritePath.split('/').pop() || fileWritePath;
            const writeFileExists = prev.files.some(f =>
              f.name === writeName || f.path === fileWritePath || f.path === `/${writeName}`
            );

            if (!writeFileExists) {
              newState.files = [...prev.files, {
                id: writeName,
                name: writeName,
                type: "file" as const,
                path: fileWritePath.startsWith('/') ? fileWritePath : `/${fileWritePath}`
              }];
            }
          }
          break;

        default:
          // Check if this event has file information we should track
          if (event.data && (event.data.fileName || event.data.filePath || event.data.fileId)) {
            const genericFileName = event.data.fileName || event.data.filePath || event.data.fileId;
            if (genericFileName) {
              const genericName = genericFileName.split('/').pop() || genericFileName;
              const genericExists = prev.files.some(f =>
                f.name === genericName || f.path === genericFileName || f.path === `/${genericName}`
              );

              if (!genericExists) {
                newState.files = [...prev.files, {
                  id: genericName,
                  name: genericName,
                  type: "file" as const,
                  path: genericFileName.startsWith('/') ? genericFileName : `/${genericFileName}`
                }];
              }
            }
          }
          break;
      }

      return newState;
    });
  }, []);

  // Playback Logic
  useEffect(() => {
    if (!playback.isPlaying || !sessionData) return;

    playbackTimerRef.current = setInterval(() => {
      setPlayback((prev) => {
        if (prev.currentIndex >= sessionData.timeline.length - 1) {
          return { ...prev, isPlaying: false };
        }

        const nextIndex = prev.currentIndex + 1;
        const nextEvent = sessionData.timeline[nextIndex];

        applyEvent(nextEvent);

        const startTime = new Date(sessionData.session.startTime).getTime();
        const eventTime = new Date(nextEvent.timestamp).getTime();

        return {
          ...prev,
          currentIndex: nextIndex,
          currentTime: eventTime - startTime,
        };
      });
    }, playback.skipInactivity ? 1000 / playback.playbackSpeed : 3000);

    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [playback.isPlaying, playback.playbackSpeed, playback.skipInactivity, sessionData, applyEvent]);

  // Controls
  const togglePlayPause = () => setPlayback(p => ({ ...p, isPlaying: !p.isPlaying }));

  const seekToIndex = useCallback((index: number) => {
    if (!sessionData || !initialState) return;
    setPlayback(p => ({ ...p, isPlaying: false }));

    // FIXED: Reset to initial state before re-applying events
    setReplayState({
      code: initialState.code,
      files: [...initialState.files],
      openTabs: [...initialState.tabs],
      activeTabId: initialState.fileName,
      terminalLines: [],
      chatMessages: [],
      currentFile: initialState.fileName,
    });

    // Re-apply events from 0 to target index
    // Use setTimeout to ensure state reset is complete
    setTimeout(() => {
      for (let i = 0; i <= index; i++) {
        applyEvent(sessionData.timeline[i]);
      }

      const startTime = new Date(sessionData.session.startTime).getTime();
      const eventTime = new Date(sessionData.timeline[index].timestamp).getTime();

      setPlayback(p => ({
        ...p,
        currentIndex: index,
        currentTime: eventTime - startTime
      }));
    }, 0);
  }, [sessionData, initialState, applyEvent]);

  // Fetch file content from GCS by checksum
  const fetchGcsContent = useCallback(async (checksum: string, fileName: string) => {
    if (!sessionData || fetchingChecksums.has(checksum)) return null;

    setFetchingChecksums(prev => new Set(prev).add(checksum));

    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/files?candidateId=${sessionData.candidate.id}&checksum=${checksum}`
      );

      if (!response.ok) {
        console.error(`[GCS] Failed to fetch content for ${fileName}:`, response.status);
        return null;
      }

      const data = await response.json();
      const content = data.content;

      if (content) {
        // Update the content map with the fetched content
        setFileContentMap(prev => {
          const newMap = new Map(prev);
          const path = fileName.startsWith('/') ? fileName : `/${fileName}`;
          newMap.set(path, content);
          newMap.set(fileName, content);
          return newMap;
        });
        return content;
      }

      return null;
    } catch (error) {
      console.error(`[GCS] Error fetching content for ${fileName}:`, error);
      return null;
    } finally {
      setFetchingChecksums(prev => {
        const newSet = new Set(prev);
        newSet.delete(checksum);
        return newSet;
      });
    }
  }, [sessionId, sessionData, fetchingChecksums]);

  const handleFileSelect = async (file: FileNode) => {
    // Try to find content from multiple sources:
    // 1. Already open tabs
    // 2. File content map (built from code_snapshots)
    // 3. GCS fetch if checksum is available
    // 4. Empty string as fallback

    let content = replayState.openTabs.find(t => t.path === file.path || t.name === file.name)?.content;

    if (!content) {
      // Try to find in content map by path or name
      content = fileContentMap.get(file.path) || fileContentMap.get(file.name);
    }

    // If still no content, check if we have a checksum for GCS lookup
    if (!content) {
      const checksum = fileChecksumMap.get(file.path) || fileChecksumMap.get(file.name);
      if (checksum) {
        // Set file as active first with loading state
        setReplayState(prev => ({
          ...prev,
          currentFile: file.name,
          code: "" // Will be updated when content is fetched
        }));

        // Fetch from GCS
        const gcsContent = await fetchGcsContent(checksum, file.name);
        if (gcsContent) {
          content = gcsContent;
        }
      }
    }

    // If we found content and don't have a tab, add one
    if (content && !replayState.openTabs.some(t => t.path === file.path || t.name === file.name)) {
      setReplayState(prev => ({
        ...prev,
        currentFile: file.name,
        code: content,
        openTabs: [...prev.openTabs, {
          id: file.name,
          name: file.name,
          path: file.path,
          content: content,
          language: getLanguageFromFileName(file.name)
        }]
      }));
    } else {
      setReplayState(prev => ({
        ...prev,
        currentFile: file.name,
        code: content || ""
      }));
    }
  };

  // Helper to determine language from file extension
  const getLanguageFromFileName = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      py: "python",
      js: "javascript",
      ts: "typescript",
      go: "go",
      java: "java",
      cpp: "cplusplus",
      md: "markdown",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      txt: "text",
    };
    return langMap[ext || ""] || "text";
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><Spinner size="lg" /></div>;
  if (error || !sessionData) return <div className="flex h-screen items-center justify-center bg-background text-text-primary">{error || "Session not found"}</div>;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-text-primary">{sessionData.candidate.name}</h1>
              <Badge variant="outline" className="text-xs">Replay</Badge>
            </div>
            <p className="text-xs text-text-secondary">{sessionData.assessment.title}</p>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => seekToIndex(Math.max(0, playback.currentIndex - 1))}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button variant="primary" size="sm" onClick={togglePlayPause}>
            {playback.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => seekToIndex(Math.min(sessionData.timeline.length - 1, playback.currentIndex + 1))}>
            <SkipForward className="h-4 w-4" />
          </Button>

          <span className="text-xs font-mono ml-2 w-20 text-text-secondary">
            {formatTime(playback.currentTime)}
          </span>

          <input
            type="range"
            min={0}
            max={sessionData.timeline.length - 1}
            value={playback.currentIndex}
            onChange={(e) => seekToIndex(parseInt(e.target.value))}
            className="w-32 h-1 bg-border rounded-lg appearance-none cursor-pointer"
          />

          <span className="text-xs text-text-tertiary">
            {playback.currentIndex + 1}/{sessionData.timeline.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={playback.skipInactivity ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setPlayback(p => ({ ...p, skipInactivity: !p.skipInactivity }))}
            title="Skip Inactivity"
          >
            <Zap className={`h-3 w-3 ${playback.skipInactivity ? "text-yellow-400" : ""}`} />
            <span className="ml-1 text-xs">Smart Skip</span>
          </Button>
          <Badge variant="outline" className="text-xs">
            {playback.playbackSpeed}x
          </Badge>
        </div>
      </div>

      {/* Main Layout */}
      <InterviewLayout
        storageKey={`replay-${sessionId}`}
        mode="replay"
        leftSidebarTab={leftSidebarTab}
        onLeftSidebarTabChange={setLeftSidebarTab}
        problemContent={
          <ProblemPanel
            title={sessionData.questions[0]?.title || "Problem"}
            description={sessionData.questions[0]?.description || ""}
            difficulty={(sessionData.questions[0]?.difficulty?.toLowerCase() as "easy" | "medium" | "hard") || "medium"}
            testCases={sessionData.questions[0]?.testCases}
          />
        }
        filesContent={
          <FileTree
            files={replayState.files}
            selectedFile={replayState.currentFile}
            onFileSelect={handleFileSelect}
            sessionId={sessionId}
            className="h-full"
          />
        }
        editorContent={
          <>
            {/* Editor Tabs */}
            <div className="border-b border-border bg-background-secondary flex items-center">
              <div className="flex items-center overflow-x-auto flex-1">
                {replayState.openTabs.map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => setReplayState(prev => ({ ...prev, currentFile: tab.name, code: tab.content }))}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 text-sm border-r border-border cursor-pointer transition-colors",
                      replayState.currentFile === tab.name
                        ? "bg-background text-primary"
                        : "bg-background-secondary text-text-secondary hover:bg-background-tertiary"
                    )}
                  >
                    <Code2 className={cn("h-4 w-4", replayState.currentFile === tab.name ? "text-primary" : "text-text-tertiary")} />
                    <span>{tab.name}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Editor */}
            <div className="flex-1 min-h-0 relative">
              {/* Loading state when fetching from GCS */}
              {!replayState.code && replayState.currentFile && fetchingChecksums.size > 0 && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90">
                  <div className="text-center p-6">
                    <Spinner className="mx-auto mb-3" />
                    <h3 className="text-sm font-medium text-text-primary mb-1">Loading File Content</h3>
                    <p className="text-xs text-text-secondary max-w-xs">
                      Fetching "{replayState.currentFile}" from storage...
                    </p>
                  </div>
                </div>
              )}
              {/* Content not available state */}
              {!replayState.code && replayState.currentFile && fetchingChecksums.size === 0 && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90">
                  <div className="text-center p-6">
                    <AlertCircle className="h-12 w-12 text-text-tertiary mx-auto mb-3" />
                    <h3 className="text-sm font-medium text-text-primary mb-1">Content Not Available</h3>
                    <p className="text-xs text-text-secondary max-w-xs">
                      File content for "{replayState.currentFile}" was not recorded in this session.
                    </p>
                  </div>
                </div>
              )}
              <CodeEditor
                value={replayState.code}
                language={(sessionData.questions[0]?.language as "typescript" | "javascript" | "python" | "go") || "typescript"}
                readOnly={true}
                onChange={() => {}}
              />
            </div>
          </>
        }
        terminalContent={
          <div className="h-full bg-black p-2 font-mono text-xs overflow-auto">
            {replayState.terminalLines.length === 0 ? (
              <div className="text-gray-500 italic">No terminal output at this point in time</div>
            ) : (
              replayState.terminalLines.map((line, i) => (
                <div key={i} className="text-green-400 whitespace-pre-wrap mb-1">{line}</div>
              ))
            )}
          </div>
        }
        chatContent={<ReplayChat messages={replayState.chatMessages} />}
        evaluationContent={<ReplayEvaluation evaluation={sessionData.evaluation} />}
        rightPanelTab={rightPanelTab}
        onRightPanelTabChange={setRightPanelTab}
        showEvaluationBadge={!!sessionData.evaluation}
      />
    </div>
  );
}

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  if (h > 0) return `${h}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

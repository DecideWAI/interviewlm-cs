"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  FastForward,
  Clock,
  User,
  Award,
  MessageSquare,
  Code2,
  Terminal as TerminalIcon,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import dynamic from "next/dynamic";

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

interface SessionData {
  session: {
    id: string;
    candidateId: string;
    startTime: string;
    endTime: string | null;
    duration: number | null;
    status: string;
    eventCount: number;
  };
  candidate: {
    id: string;
    name: string;
    email: string;
    status: string;
    overallScore: number | null;
    codingScore: number | null;
    communicationScore: number | null;
    problemSolvingScore: number | null;
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

interface PlaybackState {
  isPlaying: boolean;
  currentIndex: number;
  playbackSpeed: number;
  currentTime: number; // milliseconds from start
}

// Helper to validate language type
function isValidLanguage(lang: string | undefined): lang is "javascript" | "typescript" | "python" | "go" {
  return lang === "javascript" || lang === "typescript" || lang === "python" || lang === "go";
}

interface ReplayState {
  code: string;
  terminalOutput: string[];
  chatMessages: Array<{ role: string; content: string; timestamp: string }>;
  currentFile: string;
  testResults: Array<{ name: string; passed: boolean; output?: string }>;
}

export default function SessionReplayPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);

  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    currentIndex: 0,
    playbackSpeed: 1,
    currentTime: 0,
  });

  const [replayState, setReplayState] = useState<ReplayState>({
    code: "",
    terminalOutput: [],
    chatMessages: [],
    currentFile: "solution.js",
    testResults: [],
  });

  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch session data
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);

        if (!response.ok) {
          throw new Error("Failed to fetch session");
        }

        const data: SessionData = await response.json();
        setSessionData(data);

        // Initialize replay state with starter code
        if (data.questions.length > 0) {
          const starterCode = data.questions[0].starterCode;
          if (Array.isArray(starterCode) && starterCode.length > 0) {
            setReplayState((prev) => ({
              ...prev,
              code: starterCode[0].content || "",
              currentFile: starterCode[0].fileName || "solution.js",
            }));
          }
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

  // Playback loop
  useEffect(() => {
    if (!playback.isPlaying || !sessionData) return;

    playbackTimerRef.current = setInterval(() => {
      setPlayback((prev) => {
        if (prev.currentIndex >= sessionData.timeline.length - 1) {
          // Reached end of timeline
          return { ...prev, isPlaying: false };
        }

        const nextIndex = prev.currentIndex + 1;
        const nextEvent = sessionData.timeline[nextIndex];

        // Apply event to replay state
        applyEvent(nextEvent);

        // Update current time
        const startTime = new Date(sessionData.session.startTime).getTime();
        const eventTime = new Date(nextEvent.timestamp).getTime();
        const currentTime = eventTime - startTime;

        return {
          ...prev,
          currentIndex: nextIndex,
          currentTime,
        };
      });
    }, 1000 / playback.playbackSpeed); // Adjust speed

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    };
  }, [playback.isPlaying, playback.playbackSpeed, sessionData]);

  // Apply timeline event to replay state
  const applyEvent = useCallback((event: TimelineEvent) => {
    setReplayState((prev) => {
      const newState = { ...prev };

      switch (event.type) {
        case "code_snapshot":
          newState.code = event.data.fullContent || prev.code;
          newState.currentFile = event.data.fileName || prev.currentFile;
          break;

        case "code_edit":
          newState.code = event.data.content || prev.code;
          newState.currentFile = event.data.fileName || prev.currentFile;
          break;

        case "terminal_output":
          newState.terminalOutput = [
            ...prev.terminalOutput,
            event.data.output || "",
          ];
          break;

        case "ai_message":
          newState.chatMessages = [
            ...prev.chatMessages,
            {
              role: event.data.role,
              content: event.data.content,
              timestamp: event.timestamp,
            },
          ];
          break;

        case "test_result":
          const existingResults = prev.testResults.filter(
            (r) => r.name !== event.data.testName
          );
          newState.testResults = [
            ...existingResults,
            {
              name: event.data.testName,
              passed: event.data.passed,
              output: event.data.output,
            },
          ];
          break;

        default:
          break;
      }

      return newState;
    });
  }, []);

  // Playback controls
  const togglePlayPause = () => {
    setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const changeSpeed = () => {
    setPlayback((prev) => ({
      ...prev,
      playbackSpeed: prev.playbackSpeed >= 4 ? 0.5 : prev.playbackSpeed * 2,
    }));
  };

  const skipForward = () => {
    if (!sessionData) return;
    const newIndex = Math.min(
      playback.currentIndex + 10,
      sessionData.timeline.length - 1
    );
    seekToIndex(newIndex);
  };

  const skipBackward = () => {
    const newIndex = Math.max(playback.currentIndex - 10, 0);
    seekToIndex(newIndex);
  };

  const seekToIndex = (index: number) => {
    if (!sessionData) return;

    // Pause playback
    setPlayback((prev) => ({ ...prev, isPlaying: false }));

    // Reset state and replay from beginning to target index
    const starterCode = sessionData.questions[0]?.starterCode;
    setReplayState({
      code: Array.isArray(starterCode) ? starterCode[0]?.content || "" : "",
      terminalOutput: [],
      chatMessages: [],
      currentFile: Array.isArray(starterCode) ? starterCode[0]?.fileName || "solution.js" : "solution.js",
      testResults: [],
    });

    // Apply all events up to target index
    for (let i = 0; i <= index; i++) {
      applyEvent(sessionData.timeline[i]);
    }

    const startTime = new Date(sessionData.session.startTime).getTime();
    const eventTime = new Date(sessionData.timeline[index].timestamp).getTime();
    const currentTime = eventTime - startTime;

    setPlayback((prev) => ({
      ...prev,
      currentIndex: index,
      currentTime,
    }));
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Card className="p-6">
          <p className="text-text-secondary">{error || "Session not found"}</p>
          <Button
            variant="primary"
            onClick={() => router.push("/dashboard")}
            className="mt-4"
          >
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const totalDuration = sessionData.session.duration
    ? sessionData.session.duration * 1000
    : playback.currentTime;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-text-primary">
                  Session Replay
                </h1>
                <p className="text-sm text-text-secondary">
                  {sessionData.candidate.name} • {sessionData.assessment.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Badge
                variant={
                  sessionData.candidate.status === "COMPLETED"
                    ? "success"
                    : "default"
                }
              >
                {sessionData.candidate.status}
              </Badge>
              {sessionData.candidate.overallScore !== null && (
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-text-secondary" />
                  <span className="text-sm font-medium text-text-primary">
                    {sessionData.candidate.overallScore}/100
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Metrics */}
          <div className="mt-4 grid grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-text-tertiary">AI Interactions</p>
                <p className="text-sm font-medium text-text-primary">
                  {sessionData.metrics.claudeInteractions}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-text-tertiary">Code Snapshots</p>
                <p className="text-sm font-medium text-text-primary">
                  {sessionData.metrics.codeSnapshots}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <div>
                <p className="text-xs text-text-tertiary">Test Pass Rate</p>
                <p className="text-sm font-medium text-text-primary">
                  {(sessionData.metrics.testPassRate * 100).toFixed(0)}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-text-tertiary">Duration</p>
                <p className="text-sm font-medium text-text-primary">
                  {sessionData.session.duration
                    ? `${Math.floor(sessionData.session.duration / 60)}m`
                    : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Three Panel Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Code Editor Panel */}
        <div className="flex w-[40%] flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border bg-background-secondary px-4 py-2">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-text-secondary" />
              <span className="text-sm font-medium text-text-primary">
                {replayState.currentFile}
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <CodeEditor
              value={replayState.code}
              onChange={() => {}}
              language={
                isValidLanguage(sessionData.questions[0]?.language)
                  ? sessionData.questions[0].language
                  : "javascript"
              }
              readOnly={true}
            />
          </div>
        </div>

        {/* Terminal Panel */}
        <div className="flex w-[30%] flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border bg-background-secondary px-4 py-2">
            <div className="flex items-center gap-2">
              <TerminalIcon className="h-4 w-4 text-text-secondary" />
              <span className="text-sm font-medium text-text-primary">
                Terminal Output
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-black p-4 font-mono text-sm text-green-400">
            {replayState.terminalOutput.map((output, index) => (
              <div key={index}>{output}</div>
            ))}
            {replayState.terminalOutput.length === 0 && (
              <div className="text-text-tertiary">No terminal output yet...</div>
            )}
          </div>
        </div>

        {/* AI Chat Panel */}
        <div className="flex w-[30%] flex-col">
          <div className="flex items-center justify-between border-b border-border bg-background-secondary px-4 py-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-text-secondary" />
              <span className="text-sm font-medium text-text-primary">
                AI Chat
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {replayState.chatMessages.map((msg, index) => (
              <div
                key={index}
                className={`mb-4 ${
                  msg.role === "user" ? "text-right" : "text-left"
                }`}
              >
                <div
                  className={`inline-block max-w-[80%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-primary text-white"
                      : "bg-background-tertiary text-text-primary"
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                </div>
              </div>
            ))}
            {replayState.chatMessages.length === 0 && (
              <div className="text-center text-text-tertiary">
                No AI interactions yet...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="border-t border-border bg-background-secondary">
        <div className="container mx-auto px-4 py-4">
          {/* Timeline Scrubber */}
          <div className="mb-4">
            <input
              type="range"
              min={0}
              max={sessionData.timeline.length - 1}
              value={playback.currentIndex}
              onChange={(e) => seekToIndex(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="mt-2 flex justify-between text-xs text-text-tertiary">
              <span>{formatDuration(playback.currentTime)}</span>
              <span>{formatDuration(totalDuration)}</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-center gap-4">
            <Button variant="ghost" size="sm" onClick={skipBackward}>
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button variant="primary" size="md" onClick={togglePlayPause}>
              {playback.isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={skipForward}>
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={changeSpeed}>
              <FastForward className="h-4 w-4" />
              <span className="ml-1">{playback.playbackSpeed}x</span>
            </Button>
          </div>

          {/* Event Info */}
          {sessionData.timeline[playback.currentIndex] && (
            <div className="mt-4 text-center text-sm text-text-secondary">
              Event {playback.currentIndex + 1} of {sessionData.timeline.length}:{" "}
              <span className="font-medium text-text-primary">
                {sessionData.timeline[playback.currentIndex].type}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

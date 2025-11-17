"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Bot, User, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimelineScrubber } from "./TimelineScrubber";
import { CodeDiffViewer } from "./CodeDiffViewer";
import { PlaybackControls } from "./PlaybackControls";
import {
  SessionData,
  PlaybackSpeed,
  AIInteraction,
  CodeSnapshot,
  TerminalEvent,
  KeyMoment,
} from "./types";

// Dynamically import Terminal to avoid SSR issues
const Terminal = dynamic(
  () => import("@/components/interview/Terminal").then((mod) => mod.Terminal),
  { ssr: false }
);

interface SessionReplayViewerProps {
  sessionId: string;
  candidateId?: string;
  autoPlay?: boolean;
  initialSpeed?: PlaybackSpeed;
}

// Use the same interface as the Terminal component
interface TerminalHandle {
  write: (data: string) => void;
  writeln: (data: string) => void;
}

// Type guard to ensure Terminal ref is TerminalHandle
function isTerminalHandle(ref: any): ref is TerminalHandle {
  return ref && typeof ref.write === 'function' && typeof ref.writeln === 'function';
}

export function SessionReplayViewer({
  sessionId,
  candidateId,
  autoPlay = false,
  initialSpeed = 1,
}: SessionReplayViewerProps) {
  // State
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<PlaybackSpeed>(initialSpeed);
  const [skipIdleTime, setSkipIdleTime] = useState(false);
  const [currentSnapshotIndex, setCurrentSnapshotIndex] = useState(0);

  // Refs
  const terminalRef = useRef<any>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastEventIndexRef = useRef(0);
  const startTimeRef = useRef<Date | null>(null);

  // Load session data
  useEffect(() => {
    const loadSessionData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch session events and metadata from API
        const response = await fetch(`/api/interview/${sessionId}/events`);

        if (!response.ok) {
          throw new Error('Failed to load session data');
        }

        const apiData = await response.json();

        // Transform API response into SessionData format
        const sessionData: SessionData = transformApiResponse(
          apiData,
          sessionId,
          candidateId || 'unknown'
        );

        setSessionData(sessionData);
        startTimeRef.current = sessionData.startTime;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setLoading(false);
      }
    };

    loadSessionData();
  }, [sessionId, candidateId]);

  /**
   * Transform API response into SessionData format
   */
  function transformApiResponse(
    apiData: any,
    sessionId: string,
    candidateId: string
  ): SessionData {
    const sessionInfo = apiData.sessionInfo || {};
    const events = apiData.events || [];

    const startTime = sessionInfo.startTime ? new Date(sessionInfo.startTime) : new Date();
    const endTime = sessionInfo.endTime ? new Date(sessionInfo.endTime) : new Date();

    // Group events by type
    const codeSnapshots: CodeSnapshot[] = [];
    const terminalEvents: TerminalEvent[] = [];
    const aiInteractions: AIInteraction[] = [];
    const keyMoments: KeyMoment[] = [];

    events.forEach((event: any) => {
      const timestamp = new Date(event.timestamp);

      switch (event.type) {
        case 'code_snapshot':
          codeSnapshots.push({
            timestamp,
            fileName: event.data.fileName || 'index.ts',
            content: event.data.content || '',
            language: event.data.language || 'typescript',
          });
          break;

        case 'terminal_output':
        case 'terminal_input':
          terminalEvents.push({
            timestamp,
            output: event.data.output || event.data.input || '',
            isCommand: event.type === 'terminal_input',
          });
          break;

        case 'ai_interaction':
          aiInteractions.push({
            id: event.id,
            timestamp,
            role: event.data.role || 'user',
            content: event.data.content || event.data.message || '',
            tokens: event.data.tokens,
            promptScore: event.data.promptScore,
          });
          break;

        case 'test_run':
          if (event.checkpoint) {
            const passed = event.data.passed || 0;
            const failed = event.data.failed || 0;
            keyMoments.push({
              id: event.id,
              timestamp,
              type: failed > 0 ? 'test_failed' : 'test_passed',
              label: `Tests ${failed > 0 ? 'Failed' : 'Passed'}`,
              description: `${passed} passed, ${failed} failed`,
            });
          }
          break;
      }
    });

    // Calculate total duration in seconds
    const totalDuration = (endTime.getTime() - startTime.getTime()) / 1000;

    return {
      sessionId,
      candidateId,
      startTime,
      endTime,
      events,
      codeSnapshots,
      terminalEvents,
      aiInteractions,
      keyMoments,
      metadata: {
        totalDuration,
        language: 'typescript',
        problemTitle: 'Interview Problem',
      },
    };
  }

  // Playback engine
  useEffect(() => {
    if (!isPlaying || !sessionData) return;

    playbackIntervalRef.current = setInterval(() => {
      setCurrentTime(prev => {
        const newTime = prev + (0.1 * speed);
        const totalDuration = sessionData.metadata.totalDuration;

        if (newTime >= totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }

        return newTime;
      });
    }, 100);

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, speed, sessionData]);

  // Update components based on current time
  useEffect(() => {
    if (!sessionData) return;

    // Update terminal
    const terminalEvents = sessionData.terminalEvents.filter(
      event => (new Date(event.timestamp).getTime() - new Date(sessionData.startTime).getTime()) / 1000 <= currentTime
    );

    // Only write new events
    const newEvents = terminalEvents.slice(lastEventIndexRef.current);
    newEvents.forEach(event => {
      if (terminalRef.current) {
        if (event.isCommand) {
          terminalRef.current.writeln(`$ ${event.output}`);
        } else {
          terminalRef.current.writeln(event.output);
        }
      }
    });
    lastEventIndexRef.current = terminalEvents.length;

    // Update code snapshot
    const snapshots = sessionData.codeSnapshots.filter(
      snapshot => (new Date(snapshot.timestamp).getTime() - new Date(sessionData.startTime).getTime()) / 1000 <= currentTime
    );
    if (snapshots.length > 0) {
      setCurrentSnapshotIndex(snapshots.length - 1);
    }
  }, [currentTime, sessionData]);

  // Playback controls
  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    lastEventIndexRef.current = 0;
    // Clear terminal and replay from start
    // Note: Terminal doesn't have a clear method exposed, would need to recreate it
  }, []);

  const handleSpeedChange = useCallback((newSpeed: PlaybackSpeed) => {
    setSpeed(newSpeed);
  }, []);

  const handleSkipIdleToggle = useCallback(() => {
    setSkipIdleTime(prev => !prev);
  }, []);

  const handleNextMoment = useCallback(() => {
    if (!sessionData) return;

    const nextMoment = sessionData.keyMoments.find(
      moment => (new Date(moment.timestamp).getTime() - new Date(sessionData.startTime).getTime()) / 1000 > currentTime
    );

    if (nextMoment) {
      const momentTime = (new Date(nextMoment.timestamp).getTime() - new Date(sessionData.startTime).getTime()) / 1000;
      handleSeek(momentTime);
    }
  }, [currentTime, sessionData, handleSeek]);

  const handlePrevMoment = useCallback(() => {
    if (!sessionData) return;

    const prevMoment = [...sessionData.keyMoments]
      .reverse()
      .find(moment => (new Date(moment.timestamp).getTime() - new Date(sessionData.startTime).getTime()) / 1000 < currentTime);

    if (prevMoment) {
      const momentTime = (new Date(prevMoment.timestamp).getTime() - new Date(sessionData.startTime).getTime()) / 1000;
      handleSeek(momentTime);
    }
  }, [currentTime, sessionData, handleSeek]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-text-secondary">Loading session replay...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !sessionData) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">Failed to Load Session</h3>
          <p className="text-text-secondary">{error || 'Session data not found'}</p>
        </div>
      </div>
    );
  }

  // Get current AI interactions up to current time
  const currentAIInteractions = sessionData.aiInteractions.filter(
    interaction => (new Date(interaction.timestamp).getTime() - new Date(sessionData.startTime).getTime()) / 1000 <= currentTime
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Timeline Scrubber */}
      <TimelineScrubber
        currentTime={currentTime}
        totalDuration={sessionData.metadata.totalDuration}
        keyMoments={sessionData.keyMoments}
        onSeek={handleSeek}
        isPlaying={isPlaying}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left: Code Diff View */}
          <Panel defaultSize={50} minSize={30}>
            <CodeDiffViewer
              snapshots={sessionData.codeSnapshots}
              currentSnapshotIndex={currentSnapshotIndex}
              onSnapshotChange={setCurrentSnapshotIndex}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors" />

          {/* Right: Vertical split of Terminal and Chat */}
          <Panel defaultSize={50} minSize={30}>
            <PanelGroup direction="vertical">
              {/* Terminal Replay */}
              <Panel defaultSize={50} minSize={20}>
                <div className="h-full flex flex-col bg-background">
                  <div className="border-b border-border px-4 py-2 bg-background-secondary">
                    <h3 className="text-sm font-semibold text-text-primary">Terminal Output</h3>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {/* @ts-ignore - Dynamic import causes ref type mismatch */}
                    <Terminal ref={terminalRef} />
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-primary/40 transition-colors" />

              {/* Claude Chat Timeline */}
              <Panel defaultSize={50} minSize={20}>
                <div className="h-full flex flex-col bg-background">
                  <div className="border-b border-border px-4 py-2 bg-background-secondary">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-text-primary">Claude Chat History</h3>
                      <span className="text-xs text-text-tertiary">
                        {currentAIInteractions.length} interactions
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {currentAIInteractions.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <Bot className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
                          <p className="text-sm text-text-secondary">No AI interactions yet</p>
                        </div>
                      </div>
                    ) : (
                      currentAIInteractions.map((interaction) => (
                        <div
                          key={interaction.id}
                          className={cn(
                            "flex gap-3",
                            interaction.role === "user" ? "justify-end" : "justify-start"
                          )}
                        >
                          {interaction.role === "assistant" && (
                            <div className="flex-shrink-0">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <Bot className="h-5 w-5 text-primary" />
                              </div>
                            </div>
                          )}

                          <div
                            className={cn(
                              "max-w-[80%] rounded-lg p-3",
                              interaction.role === "user"
                                ? "bg-primary text-white"
                                : "bg-background-tertiary border border-border"
                            )}
                          >
                            <div className="text-sm whitespace-pre-wrap">
                              {interaction.content}
                            </div>

                            {interaction.role === "assistant" && (
                              <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
                                {interaction.tokens && (
                                  <span>{interaction.tokens} tokens</span>
                                )}
                                {interaction.promptScore !== undefined && (
                                  <span className={cn(
                                    "font-medium",
                                    interaction.promptScore >= 0.8 && "text-success",
                                    interaction.promptScore >= 0.5 && interaction.promptScore < 0.8 && "text-warning",
                                    interaction.promptScore < 0.5 && "text-error"
                                  )}>
                                    Quality: {(interaction.promptScore * 100).toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {interaction.role === "user" && (
                            <div className="flex-shrink-0">
                              <div className="h-8 w-8 rounded-full bg-background-tertiary flex items-center justify-center">
                                <User className="h-5 w-5 text-text-secondary" />
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      {/* Playback Controls */}
      <PlaybackControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        totalDuration={sessionData.metadata.totalDuration}
        speed={speed}
        skipIdleTime={skipIdleTime}
        onPlayPause={handlePlayPause}
        onSpeedChange={handleSpeedChange}
        onSkipIdleToggle={handleSkipIdleToggle}
        onNextMoment={handleNextMoment}
        onPrevMoment={handlePrevMoment}
      />
    </div>
  );
}

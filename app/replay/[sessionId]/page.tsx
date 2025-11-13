"use client";

import { SessionReplayViewer } from "@/components/replay";
import { useParams } from "next/navigation";

export default function SessionReplayPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  return (
    <SessionReplayViewer
      sessionId={sessionId}
      autoPlay={false}
      initialSpeed={1}
    />
  );
}

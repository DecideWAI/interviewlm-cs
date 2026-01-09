/**
 * Evidence Linking Service
 *
 * Links evaluation evidence to timeline events for Sentry-like replay.
 * Enables "click to jump to moment" functionality in session replay.
 *
 * Matching strategies:
 * 1. Exact timestamp match (within 5 second window)
 * 2. Content match (code snippets → code.snapshot events)
 * 3. Type match (test_result → test.result events)
 * 4. File path match
 */

import prisma from '@/lib/prisma';
import type { SessionEventLog, Prisma } from '@prisma/client';
import type {
  ComprehensiveEvidence,
  EvaluationDimension,
  EvidenceMarker,
} from '@/lib/types/comprehensive-evaluation';
import { logger } from '@/lib/utils/logger';

// Time window for fuzzy timestamp matching (in milliseconds)
const TIMESTAMP_MATCH_WINDOW_MS = 5000;

// Evidence type to event type mapping
const EVIDENCE_TYPE_TO_EVENT_TYPE: Record<ComprehensiveEvidence['type'], string[]> = {
  code_snippet: ['code.snapshot', 'code.edit'],
  test_result: ['test.result', 'test.run_complete'],
  ai_interaction: ['chat.user_message', 'chat.assistant_message'],
  terminal_command: ['terminal.command', 'terminal.input'],
  metric: ['session.metrics', 'evaluation.complete'],
};

/**
 * Find the best matching event for a piece of evidence
 */
export async function findMatchingEvent(
  sessionId: string,
  evidence: ComprehensiveEvidence,
  allEvents?: SessionEventLog[]
): Promise<SessionEventLog | null> {
  // If we already have an eventId, verify it exists
  if (evidence.eventId) {
    const event = await prisma.sessionEventLog.findUnique({
      where: { id: evidence.eventId },
    });
    if (event && event.sessionId === sessionId) {
      return event;
    }
  }

  // Fetch events if not provided
  const events =
    allEvents ||
    (await prisma.sessionEventLog.findMany({
      where: { sessionId },
      orderBy: { sequenceNumber: 'asc' },
    }));

  // Get possible event types for this evidence type
  const possibleEventTypes = EVIDENCE_TYPE_TO_EVENT_TYPE[evidence.type] || [];

  // Strategy 1: Match by timestamp within window
  if (evidence.timestamp) {
    const evidenceTime = new Date(evidence.timestamp).getTime();
    const matchingEvents = events.filter((event: SessionEventLog) => {
      const eventTime = new Date(event.timestamp).getTime();
      const timeDiff = Math.abs(eventTime - evidenceTime);
      return (
        timeDiff <= TIMESTAMP_MATCH_WINDOW_MS &&
        possibleEventTypes.includes(event.eventType)
      );
    });

    // Return closest match
    if (matchingEvents.length > 0) {
      return matchingEvents.reduce((closest: SessionEventLog, event: SessionEventLog) => {
        const closestDiff = Math.abs(
          new Date(closest.timestamp).getTime() - evidenceTime
        );
        const eventDiff = Math.abs(
          new Date(event.timestamp).getTime() - evidenceTime
        );
        return eventDiff < closestDiff ? event : closest;
      });
    }
  }

  // Strategy 2: Match by file path (for code evidence)
  if (evidence.filePath && evidence.type === 'code_snippet') {
    const fileMatch = events.find(
      (event: SessionEventLog) =>
        event.filePath === evidence.filePath &&
        possibleEventTypes.includes(event.eventType)
    );
    if (fileMatch) return fileMatch;
  }

  // Strategy 3: Match by content (search in event data)
  if (evidence.codeSnippet && evidence.type === 'code_snippet') {
    const snippetMatch = events.find((event: SessionEventLog) => {
      if (!possibleEventTypes.includes(event.eventType)) return false;
      const data = event.data as Record<string, unknown>;
      const files = data?.files as Record<string, string> | undefined;
      if (!files) return false;
      return Object.values(files).some((content) =>
        content.includes(evidence.codeSnippet!.substring(0, 50))
      );
    });
    if (snippetMatch) return snippetMatch;
  }

  // Strategy 4: Match by test results (validate event contains test data)
  if (evidence.type === 'test_result') {
    const testMatch = events.find((event: SessionEventLog) => {
      if (!possibleEventTypes.includes(event.eventType)) return false;
      // Validate event contains actual test result data
      const data = event.data as Record<string, unknown>;
      return (
        data &&
        (data.testName !== undefined ||
          data.passed !== undefined ||
          data.results !== undefined ||
          data.totalTests !== undefined)
      );
    });
    if (testMatch) return testMatch;
  }

  // Fallback: Return the closest checkpoint event by timestamp
  if (evidence.timestamp) {
    const evidenceTime = new Date(evidence.timestamp).getTime();
    const checkpoints = events.filter((e: SessionEventLog) => e.checkpoint);
    if (checkpoints.length > 0) {
      return checkpoints.reduce((closest: SessionEventLog, event: SessionEventLog) => {
        const closestDiff = Math.abs(
          new Date(closest.timestamp).getTime() - evidenceTime
        );
        const eventDiff = Math.abs(
          new Date(event.timestamp).getTime() - evidenceTime
        );
        return eventDiff < closestDiff ? event : closest;
      });
    }
  }

  return null;
}

/**
 * Link all evidence from an evaluation to timeline events
 * Creates EvidenceEventLink records for replay integration
 */
export async function linkEvaluationEvidence(
  evaluationId: string,
  sessionId: string
): Promise<number> {
  // Fetch the evaluation
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
  });

  if (!evaluation) {
    throw new Error(`Evaluation ${evaluationId} not found for session ${sessionId}`);
  }

  // Fetch all session events
  const events = await prisma.sessionEventLog.findMany({
    where: { sessionId },
    orderBy: { sequenceNumber: 'asc' },
  });

  if (events.length === 0) {
    logger.warn('No events found for session', { sessionId, evaluationId });
    return 0;
  }

  // Extract evidence from all dimensions
  const dimensions: Array<{
    dimension: EvaluationDimension;
    evidence: ComprehensiveEvidence[];
  }> = [
    {
      dimension: 'codeQuality',
      evidence: (evaluation.codeQualityEvidence as unknown as ComprehensiveEvidence[]) || [],
    },
    {
      dimension: 'problemSolving',
      evidence: (evaluation.problemSolvingEvidence as unknown as ComprehensiveEvidence[]) || [],
    },
    {
      dimension: 'aiCollaboration',
      evidence: (evaluation.aiCollaborationEvidence as unknown as ComprehensiveEvidence[]) || [],
    },
    {
      dimension: 'communication',
      evidence: (evaluation.communicationEvidence as unknown as ComprehensiveEvidence[]) || [],
    },
  ];

  // Create links for each evidence item (process in parallel for performance)
  const matchPromises: Promise<Prisma.EvidenceEventLinkCreateManyInput | null>[] = [];

  for (const { dimension, evidence } of dimensions) {
    for (let i = 0; i < evidence.length; i++) {
      const item = evidence[i];
      const evidenceIndex = i;

      matchPromises.push(
        findMatchingEvent(sessionId, item, events).then((matchingEvent) => {
          if (matchingEvent) {
            return {
              evaluationId,
              eventId: matchingEvent.id,
              dimension,
              evidenceIndex,
              evidenceType: item.type,
              description: item.description.substring(0, 500),
              importance: item.importance || 'normal',
            };
          }
          return null;
        })
      );
    }
  }

  // Wait for all matches to complete and filter out nulls
  const matchResults = await Promise.all(matchPromises);
  const linksToCreate = matchResults.filter(
    (link): link is Prisma.EvidenceEventLinkCreateManyInput => link !== null
  );

  // Bulk create links (skip duplicates)
  if (linksToCreate.length > 0) {
    await prisma.evidenceEventLink.createMany({
      data: linksToCreate,
      skipDuplicates: true,
    });
  }

  logger.info('Evidence linking completed', {
    evaluationId,
    sessionId,
    linksCreated: linksToCreate.length,
  });

  return linksToCreate.length;
}

/**
 * Get evidence markers for a session timeline
 * Returns all linked evidence for display on the replay timeline
 */
export async function getEvidenceMarkers(
  sessionId: string
): Promise<EvidenceMarker[]> {
  // Get evaluation for this session
  const evaluation = await prisma.evaluation.findUnique({
    where: { sessionId },
    select: { id: true },
  });

  if (!evaluation) {
    return [];
  }

  // Get all evidence links with their events
  const links = await prisma.evidenceEventLink.findMany({
    where: { evaluationId: evaluation.id },
    include: {
      event: {
        select: {
          id: true,
          sequenceNumber: true,
          timestamp: true,
        },
      },
    },
    orderBy: {
      event: {
        sequenceNumber: 'asc',
      },
    },
  });

  // Transform to EvidenceMarker format
  // Note: BigInt to Number conversion is safe here as sequence numbers are
  // monotonically increasing per session and won't exceed Number.MAX_SAFE_INTEGER
  return links.map((link) => ({
    id: link.id,
    eventId: link.eventId,
    sequenceNumber: Number(link.event.sequenceNumber),
    timestamp: link.event.timestamp,
    dimension: link.dimension as EvaluationDimension,
    evidenceIndex: link.evidenceIndex,
    evidenceType: link.evidenceType as ComprehensiveEvidence['type'],
    description: link.description,
    importance: link.importance as 'critical' | 'important' | 'normal',
  }));
}

/**
 * Get evidence markers grouped by dimension
 * Useful for the evidence panel display
 */
export async function getEvidenceMarkersByDimension(
  sessionId: string
): Promise<Record<EvaluationDimension, EvidenceMarker[]>> {
  const markers = await getEvidenceMarkers(sessionId);

  const grouped: Record<EvaluationDimension, EvidenceMarker[]> = {
    codeQuality: [],
    problemSolving: [],
    aiCollaboration: [],
    communication: [],
  };

  for (const marker of markers) {
    grouped[marker.dimension].push(marker);
  }

  return grouped;
}

/**
 * Delete all evidence links for an evaluation
 * Used when re-running evaluation
 */
export async function clearEvidenceLinks(evaluationId: string): Promise<number> {
  const result = await prisma.evidenceEventLink.deleteMany({
    where: { evaluationId },
  });

  return result.count;
}

/**
 * Check if evidence links exist for an evaluation
 */
export async function hasEvidenceLinks(evaluationId: string): Promise<boolean> {
  const count = await prisma.evidenceEventLink.count({
    where: { evaluationId },
    take: 1,
  });

  return count > 0;
}

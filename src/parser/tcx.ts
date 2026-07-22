import type { RunRecord } from '@/db/types';

/** A parsed run, ready for the post-run form (RPE, tags, notes) and DB insert. */
export type ParsedRun = Omit<
  RunRecord,
  'id' | 'rpe' | 'feelTags' | 'userNotes' | 'plannedWorkoutId'
>;

export class TcxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TcxParseError';
  }
}

/**
 * Sprint 1 target — defensive client-side TCX parser.
 *
 * Requirements (PRD 4.1 / dev plan Sprint 1):
 * - Native DOMParser with namespace support (ns3:TPX, ns3:LX extensions).
 * - HR, cadence, elevation, power are all OPTIONAL — omit absent metrics,
 *   never default them to 0.
 * - Cadence < 120 is single-leg → multiply by 2 for SPM.
 * - Aggregate to lap level (LapSplit[]); DISCARD trackpoints after aggregation.
 * - Must parse + persist a 10MB file in < 50ms.
 */
export function parseTcx(_xml: string): ParsedRun {
  throw new TcxParseError('Not implemented — Sprint 1');
}

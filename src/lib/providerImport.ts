import { db } from '@/db/db';
import { parseTcx, TcxParseError, type ParsedRun } from '@/parser/tcx';

/**
 * Batch import of TCX files (PRD §4.9). Two sources feed this and behave
 * identically: files written by `tools/garmin-export`, and a bulk export
 * downloaded by hand from Garmin/Strava/anywhere else.
 *
 * Everything here except `markDuplicates` is pure, so the rules are testable
 * without a database or a file picker.
 */

/**
 * Filename written by `tools/garmin-export` — `garmin-<activityId>.tcx`.
 *
 * Carrying the provider id in the name is what lets a re-import be idempotent
 * (FR-9.3) with no sidecar manifest to keep in sync or lose. A renamed file
 * simply imports without an `externalId`: it still works, it just can't be
 * recognised on a future re-import, which is the right way round to fail.
 */
const GARMIN_FILENAME = /^garmin-(\d+)\.tcx$/i;

export function externalIdFromFilename(fileName: string): string | undefined {
  return GARMIN_FILENAME.exec(fileName)?.[1];
}

export type ImportStatus = 'ready' | 'duplicate' | 'error';

export interface ImportCandidate {
  fileName: string;
  status: ImportStatus;
  /** Absent when `status` is 'error'. */
  run?: ParsedRun;
  /** Provider activity id, when the filename carried one. */
  externalId?: string;
  /** Parse failure detail, for 'error' rows. Already human-readable. */
  error?: string;
}

/**
 * Parse one file. Never throws: a bad file becomes an 'error' row so one
 * corrupt export can't abort a 200-file batch.
 */
export function parseImportCandidate(
  fileName: string,
  xml: string,
): ImportCandidate {
  const externalId = externalIdFromFilename(fileName);
  try {
    return { fileName, status: 'ready', run: parseTcx(xml), ...(externalId && { externalId }) };
  } catch (e) {
    return {
      fileName,
      status: 'error',
      error: e instanceof TcxParseError ? e.message : 'Could not read file',
      ...(externalId && { externalId }),
    };
  }
}

/**
 * Flag candidates already in the database, and duplicates *within* the batch
 * (selecting the same file twice, or two copies under different names).
 *
 * Only rows carrying an `externalId` can be recognised — see the note on
 * `GARMIN_FILENAME`. Returns new objects rather than mutating.
 */
export async function markDuplicates(
  candidates: ImportCandidate[],
  source: 'garmin' = 'garmin',
): Promise<ImportCandidate[]> {
  const ids = candidates
    .filter((c) => c.status === 'ready' && c.externalId)
    .map((c) => c.externalId!);
  if (ids.length === 0) return candidates;

  const existing = await db.runs
    .where('[source+externalId]')
    .anyOf(ids.map((id) => [source, id]))
    .toArray();
  const known = new Set(existing.map((r) => r.externalId));

  const seenInBatch = new Set<string>();
  return candidates.map((c) => {
    if (c.status !== 'ready' || !c.externalId) return c;
    const isDuplicate = known.has(c.externalId) || seenInBatch.has(c.externalId);
    seenInBatch.add(c.externalId);
    return isDuplicate ? { ...c, status: 'duplicate' as const } : c;
  });
}

/** Rows a batch import would actually write. */
export function importableCount(candidates: ImportCandidate[]): number {
  return candidates.filter((c) => c.status === 'ready').length;
}

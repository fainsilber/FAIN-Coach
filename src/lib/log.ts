import { db } from '@/db/db';
import type { LogEntry, LogLevel } from '@/db/types';
import { APP_VERSION, formatBuildTime, GIT_SHA } from './appInfo';

// Diagnostics log (PRD §4.8, FR-8.5–8.11). Bounded, redacted, excluded from
// backups (see backup.ts), and never allowed to break its caller.

const MAX_LOG_ENTRIES = 500;
const MAX_DETAIL_LENGTH = 500;

// Anything shaped like an OpenRouter key must never reach storage, even if a
// caller passes it by mistake (FR-8.8). This is the enforcement point — not
// each call site — because redaction left to callers eventually gets missed.
const API_KEY_PATTERN = /sk-[a-zA-Z0-9-]{8,}/g;

function redact(text: string): string {
  return text.replace(API_KEY_PATTERN, '[redacted]').slice(0, MAX_DETAIL_LENGTH);
}

/**
 * Fire-and-forget: a failure in here must never break the feature it is
 * observing (FR-8.11). `detail` must be metadata only — an error code, a
 * count, a model id — never chat content, run notes, or other user text.
 */
export async function logEvent(
  level: LogLevel,
  event: string,
  detail?: string,
): Promise<void> {
  try {
    await db.logs.add({
      at: new Date().toISOString(),
      level,
      event,
      ...(detail ? { detail: redact(detail) } : {}),
    });
    await trimLog();
  } catch {
    // Swallow. A logging failure must never surface to the caller.
  }
}

async function trimLog(): Promise<void> {
  try {
    const count = await db.logs.count();
    if (count <= MAX_LOG_ENTRIES) return;
    const oldest = await db.logs
      .orderBy('id')
      .limit(count - MAX_LOG_ENTRIES)
      .primaryKeys();
    await db.logs.bulkDelete(oldest);
  } catch {
    // Same resilience guarantee as logEvent itself.
  }
}

export async function getLogEntries(): Promise<LogEntry[]> {
  return db.logs.orderBy('at').toArray();
}

export async function clearLog(): Promise<void> {
  await db.logs.clear();
}

/** Human-readable export (FR-8.7, 8.9) — the build identity heads the file
 * because a log without a version is much less useful for troubleshooting. */
export async function exportLogText(): Promise<string> {
  const entries = await getLogEntries();
  const header = [
    'FAIN Coach diagnostics log',
    `Build: v${APP_VERSION} · ${GIT_SHA} · built ${formatBuildTime()}`,
    `Exported: ${new Date().toISOString()}`,
    `Entries: ${entries.length}`,
    '',
  ].join('\n');
  const body = entries
    .map(
      (e) =>
        `[${e.at}] ${e.level.toUpperCase()} ${e.event}${e.detail ? ` — ${e.detail}` : ''}`,
    )
    .join('\n');
  return `${header}${body}\n`;
}

import { describe, expect, it } from 'vitest';
import type { RunRecord } from '@/db/types';
import {
  buildCoachContext,
  capMessages,
  CHAT_TOKEN_BUDGET,
  estimateTokens,
  RUN_SUMMARY_TOKEN_BUDGET,
  summarizeRun,
} from './prompts';

const fullRun: RunRecord = {
  date: '2026-04-17T02:16:20.000Z',
  totalDistanceMeters: 21290.1,
  totalDurationSeconds: 7417.981,
  avgHeartRate: 148,
  maxHeartRate: 161,
  avgCadence: 175,
  avgPower: 290,
  laps: Array.from({ length: 22 }, (_, i) => ({
    lapIndex: i,
    distanceMeters: 1000,
    durationSeconds: 348,
    avgHeartRate: 145 + (i % 10),
    avgCadence: 175,
    avgPower: 285,
  })),
  rpe: 8,
  feelTags: ['strong'],
  userNotes: 'Official half marathon race. Felt strong through 18k.',
  matchStatus: 'unplanned',
};

const bareRun: RunRecord = {
  date: '2026-07-02T06:00:00.000Z',
  totalDistanceMeters: 5000,
  totalDurationSeconds: 1500,
  laps: [{ lapIndex: 0, distanceMeters: 5000, durationSeconds: 1500 }],
  matchStatus: 'unmatched',
};

describe('summarizeRun', () => {
  it('includes every present metric', () => {
    const s = summarizeRun(fullRun);
    expect(s).toContain('21.29 km');
    expect(s).toContain('avg 148, max 161 bpm');
    expect(s).toContain('avg 175 spm');
    expect(s).toContain('avg 290 W');
    expect(s).toContain('RPE): 8/10');
    expect(s).toContain('strong');
    expect(s).toContain('half marathon');
    expect(s).toContain('Lap splits');
  });

  it('never mentions absent metrics (FR-3.4 enforcement)', () => {
    const s = summarizeRun(bareRun).toLowerCase();
    expect(s).not.toContain('heart');
    expect(s).not.toContain('bpm');
    expect(s).not.toContain('cadence');
    expect(s).not.toContain('spm');
    expect(s).not.toContain('power');
    expect(s).not.toMatch(/\brpe\b/);
    expect(s).not.toContain('undefined');
    expect(s).not.toContain('null');
  });

  it('stays within the 600-token summary budget for a 22-lap run', () => {
    expect(estimateTokens(summarizeRun(fullRun))).toBeLessThanOrEqual(
      RUN_SUMMARY_TOKEN_BUDGET,
    );
  });

  it('caps lap lines for absurd lap counts and stays in budget', () => {
    const manyLaps: RunRecord = {
      ...fullRun,
      laps: Array.from({ length: 200 }, (_, i) => ({
        lapIndex: i,
        distanceMeters: 200,
        durationSeconds: 70,
        avgHeartRate: 150,
      })),
    };
    const s = summarizeRun(manyLaps);
    expect(s).toContain('first 26 of 200');
    expect(estimateTokens(s)).toBeLessThanOrEqual(RUN_SUMMARY_TOKEN_BUDGET);
  });
});

describe('buildCoachContext', () => {
  it('enforces the 3-step layout and absent-metric rule in the system prompt', () => {
    const ctx = buildCoachContext(undefined, [], undefined);
    expect(ctx).toContain('The Big Picture');
    expect(ctx).toContain('Telemetry Breakdown');
    expect(ctx).toContain('Next Step');
    expect(ctx).toContain('never mention');
    expect(ctx).toContain('No active training plan');
  });

  it('includes plan, adherence, and recent-run one-liners when present', () => {
    const ctx = buildCoachContext(
      {
        createdAt: '2026-07-01',
        status: 'active',
        goal: 'Sub-50 10k on 2026-10-04',
        weeks: 12,
        generationContext: '',
      },
      [fullRun, bareRun],
      { completed: 4, missed: 1, skipped: 0, pending: 7 },
    );
    expect(ctx).toContain('Sub-50 10k');
    expect(ctx).toContain('4 completed, 1 missed');
    expect(ctx).toContain('2026-04-17: 21.3km');
  });
});

describe('capMessages token budget', () => {
  it('keeps a realistic post-run exchange under the 1k budget', () => {
    const system = buildCoachContext(undefined, [fullRun], undefined);
    const history = [
      { role: 'user' as const, content: summarizeRun(fullRun) },
    ];
    const messages = capMessages(system, history);
    const total = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    );
    expect(total).toBeLessThanOrEqual(CHAT_TOKEN_BUDGET);
    expect(messages[0].role).toBe('system');
    expect(messages).toHaveLength(2);
  });

  it('drops oldest messages first when history exceeds the budget', () => {
    const filler = 'x'.repeat(1200); // ~300 tokens each
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `${i}:${filler}`,
    }));
    const messages = capMessages('system prompt', history, 1000);
    const kept = messages.slice(1);
    expect(kept.length).toBeLessThan(10);
    // newest message always survives
    expect(kept[kept.length - 1].content.startsWith('9:')).toBe(true);
    const total = messages.reduce((s, m) => s + estimateTokens(m.content), 0);
    expect(total).toBeLessThanOrEqual(1000 + 300); // newest always included
  });

  it('always includes the newest message even when oversized', () => {
    const messages = capMessages('sys', [
      { role: 'user', content: 'y'.repeat(10000) },
    ]);
    expect(messages).toHaveLength(2);
  });
});

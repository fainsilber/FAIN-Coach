import { describe, expect, it } from 'vitest';
import type { PlannedWorkout } from '@/db/types';
import { computeAdherence, findMatchCandidate } from './matching';

let nextId = 1;
function workout(overrides: Partial<PlannedWorkout>): PlannedWorkout {
  return {
    id: nextId++,
    planId: 1,
    date: '2026-07-22',
    type: 'easy',
    description: 'Easy run',
    targetDistanceMeters: 8000,
    status: 'pending',
    ...overrides,
  };
}

const run = { date: '2026-07-22T06:00:00.000Z', totalDistanceMeters: 8100 };

describe('findMatchCandidate', () => {
  it('matches a same-day pending workout', () => {
    const w = workout({});
    expect(findMatchCandidate(run, [w])?.id).toBe(w.id);
  });

  it('prefers the closer date within ±1 day', () => {
    const yesterday = workout({ date: '2026-07-21' });
    const sameDay = workout({ date: '2026-07-22' });
    expect(findMatchCandidate(run, [yesterday, sameDay])?.id).toBe(sameDay.id);
  });

  it('ignores workouts more than a day away', () => {
    expect(
      findMatchCandidate(run, [workout({ date: '2026-07-24' })]),
    ).toBeUndefined();
  });

  it('breaks same-day ties by distance proximity', () => {
    const tempo5k = workout({ type: 'tempo', targetDistanceMeters: 5000 });
    const easy8k = workout({ type: 'easy', targetDistanceMeters: 8000 });
    expect(findMatchCandidate(run, [tempo5k, easy8k])?.id).toBe(easy8k.id);
  });

  it('never matches rest days or non-pending workouts', () => {
    expect(
      findMatchCandidate(run, [
        workout({ type: 'rest' }),
        workout({ status: 'completed' }),
        workout({ status: 'skipped' }),
      ]),
    ).toBeUndefined();
  });
});

describe('computeAdherence', () => {
  const today = new Date('2026-07-22T12:00:00Z');

  it('counts past-due pending workouts as missed', () => {
    const stats = computeAdherence(
      [
        workout({ status: 'completed', date: '2026-07-15' }),
        workout({ status: 'pending', date: '2026-07-18' }), // past due
        workout({ status: 'skipped', date: '2026-07-19' }),
        workout({ status: 'missed', date: '2026-07-20' }),
        workout({ status: 'pending', date: '2026-07-25' }), // upcoming
        workout({ status: 'pending', date: '2026-07-22' }), // today counts as pending
      ],
      today,
    );
    expect(stats).toEqual({ completed: 1, missed: 2, skipped: 1, pending: 2 });
  });

  it('excludes rest days from all counts', () => {
    const stats = computeAdherence(
      [workout({ type: 'rest', date: '2026-07-10' })],
      today,
    );
    expect(stats).toEqual({ completed: 0, missed: 0, skipped: 0, pending: 0 });
  });
});

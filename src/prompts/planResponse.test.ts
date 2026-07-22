import { describe, expect, it, vi } from 'vitest';
import type { LlmClient } from '@/llm/LlmClient';
import {
  parsePlanResponse,
  PlanParseError,
  requestPlanWorkouts,
} from './planResponse';

const validJson = JSON.stringify({
  workouts: [
    {
      date: '2026-08-03',
      type: 'easy',
      description: 'Easy 8k at conversational pace',
      targetDistanceMeters: 8000,
    },
    {
      date: '2026-08-01',
      type: 'long',
      description: 'Long run 14k, last 3k at marathon effort',
      targetDistanceMeters: 14000,
      targetDurationSeconds: 5100,
    },
  ],
});

describe('parsePlanResponse', () => {
  it('parses clean JSON and sorts by date', () => {
    const drafts = parsePlanResponse(validJson);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].date).toBe('2026-08-01');
    expect(drafts[1].type).toBe('easy');
  });

  it('tolerates markdown fences and surrounding prose', () => {
    const wrapped = `Here is your plan:\n\`\`\`json\n${validJson}\n\`\`\`\nGood luck!`;
    expect(parsePlanResponse(wrapped)).toHaveLength(2);
  });

  it.each([
    ['no JSON at all', 'sorry, I cannot help', /No JSON object/],
    ['broken JSON', '{"workouts": [', /No JSON object|not valid JSON/],
    ['empty workouts', '{"workouts": []}', /non-empty array/],
    [
      'bad date',
      '{"workouts":[{"date":"next tuesday","type":"easy","description":"x"}]}',
      /date must be/,
    ],
    [
      'bad type',
      '{"workouts":[{"date":"2026-08-01","type":"fartlek","description":"x"}]}',
      /type must be one of/,
    ],
    [
      'missing description',
      '{"workouts":[{"date":"2026-08-01","type":"easy","description":""}]}',
      /description must be/,
    ],
    [
      'negative target',
      '{"workouts":[{"date":"2026-08-01","type":"easy","description":"x","targetDistanceMeters":-5}]}',
      /positive number/,
    ],
  ])('rejects %s', (_name, input, msg) => {
    expect(() => parsePlanResponse(input)).toThrow(msg);
    expect(() => parsePlanResponse(input)).toThrow(PlanParseError);
  });
});

describe('requestPlanWorkouts retry', () => {
  const goal = {
    goal: 'Sub-50 10k',
    raceDate: '2026-10-04',
    currentWeeklyKm: 25,
    daysPerWeek: 4,
  };

  it('returns on the first attempt when valid', async () => {
    const chat = vi.fn(async () => validJson);
    const client: LlmClient = { chat };
    const result = await requestPlanWorkouts(client, 'model', goal, []);
    expect(result.workouts).toHaveLength(2);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.generationContext).toContain('Sub-50 10k');
  });

  it('retries once with the validation error appended', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce('I refuse to answer in JSON.')
      .mockResolvedValueOnce(validJson);
    const client: LlmClient = { chat };
    const result = await requestPlanWorkouts(client, 'model', goal, []);
    expect(result.workouts).toHaveLength(2);
    expect(chat).toHaveBeenCalledTimes(2);
    const retryPrompt = (
      chat.mock.calls[1][0] as Array<{ content: string }>
    )[0].content;
    expect(retryPrompt).toContain('could not be used');
    expect(result.generationContext).toBe(retryPrompt);
  });

  it('gives up after the second malformed response', async () => {
    const chat = vi.fn(async () => 'still not json');
    const client: LlmClient = { chat };
    await expect(
      requestPlanWorkouts(client, 'model', goal, []),
    ).rejects.toThrow(PlanParseError);
    expect(chat).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmError } from './LlmClient';
import { OpenRouterClient } from './openrouter';

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

const delta = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenRouterClient', () => {
  it('assembles streamed tokens and reports them via onToken', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          ': OPENROUTER PROCESSING\n\n',
          delta('Nice '),
          delta('run!'),
          'data: [DONE]\n\n',
        ]),
      ),
    );
    const tokens: string[] = [];
    const client = new OpenRouterClient('key');
    const result = await client.chat(
      [{ role: 'user', content: 'hi' }],
      'test-model',
      (t) => tokens.push(t),
    );
    expect(result).toBe('Nice run!');
    expect(tokens).toEqual(['Nice ', 'run!']);
  });

  it('handles frames split across network chunks', async () => {
    const whole = delta('Hello') + delta(' world') + 'data: [DONE]\n\n';
    const parts = [whole.slice(0, 25), whole.slice(25, 60), whole.slice(60)];
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(parts)));
    const client = new OpenRouterClient('key');
    expect(await client.chat([{ role: 'user', content: 'hi' }], 'm')).toBe(
      'Hello world',
    );
  });

  it('sends the key, model, and stream flag', async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: [DONE]\n\n']));
    vi.stubGlobal('fetch', fetchMock);
    await new OpenRouterClient('sk-or-test').chat(
      [{ role: 'system', content: 's' }],
      'meta-llama/llama-3.3-70b-instruct',
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-or-test',
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe('meta-llama/llama-3.3-70b-instruct');
    expect(body.stream).toBe(true);
  });

  it.each([
    [401, 'invalid-key'],
    [402, 'invalid-key'],
    [429, 'rate-limit'],
    [500, 'server'],
  ])('maps HTTP %i to LlmError %s', async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('err', { status })),
    );
    const client = new OpenRouterClient('key');
    await expect(
      client.chat([{ role: 'user', content: 'hi' }], 'm'),
    ).rejects.toMatchObject({ name: 'LlmError', code });
  });

  it('maps fetch failures to a network LlmError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const client = new OpenRouterClient('key');
    await expect(
      client.chat([{ role: 'user', content: 'hi' }], 'm'),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it('skips malformed frames without dropping the stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'data: {broken json\n\n',
          delta('ok'),
          'data: [DONE]\n\n',
        ]),
      ),
    );
    const client = new OpenRouterClient('key');
    expect(await client.chat([{ role: 'user', content: 'hi' }], 'm')).toBe('ok');
  });
});

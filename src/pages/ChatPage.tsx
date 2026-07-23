import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/db/db';
import { getSetting, SETTING_KEYS } from '@/db/settings';
import type { PlannedWorkout } from '@/db/types';
import { computeAdherence } from '@/lib/matching';
import { getPreferences } from '@/db/settings';
import { cn } from '@/lib/utils';
import { LlmError } from '@/llm/LlmClient';
import { DEFAULT_FAST_MODEL, OpenRouterClient } from '@/llm/openrouter';
import { buildCoachContext, capMessages } from '@/prompts/prompts';

function friendlyError(e: unknown): string {
  if (e instanceof LlmError) {
    switch (e.code) {
      case 'invalid-key':
        return 'OpenRouter rejected the request — check your API key in Settings.';
      case 'rate-limit':
        return 'Rate limited by OpenRouter. Wait a moment and retry.';
      case 'network':
        return 'Could not reach OpenRouter — check your connection.';
      default:
        return e.message;
    }
  }
  return 'Something went wrong talking to the coach.';
}

export function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const messages = useLiveQuery(() =>
    db.chatMessages.orderBy('timestamp').toArray(),
  );
  const hasKey = useLiveQuery(async () =>
    Boolean(await getSetting(SETTING_KEYS.apiKey)),
  );

  const [draft, setDraft] = useState('');
  const [streamText, setStreamText] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [online, setOnline] = useState(navigator.onLine);
  const autoFired = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.length, streamText]);

  async function requestReply() {
    setError(undefined);
    setBusy(true);
    setStreamText('');
    try {
      const key = await getSetting(SETTING_KEYS.apiKey);
      if (!key) {
        throw new LlmError('invalid-key', 'No API key configured.');
      }
      const model =
        (await getSetting(SETTING_KEYS.fastModel)) || DEFAULT_FAST_MODEL;
      const [history, recentRuns, plan] = await Promise.all([
        db.chatMessages.orderBy('timestamp').toArray(),
        db.runs.orderBy('date').reverse().limit(3).toArray(),
        db.trainingPlans.where('status').equals('active').first(),
      ]);
      let adherence;
      let upcoming: PlannedWorkout[] = [];
      if (plan?.id !== undefined) {
        const workouts = await db.plannedWorkouts
          .where('planId')
          .equals(plan.id)
          .toArray();
        adherence = computeAdherence(workouts);
        const todayIso = new Date().toISOString().slice(0, 10);
        const weekAhead = new Date(Date.now() + 7 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        upcoming = workouts
          .filter(
            (w) =>
              w.status === 'pending' &&
              w.date >= todayIso &&
              w.date <= weekAhead,
          )
          .sort((a, b) => a.date.localeCompare(b.date));
      }
      const { unitSystem } = await getPreferences();
      const system = buildCoachContext(
        plan,
        recentRuns,
        adherence,
        upcoming,
        unitSystem,
      );
      const outgoing = capMessages(
        system,
        history.map((m) => ({ role: m.role, content: m.content })),
      );
      let acc = '';
      const client = new OpenRouterClient(key);
      const content = await client.chat(outgoing, model, (token) => {
        acc += token;
        setStreamText(acc);
      });
      if (content.trim()) {
        await db.chatMessages.add({
          timestamp: new Date().toISOString(),
          role: 'assistant',
          content,
        });
      } else {
        setError('The model returned an empty response. Try again.');
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      setStreamText(undefined);
    }
  }

  // Upload flow lands here with a freshly injected run summary to answer.
  useEffect(() => {
    const state = location.state as { pendingReply?: boolean } | null;
    if (!state?.pendingReply || autoFired.current || messages === undefined)
      return;
    autoFired.current = true;
    navigate(location.pathname, { replace: true });
    const last = messages[messages.length - 1];
    if (last?.role === 'user' && !busy) void requestReply();
  }, [messages, location.state]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    await db.chatMessages.add({
      timestamp: new Date().toISOString(),
      role: 'user',
      content: text,
    });
    void requestReply();
  }

  if (messages === undefined) return null;

  const lastIsUser = messages[messages.length - 1]?.role === 'user';
  const canRetry = lastIsUser && !busy && error !== undefined;

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      {!online && (
        <p className="mb-3 rounded-md border bg-secondary/50 p-2 text-center text-sm text-muted-foreground">
          You're offline — chat needs a network connection. Your run history
          still works.
        </p>
      )}
      {online && hasKey === false && (
        <p className="mb-3 rounded-md border bg-secondary/50 p-2 text-center text-sm">
          Add your OpenRouter API key in{' '}
          <Link to="/settings" className="underline">
            Settings
          </Link>{' '}
          to chat with the coach.
        </p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 && streamText === undefined && (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            Upload a run or ask a training question to start the conversation.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'max-w-[85%] whitespace-pre-wrap rounded-lg p-3 text-sm',
              m.role === 'user'
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'border bg-background',
            )}
          >
            {m.content}
          </div>
        ))}
        {streamText !== undefined && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-lg border p-3 text-sm">
            {streamText || (
              <span className="text-muted-foreground">Coach is thinking…</span>
            )}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            {error}
            {canRetry && (
              <button
                type="button"
                onClick={() => void requestReply()}
                className="ml-2 underline"
              >
                Retry
              </button>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask your coach…"
          disabled={!online}
          className="flex-1 rounded-md border bg-background p-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !online || !draft.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </section>
  );
}

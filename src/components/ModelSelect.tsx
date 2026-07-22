import { useId } from 'react';
import { isKnownModel, type ModelGroup } from '@/llm/models';

const CUSTOM = '__custom__';

/**
 * A real <select> (mobile browsers render this as a native picker; the old
 * <input list> datalist was effectively unusable on phones) with an escape
 * hatch for any OpenRouter model id.
 */
export function ModelSelect({
  label,
  hint,
  groups,
  value,
  defaultModel,
  onChange,
}: {
  label: string;
  hint?: string;
  groups: ModelGroup[];
  /** Empty string means "not set" — the app falls back to defaultModel. */
  value: string;
  defaultModel: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  // An unset setting resolves to the default, so show that as the selection.
  const effective = value || defaultModel;
  const custom = !isKnownModel(groups, effective);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={custom ? CUSTOM : effective}
        onChange={(e) =>
          onChange(e.target.value === CUSTOM ? effective : e.target.value)
        }
        className="w-full rounded-md border bg-background p-2 text-sm"
      >
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.note ? ` — ${o.note}` : ''}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>

      {custom && (
        <input
          value={effective}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. mistralai/mistral-small-3.1-24b-instruct"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${label} — custom model id`}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      )}

      <p className="text-xs text-muted-foreground">
        {hint ? `${hint} ` : ''}Any model id from openrouter.ai/models works via
        Custom.
      </p>
    </div>
  );
}

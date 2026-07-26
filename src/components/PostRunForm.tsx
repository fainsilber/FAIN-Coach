import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { FEEL_TAGS, type FeelTag } from '@/db/types';
import { useT } from '@/i18n';
import { mostRecentShoeId } from '@/lib/shoes';
import { cn } from '@/lib/utils';

export interface PostRunDetails {
  rpe?: number;
  feelTags: FeelTag[];
  userNotes?: string;
  shoeId?: number;
}

const RPE_VALUES = Array.from({ length: 10 }, (_, i) => i + 1);

export function PostRunForm({
  onSave,
  saving,
}: {
  onSave: (details: PostRunDetails) => void;
  saving: boolean;
}) {
  const t = useT();
  const [rpe, setRpe] = useState<number>();
  const [feelTags, setFeelTags] = useState<FeelTag[]>([]);
  const [notes, setNotes] = useState('');
  const [shoeId, setShoeId] = useState<number | ''>('');

  // Only registered once shoes/runs have loaded, so it doesn't clobber a
  // choice the user already made while data was still arriving.
  const shoes = useLiveQuery(() => db.shoes.toArray());
  const allRuns = useLiveQuery(() => db.runs.toArray());
  const appliedDefault = useRef(false);
  useEffect(() => {
    if (appliedDefault.current || shoes === undefined || allRuns === undefined) {
      return;
    }
    appliedDefault.current = true;
    const defaultId = mostRecentShoeId(shoes, allRuns);
    if (defaultId !== undefined) setShoeId(defaultId);
  }, [shoes, allRuns]);
  const activeShoes = (shoes ?? []).filter((s) => !s.retired);

  const toggleTag = (tag: FeelTag) =>
    setFeelTags((tags) =>
      tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag],
    );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          rpe,
          feelTags,
          userNotes: notes.trim() || undefined,
          shoeId: shoeId === '' ? undefined : shoeId,
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          {t('form.rpeLegend')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {RPE_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={rpe === value}
              onClick={() => setRpe(rpe === value ? undefined : value)}
              className={cn(
                'h-10 w-10 rounded-md border text-sm font-medium',
                rpe === value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-accent',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          {t('form.feelLegend')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {FEEL_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={feelTags.includes(tag)}
              onClick={() => toggleTag(tag)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm',
                feelTags.includes(tag)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-accent',
              )}
            >
              {t(`feel.${tag}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {activeShoes.length > 0 && (
        <label className="block">
          <span className="mb-2 block text-sm font-medium">{t('form.shoe')}</span>
          <select
            value={shoeId}
            onChange={(e) =>
              setShoeId(e.target.value ? Number(e.target.value) : '')
            }
            className="w-full rounded-md border bg-background p-2 text-sm"
          >
            <option value="">{t('form.noShoe')}</option>
            {activeShoes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="mb-2 block text-sm font-medium">{t('form.notes')}</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={t('form.notesPlaceholder')}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? t('form.saving') : t('form.save')}
      </button>
    </form>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/db/db';
import { DEFAULT_RETIREMENT_METERS, type Shoe } from '@/db/types';
import { useI18n } from '@/i18n';
import type { MessageKey } from '@/i18n/en';
import { formatDistanceShort } from '@/lib/format';
import { shoeStatus } from '@/lib/shoes';
import {
  distanceUnitLabel,
  toDisplayDistance,
  toMeters,
} from '@/lib/units';
import { usePreferences } from '@/lib/usePreferences';
import { cn } from '@/lib/utils';

const inputClass = 'w-full rounded-md border bg-background p-2 text-sm';

const BAR_COLOR: Record<'ok' | 'warn' | 'over', string> = {
  ok: 'bg-[var(--chart-pace)]',
  warn: 'bg-[var(--chart-power)]',
  over: 'bg-destructive',
};

/** Shoe tracking (PRD §4.7). Reached from Settings, not the bottom nav —
 * that bar is already full at five items on a 375px screen (dev plan §13.3). */
export function ShoesPage() {
  const { t } = useI18n();
  const { unitSystem } = usePreferences();
  const shoes = useLiveQuery(() => db.shoes.toArray());
  const runs = useLiveQuery(() => db.runs.toArray());

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [initial, setInitial] = useState('');
  const [threshold, setThreshold] = useState(() =>
    String(Math.round(toDisplayDistance(DEFAULT_RETIREMENT_METERS, unitSystem))),
  );
  const [error, setError] = useState<MessageKey>();

  if (shoes === undefined || runs === undefined) return null;

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('shoes.errName');
      return;
    }
    const thresholdNum = Number(threshold);
    if (!Number.isFinite(thresholdNum) || thresholdNum <= 0) {
      setError('shoes.errThreshold');
      return;
    }
    const initialNum = initial.trim() ? Number(initial) : 0;
    if (!Number.isFinite(initialNum) || initialNum < 0) {
      setError('shoes.errInitial');
      return;
    }
    setError(undefined);
    await db.shoes.add({
      name: trimmedName,
      brand: brand.trim() || undefined,
      initialDistanceMeters: toMeters(initialNum, unitSystem),
      retirementDistanceMeters: toMeters(thresholdNum, unitSystem),
      retired: false,
    });
    setName('');
    setBrand('');
    setInitial('');
    setCreating(false);
  }

  async function handleRetire(shoe: Shoe) {
    if (!window.confirm(t('shoes.retireConfirm', { name: shoe.name }))) return;
    await db.shoes.update(shoe.id!, { retired: true });
  }

  async function handleUnretire(shoe: Shoe) {
    await db.shoes.update(shoe.id!, { retired: false });
  }

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t('shoes.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('shoes.subtitle')}</p>
      </div>

      {shoes.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground">{t('shoes.empty')}</p>
      )}

      {shoes.length > 0 && (
        <ul className="space-y-3">
          {shoes.map((shoe) => {
            const status = shoeStatus(shoe, runs);
            return (
              <li
                key={shoe.id}
                className={cn('rounded-lg border p-3', shoe.retired && 'opacity-60')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {shoe.name}
                      {shoe.retired && (
                        <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-xs">
                          {t('shoes.retiredBadge')}
                        </span>
                      )}
                      {!shoe.retired && status.state === 'warn' && (
                        <span className="ms-2 rounded-full bg-[var(--chart-power)]/20 px-2 py-0.5 text-xs">
                          {t('shoes.warnBadge')}
                        </span>
                      )}
                      {!shoe.retired && status.state === 'over' && (
                        <span className="ms-2 rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
                          {t('shoes.overBadge')}
                        </span>
                      )}
                    </p>
                    {shoe.brand && (
                      <p className="text-xs text-muted-foreground">{shoe.brand}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void (shoe.retired ? handleUnretire(shoe) : handleRetire(shoe))
                    }
                    className="shrink-0 text-xs text-muted-foreground underline"
                  >
                    {shoe.retired ? t('shoes.unretire') : t('shoes.retire')}
                  </button>
                </div>
                <div className="mt-2" dir="ltr">
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn('h-full rounded-full', BAR_COLOR[status.state])}
                      style={{ width: `${Math.min(100, Math.max(0, status.percent))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('shoes.progressLine', {
                      used: formatDistanceShort(status.totalMeters, unitSystem),
                      total: formatDistanceShort(
                        shoe.retirementDistanceMeters,
                        unitSystem,
                      ),
                      percent: Math.round(status.percent),
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creating ? (
        <div className="space-y-3 rounded-lg border p-4">
          <label className="block">
            <span className="mb-1 block text-sm">{t('shoes.name')}</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">
              {t('shoes.brand')}{' '}
              <span className="text-muted-foreground">{t('gate.optional')}</span>
            </span>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">
              {t('shoes.initialDistance', { unit: distanceUnitLabel(unitSystem) })}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">
              {t('shoes.retirementDistance', { unit: distanceUnitLabel(unitSystem) })}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="1"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className={inputClass}
            />
          </label>
          {error && <p className="text-sm text-destructive">{t(error)}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {t('shoes.add')}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md border px-4 py-2 text-sm"
            >
              {t('manual.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent"
        >
          {t('shoes.addNew')}
        </button>
      )}
    </section>
  );
}

import { useRegisterSW } from 'virtual:pwa-register/react';
import { useT } from '@/i18n';
import { logEvent } from '@/lib/log';
import { setSwRegistration } from '@/lib/swUpdate';

/**
 * Explicit, visible update prompt (PRD FR-8.3) — replaces the previous
 * silent `registerType: 'autoUpdate'` behaviour, which reloaded the page on
 * its own with no signal either way (dev plan §14.1/§14.3).
 */
export function UpdateBanner() {
  const t = useT();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      setSwRegistration(registration);
    },
    onRegisterError(error) {
      void logEvent('warn', 'sw.register.failed', String(error));
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground">
      <span>{t('update.available')}</span>
      <button
        type="button"
        onClick={() => {
          void logEvent('info', 'sw.update.applied');
          void updateServiceWorker(true);
        }}
        className="shrink-0 rounded-md border border-primary-foreground/40 px-3 py-1 font-medium"
      >
        {t('update.reload')}
      </button>
    </div>
  );
}

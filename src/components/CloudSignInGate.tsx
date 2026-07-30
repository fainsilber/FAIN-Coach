import { useEffect, useState, type ReactNode } from 'react';
import { db } from '@/db/db';
import type { FainCoachCloudDB } from '@/db/db';
import { useT } from '@/i18n';

// Sprint 11 — sign-in gate for the CLOUD deployment (dev plan §12.2).
//
// Only rendered when the build has a Dexie Cloud URL. On that deployment the
// account IS the identity, so this replaces the local profile picker rather
// than sitting alongside it. The local/free deployment never mounts this and
// never loads the addon at all.
//
// The addon is configured with `customLoginGui: true`, which means it does not
// draw its own dialogs — it publishes what it needs on
// `db.cloud.userInteraction` and waits for us to collect it. That is why this
// renders generic fields from the emitted descriptor instead of hard-coding an
// email box: the same component handles the email prompt, the OTP prompt, and
// any future step (a password, an MFA code) without changing.

/** Shape of what `db.cloud.userInteraction` emits. Declared locally rather
 * than imported so the local/free build — where the addon is aliased out
 * entirely — still typechecks. */
interface CloudField {
  type: 'text' | 'email' | 'otp' | 'password';
  label?: string;
  placeholder?: string;
}

interface CloudAlert {
  type: 'error' | 'warning' | 'info';
  /** Contains `{token}` placeholders that the GUI must substitute from
   * `messageParams` — the addon does NOT pre-interpolate them. Rendering
   * `message` raw shows the user a literal "{email}". */
  message: string;
  messageParams?: Record<string, string>;
  /** Occasionally a CLI command the user needs (e.g. when an account isn't
   * registered yet), which is useless unless it can be copied. */
  copyText?: string;
}

interface CloudInteraction {
  type: string;
  title: string;
  alerts?: CloudAlert[];
  fields: Record<string, CloudField>;
  submitLabel?: string;
  cancelLabel?: string | null;
  onSubmit: (values: Record<string, string>) => void;
  onCancel?: () => void;
}

interface CloudUser {
  name?: string;
  email?: string;
  isLoggedIn?: boolean;
}

const ALERT_CLASS: Record<CloudAlert['type'], string> = {
  error: 'border-destructive/40 text-destructive',
  warning: 'border-destructive/30 text-foreground',
  info: 'border-border text-muted-foreground',
};

/** `otp` is not a real input type; browsers need `text` plus numeric hints. */
function inputTypeFor(field: CloudField): string {
  return field.type === 'otp' ? 'text' : field.type;
}

/** Substitutes `{token}` placeholders from the alert's own params. Unknown
 * tokens are left intact rather than blanked — a visible `{foo}` is a bug
 * report, whereas a silently empty sentence is just confusing. */
function alertText(alert: CloudAlert): string {
  const params = alert.messageParams;
  if (!params) return alert.message;
  return alert.message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? params[name] : match,
  );
}

export function CloudSignInGate({ children }: { children: ReactNode }) {
  const t = useT();
  const cloud = (db as FainCoachCloudDB).cloud;
  const [interaction, setInteraction] = useState<CloudInteraction>();
  const [user, setUser] = useState<CloudUser>();
  const [busy, setBusy] = useState(false);

  // Plain subscriptions rather than useObservable: these are RxJS observables
  // from the addon, and going through the raw API keeps this component free of
  // any import that would break the local build.
  useEffect(() => {
    const subs = [
      cloud.userInteraction.subscribe((next: CloudInteraction | undefined) => {
        setInteraction(next);
        // A new prompt (or the prompt clearing) means the previous submit
        // resolved — stop showing the spinner even if it failed.
        setBusy(false);
      }),
      cloud.currentUser.subscribe((next: CloudUser) => setUser(next)),
    ];
    return () => subs.forEach((s) => s.unsubscribe());
  }, [cloud]);

  // requireAuth:true makes the addon start its own login flow, so there is
  // nothing to kick off here. Signed in → the app, unchanged.
  if (user?.isLoggedIn) return <>{children}</>;

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">{t('cloud.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('cloud.subtitle')}
        </p>
      </div>

      {interaction ? (
        <form
          className="space-y-4 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(
              new FormData(e.currentTarget).entries(),
            ) as Record<string, string>;
            setBusy(true);
            interaction.onSubmit(values);
          }}
        >
          <h2 className="font-medium" dir="auto">
            {interaction.title}
          </h2>

          {interaction.alerts?.map((alert, i) => (
            <div
              key={i}
              dir="auto"
              className={`rounded-md border p-2 text-sm ${ALERT_CLASS[alert.type]}`}
            >
              <p>{alertText(alert)}</p>
              {alert.copyText && (
                <code
                  dir="ltr"
                  className="mt-1 block overflow-x-auto whitespace-pre rounded bg-secondary/60 p-1.5 text-xs"
                >
                  {alert.copyText}
                </code>
              )}
            </div>
          ))}

          {Object.entries(interaction.fields).map(([name, field]) => (
            <label key={name} className="block">
              <span className="mb-1 block text-sm">
                {field.label ?? t('cloud.email')}
              </span>
              <input
                name={name}
                type={inputTypeFor(field)}
                placeholder={field.placeholder}
                required
                autoFocus
                // Both an email address and a one-time code are Latin-script
                // and must not be mirrored inside an RTL page (FR-5.3).
                dir="ltr"
                autoComplete={field.type === 'otp' ? 'one-time-code' : 'email'}
                inputMode={field.type === 'otp' ? 'numeric' : 'email'}
                className="w-full rounded-md border bg-background p-2 text-sm"
              />
            </label>
          ))}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy
                ? t('cloud.working')
                : (interaction.submitLabel ?? t('cloud.continue'))}
            </button>
            {interaction.cancelLabel && interaction.onCancel && (
              <button
                type="button"
                onClick={() => interaction.onCancel?.()}
                className="rounded-md border px-4 py-2 text-sm"
              >
                {interaction.cancelLabel}
              </button>
            )}
          </div>
        </form>
      ) : (
        // Between prompts the addon is talking to the server — say so rather
        // than showing an empty screen that looks broken.
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('cloud.connecting')}
        </p>
      )}

      <p className="text-xs text-muted-foreground">{t('cloud.privacyNote')}</p>
    </div>
  );
}

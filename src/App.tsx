import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { CloudSignInGate, useCloudUser } from './components/CloudSignInGate';
import { ProfileGate } from './components/ProfileGate';
import { UpdateBanner } from './components/UpdateBanner';
import { db, type FainCoachCloudDB } from './db/db';
import { isCloudBuild } from './db/cloudConfig';
import { useT } from './i18n';
import type { MessageKey } from './i18n/en';
import { clearActiveProfile, getActiveProfile } from './lib/profiles';
import { ChatPage } from './pages/ChatPage';
import { HistoryPage } from './pages/HistoryPage';
import { ManualRunPage } from './pages/ManualRunPage';
import { PlanPage } from './pages/PlanPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShoesPage } from './pages/ShoesPage';
import { UploadPage } from './pages/UploadPage';

// Recharts lives only in the run detail route — keep it out of the main chunk.
const RunDetailPage = lazy(() =>
  import('./pages/RunDetailPage').then((m) => ({ default: m.RunDetailPage })),
);

const navItems: Array<{ to: string; labelKey: MessageKey }> = [
  { to: '/', labelKey: 'nav.history' },
  { to: '/upload', labelKey: 'nav.upload' },
  { to: '/chat', labelKey: 'nav.coach' },
  { to: '/plan', labelKey: 'nav.plan' },
  { to: '/settings', labelKey: 'nav.settings' },
];

/**
 * Which identity model applies is decided by the DEPLOYMENT, not by a setting
 * (dev plan §12.2):
 *
 * - Local/free build (GitHub Pages): local profiles, no sign-in.
 * - Cloud build (Cloudflare): an account, and signing in is required. Profiles
 *   don't apply — the account is the identity.
 *
 * `isCloudBuild()` folds to a constant, so the branch not taken is dropped
 * along with everything it references.
 */
export function App() {
  return isCloudBuild() ? <CloudApp /> : <LocalApp />;
}

function LocalApp() {
  const t = useT();
  const profile = getActiveProfile();

  // Mounted regardless of profile state, so an update can be offered even
  // before a profile is chosen.
  if (!profile) {
    return (
      <>
        <UpdateBanner />
        <ProfileGate />
      </>
    );
  }

  return (
    <AppShell
      identityChip={
        <button
          type="button"
          onClick={() => {
            clearActiveProfile();
            window.location.reload();
          }}
          className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
          title={t('app.switchProfileTitle')}
        >
          {t('app.switchProfile', { name: profile.name })}
        </button>
      }
    />
  );
}

function CloudApp() {
  return (
    <>
      <UpdateBanner />
      <CloudSignInGate>
        <AppShell identityChip={<CloudIdentityChip />} />
      </CloudSignInGate>
    </>
  );
}

/**
 * Which account you are signed in as, next to the sign-out button. On a shared
 * or multi-account device "am I in the right account?" is otherwise
 * unanswerable without signing out to find out.
 *
 * The address is `<bdi>`-isolated and truncated: an email is LTR even in a
 * Hebrew interface, and a long one must not push the sign-out button off a
 * phone screen.
 */
function CloudIdentityChip() {
  const t = useT();
  const user = useCloudUser();
  return (
    <div className="flex min-w-0 items-center gap-2">
      {user?.email && (
        <span
          className="max-w-[45vw] truncate text-xs text-muted-foreground sm:max-w-xs"
          title={user.email}
        >
          <bdi>{user.email}</bdi>
        </span>
      )}
      <button
        type="button"
        onClick={() => void (db as FainCoachCloudDB).cloud.logout()}
        className="shrink-0 rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
      >
        {t('cloud.signOut')}
      </button>
    </div>
  );
}

function AppShell({ identityChip }: { identityChip: ReactNode }) {
  const t = useT();
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="flex min-h-dvh flex-col">
        {/* Cloud builds mount this above the sign-in gate instead, so an
            update can be applied without getting past login first. */}
        {!isCloudBuild() && <UpdateBanner />}
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-lg font-semibold">FAIN Coach</h1>
          {identityChip}
        </header>
        <main className="flex flex-1 flex-col p-4">
          <Routes>
            <Route path="/" element={<HistoryPage />} />
            <Route
              path="/runs/:id"
              element={
                <Suspense fallback={null}>
                  <RunDetailPage />
                </Suspense>
              }
            />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/upload/manual" element={<ManualRunPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/shoes" element={<ShoesPage />} />
          </Routes>
        </main>
        <nav className="sticky bottom-0 flex border-t bg-background pb-[env(safe-area-inset-bottom)]">
          {navItems.map(({ to, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `min-h-11 flex-1 py-3 text-center text-sm ${isActive ? 'font-semibold' : 'text-muted-foreground'}`
              }
            >
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
      </div>
    </BrowserRouter>
  );
}

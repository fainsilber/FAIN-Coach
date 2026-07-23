import { lazy, Suspense } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { ProfileGate } from './components/ProfileGate';
import { useT } from './i18n';
import type { MessageKey } from './i18n/en';
import { clearActiveProfile, getActiveProfile } from './lib/profiles';
import { ChatPage } from './pages/ChatPage';
import { HistoryPage } from './pages/HistoryPage';
import { PlanPage } from './pages/PlanPage';
import { SettingsPage } from './pages/SettingsPage';
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

export function App() {
  const t = useT();
  const profile = getActiveProfile();

  if (!profile) return <ProfileGate />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-lg font-semibold">FAIN Coach</h1>
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
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/settings" element={<SettingsPage />} />
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

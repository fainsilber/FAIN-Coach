import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { ProfileGate } from './components/ProfileGate';
import { clearActiveProfile, getActiveProfile } from './lib/profiles';
import { ChatPage } from './pages/ChatPage';
import { HistoryPage } from './pages/HistoryPage';
import { PlanPage } from './pages/PlanPage';
import { RunDetailPage } from './pages/RunDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { UploadPage } from './pages/UploadPage';

const navItems = [
  { to: '/', label: 'History' },
  { to: '/upload', label: 'Upload' },
  { to: '/chat', label: 'Coach' },
  { to: '/plan', label: 'Plan' },
  { to: '/settings', label: 'Settings' },
];

export function App() {
  const profile = getActiveProfile();

  if (!profile) return <ProfileGate />;

  return (
    <BrowserRouter>
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
            title="Switch profile"
          >
            {profile.name} · switch
          </button>
        </header>
        <main className="flex-1 p-4">
          <Routes>
            <Route path="/" element={<HistoryPage />} />
            <Route path="/runs/:id" element={<RunDetailPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <nav className="sticky bottom-0 flex justify-around border-t bg-background py-2">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-2 text-sm ${isActive ? 'font-semibold' : 'text-muted-foreground'}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </BrowserRouter>
  );
}

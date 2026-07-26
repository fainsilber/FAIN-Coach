import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './i18n';
import { logEvent } from './lib/log';
import './index.css';

// Diagnostics (PRD FR-8.5): catch what an in-app try/catch never sees.
window.addEventListener('error', (event) => {
  void logEvent('error', 'window.error', event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  void logEvent('error', 'window.unhandledrejection', String(event.reason));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './styles/index.css';

// A tab opened before a deploy still references the previous build's
// chunk names, which no longer exist once the new build is live. Vite
// raises `vite:preloadError` when such a lazy page fails to load; reload
// once to pick up the current build instead of showing an error. The
// timestamp guard stops a reload loop if the failure is real (offline).
window.addEventListener('vite:preloadError', event => {
  const KEY = 'oes:chunk-reload-at';
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY)) || 0;
  } catch {
    // Storage unavailable (private mode); fall through and reload once.
  }
  if (Date.now() - last < 30_000) return;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Ignore; the guard is best-effort.
  }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

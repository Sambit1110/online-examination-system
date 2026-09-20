import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Inline error banner for a failure that sits alongside otherwise usable
 * content (a panel that failed to refresh, a form that rejected a save).
 * Announced politely so a screen reader picks it up without stealing focus.
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onRetry }) => (
  <div className="error-banner" role="alert">
    <AlertTriangle size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
    <span style={{ flex: 1 }}>{message}</span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="btn btn-secondary btn-sm">
        <RotateCcw size={13} aria-hidden="true" /> Retry
      </button>
    )}
  </div>
);

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

/**
 * Full-panel error state, used where a fetch failed outright and there is
 * nothing else meaningful to show in that region.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Unable to load this section',
  message,
  onRetry
}) => (
  <div className="state-panel" role="alert">
    <div className="state-panel__icon state-panel__icon--danger" aria-hidden="true">
      <AlertTriangle size={26} strokeWidth={1.75} />
    </div>
    <div className="state-panel__title">{title}</div>
    <p className="state-panel__desc">{message}</p>
    {onRetry && (
      <button type="button" onClick={onRetry} className="btn btn-secondary">
        <RotateCcw size={14} aria-hidden="true" /> Try again
      </button>
    )}
  </div>
);

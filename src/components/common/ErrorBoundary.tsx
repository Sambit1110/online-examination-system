import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last line of defence: a render-time crash anywhere in the tree shows a
 * recoverable panel instead of a blank white page. Reloading is offered
 * rather than performed automatically — during an exam, an unattended
 * reload could cost a candidate their place in the paper.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash-screen" role="alert">
        <div className="crash-screen__card card">
          <div className="state-panel__icon state-panel__icon--danger" aria-hidden="true">
            <AlertTriangle size={26} strokeWidth={1.75} />
          </div>
          <h1 className="crash-screen__title">Something went wrong</h1>
          <p className="crash-screen__desc">
            The page hit an unexpected error and stopped rendering. Your saved exam answers are
            stored on the server and are not affected.
          </p>
          <p className="crash-screen__detail">{error.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <RotateCcw size={14} aria-hidden="true" /> Reload the portal
          </button>
        </div>
      </div>
    );
  }
}

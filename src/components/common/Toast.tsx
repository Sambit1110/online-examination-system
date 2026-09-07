import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      maxWidth: '380px'
    }}>
      {toasts.map(t => {
        let bg = 'var(--bg-surface-secondary)';
        let border = 'var(--border-prominent)';
        let icon = <Info size={18} color="var(--color-action)" />;

        if (t.type === 'success') {
          bg = 'var(--color-success-bg)';
          border = 'var(--color-success-border)';
          icon = <CheckCircle2 size={18} color="var(--color-success)" />;
        } else if (t.type === 'error') {
          bg = 'var(--color-danger-bg)';
          border = 'var(--color-danger-border)';
          icon = <AlertCircle size={18} color="var(--color-danger)" />;
        }

        return (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              backgroundColor: bg,
              border: `1px solid ${border}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              boxShadow: 'var(--shadow-md)',
              fontSize: '0.875rem',
              color: 'var(--text-main)',
              animation: 'toastSlidePop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {icon}
              <span>{t.message}</span>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '0.2rem'
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

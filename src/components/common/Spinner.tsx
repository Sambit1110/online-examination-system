import React from 'react';

interface SpinnerProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Spinner: React.FC<SpinnerProps> = ({ label, size = 'md', fullWidth = true }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        padding: fullWidth ? '3rem 0' : 0,
        width: fullWidth ? '100%' : 'auto'
      }}
      role="status"
      aria-live="polite"
    >
      <div className={`spinner spinner-${size}`} />
      {label && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{label}</p>
      )}
    </div>
  );
};

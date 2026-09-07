import React from 'react';

interface BadgeProps {
  type: 'live' | 'scheduled' | 'completed' | 'released' | 'draft' | 'pass' | 'fail' | 'in_progress';
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ type, children }) => {
  let style: React.CSSProperties = {};
  let dot = null;

  switch (type) {
    case 'live':
      style = {
        backgroundColor: 'var(--color-success-bg)',
        color: 'var(--color-success)',
        border: '1px solid var(--color-success-border)'
      };
      dot = <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: 'var(--color-success)', color: 'var(--color-success)', display: 'inline-block', animation: 'badgeDotRing 1.8s ease-in-out infinite' }} />;
      break;
    case 'scheduled':
      style = {
        backgroundColor: 'var(--color-warning-bg)',
        color: 'var(--color-warning)',
        border: '1px solid var(--color-warning-border)'
      };
      break;
    case 'completed':
      style = {
        backgroundColor: 'var(--bg-surface-muted)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)'
      };
      break;
    case 'released':
      style = {
        backgroundColor: 'var(--color-accent-indigo-bg)',
        color: 'var(--color-brand-secondary)',
        border: '1px solid var(--color-accent-indigo-border)'
      };
      break;
    case 'draft':
      style = {
        backgroundColor: 'var(--bg-surface-secondary)',
        color: 'var(--text-muted)',
        border: '1px solid var(--border-subtle)'
      };
      break;
    case 'pass':
      style = {
        backgroundColor: 'var(--color-success-bg)',
        color: 'var(--color-success)',
        border: '1px solid var(--color-success-border)',
        fontWeight: 600
      };
      break;
    case 'fail':
      style = {
        backgroundColor: 'var(--color-danger-bg)',
        color: 'var(--color-danger)',
        border: '1px solid var(--color-danger-border)',
        fontWeight: 600
      };
      break;
    case 'in_progress':
      style = {
        backgroundColor: 'var(--color-accent-cyan-bg)',
        color: 'var(--color-accent-cyan)',
        border: '1px solid var(--color-accent-cyan-border)'
      };
      dot = <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: 'var(--color-accent-cyan)', color: 'var(--color-accent-cyan)', display: 'inline-block', animation: 'badgeDotRing 1.8s ease-in-out infinite' }} />;
      break;
  }

  return (
    <span className="badge" style={style}>
      {dot}
      {children}
    </span>
  );
};

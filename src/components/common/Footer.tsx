import React from 'react';

interface FooterProps {
  minimal?: boolean;
}

export const Footer: React.FC<FooterProps> = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer style={{
      backgroundColor: 'var(--bg-surface)',
      borderTop: '1px solid var(--border-subtle)',
      marginTop: 'auto',
      padding: '1rem 1.5rem',
      fontSize: '0.8125rem',
      color: 'var(--text-secondary)'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
            Adamas University
          </span>
          <span style={{ color: 'var(--text-muted)' }}>•</span>
          <span>Online Examination System</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>Department of Computer Science & Engineering</span>
          <span>•</span>
          <span>© {currentYear}</span>
        </div>
      </div>
    </footer>
  );
};

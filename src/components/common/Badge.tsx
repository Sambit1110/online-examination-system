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
        backgroundColor: '#f0fdf4',
        color: '#15803d',
        border: '1px solid #bbf7d0'
      };
      dot = <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#16a34a', display: 'inline-block' }} />;
      break;
    case 'scheduled':
      style = {
        backgroundColor: '#fffbeb',
        color: '#b45309',
        border: '1px solid #fde68a'
      };
      break;
    case 'completed':
      style = {
        backgroundColor: '#f1f5f9',
        color: '#475569',
        border: '1px solid #e2e8f0'
      };
      break;
    case 'released':
      style = {
        backgroundColor: '#eef2ff',
        color: '#4338ca',
        border: '1px solid #c7d2fe'
      };
      break;
    case 'draft':
      style = {
        backgroundColor: '#f8fafc',
        color: '#64748b',
        border: '1px solid #e2e8f0'
      };
      break;
    case 'pass':
      style = {
        backgroundColor: '#f0fdf4',
        color: '#15803d',
        border: '1px solid #bbf7d0',
        fontWeight: 600
      };
      break;
    case 'fail':
      style = {
        backgroundColor: '#fef2f2',
        color: '#b91c1c',
        border: '1px solid #fecaca',
        fontWeight: 600
      };
      break;
    case 'in_progress':
      style = {
        backgroundColor: '#eff6ff',
        color: '#1d4ed8',
        border: '1px solid #bfdbfe'
      };
      dot = <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#2563eb', display: 'inline-block' }} />;
      break;
  }

  return (
    <span className="badge" style={style}>
      {dot}
      {children}
    </span>
  );
};

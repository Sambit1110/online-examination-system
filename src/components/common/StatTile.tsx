import React from 'react';

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  valueColor?: string;
  className?: string;
}

export const StatTile: React.FC<StatTileProps> = ({ label, value, meta, icon, valueColor, className }) => {
  return (
    <div className={`card card-hover stat-tile ${className || ''}`}>
      <div>
        <div className="stat-tile__label">{label}</div>
        <div className="stat-tile__value" style={valueColor ? { color: valueColor } : undefined}>
          {value}
        </div>
        {meta && <div className="stat-tile__meta">{meta}</div>}
      </div>
      {icon && <div className="stat-tile__icon">{icon}</div>}
    </div>
  );
};

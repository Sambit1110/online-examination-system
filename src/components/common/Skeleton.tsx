import React from 'react';

interface SkeletonProps {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  radius = 'var(--radius-sm)',
  className
}) => (
  <span
    className={`skeleton ${className || ''}`}
    style={{ width, height, borderRadius: radius, display: 'block' }}
  />
);

/**
 * Placeholder that mirrors the shape of a loaded table, so the layout does
 * not jump when real rows arrive. Marked `aria-hidden` with a polite status
 * message alongside — a screen reader hears "Loading", not fifty empty cells.
 */
export const SkeletonTable: React.FC<{ rows?: number; columns?: number; label?: string }> = ({
  rows = 6,
  columns = 5,
  label = 'Loading records'
}) => (
  <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}…</span>
    <div className="skeleton-table" aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="skeleton-table__row" key={rowIndex}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Skeleton
              key={colIndex}
              height="0.85rem"
              width={colIndex === 0 ? '80%' : '55%'}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

/** Card-grid placeholder for the dashboards. */
export const SkeletonCards: React.FC<{ count?: number; height?: string; label?: string }> = ({
  count = 3,
  height = '150px',
  label = 'Loading'
}) => (
  <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}…</span>
    <div className="skeleton-cards" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} height={height} radius="var(--radius-md)" />
      ))}
    </div>
  </div>
);

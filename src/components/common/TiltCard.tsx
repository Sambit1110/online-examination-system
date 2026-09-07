import React, { useRef, useCallback } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Maximum tilt rotation in degrees. Keep small for a "subtle" premium feel. */
  maxTilt?: number;
  /** Slight scale-up on hover to reinforce the lift. */
  scale?: number;
  disabled?: boolean;
}

/**
 * Wraps content in a perspective container and applies a pointer-driven
 * 3D tilt (rotateX/rotateY) plus a soft moving glare highlight — a real
 * transform, not just a shadow. Pure CSS/JS, no WebGL, so it stays cheap
 * even on cards that appear dozens of times on a dashboard. Disabled
 * automatically when the user prefers reduced motion.
 */
export const TiltCard: React.FC<TiltCardProps> = ({
  children,
  className,
  style,
  maxTilt = 8,
  scale = 1.015,
  disabled = false
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const isActive = !disabled && !reducedMotion;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isActive || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * maxTilt * 2;
    const rotateX = (0.5 - py) * maxTilt * 2;

    cardRef.current.style.transition = 'transform 0.12s ease-out';
    cardRef.current.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;
    cardRef.current.style.setProperty('--glare-x', `${px * 100}%`);
    cardRef.current.style.setProperty('--glare-y', `${py * 100}%`);
  }, [isActive, maxTilt, scale]);

  const handleMouseLeave = useCallback(() => {
    if (!cardRef.current) return;
    cardRef.current.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
    cardRef.current.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)';
  }, []);

  return (
    <div className="tilt-wrap" style={{ position: 'relative' }}>
      <div
        ref={cardRef}
        className={`tilt-card ${className || ''}`}
        style={{ position: 'relative', ...style }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {children}
        {isActive && <div className="tilt-card__glare" />}
      </div>
    </div>
  );
};

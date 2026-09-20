import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type { SceneVariant } from './HeroScene';

// Code-split: three.js + fiber + drei only download for a visitor who is
// actually looking at a surface that uses them, and never for the exam screen.
const HeroScene = lazy(() => import('./HeroScene').then(m => ({ default: m.HeroScene })));

interface HeroBackgroundProps {
  variant?: SceneVariant;
  className?: string;
}

/**
 * Ambient 3D layer. Purely decorative (`pointer-events: none`,
 * `aria-hidden`), so it can never interfere with a form or a screen reader.
 *
 * Three gates before any WebGL is downloaded:
 *  - the user has not asked for reduced motion,
 *  - the device is not a small viewport (CSS hides the layer there anyway,
 *    so downloading three.js for it would be pure waste),
 *  - the layer has actually scrolled into view.
 */
export const HeroBackground: React.FC<HeroBackgroundProps> = ({ variant = 'hero', className }) => {
  const reducedMotion = usePrefersReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;

    // Matches the `display: none` breakpoint on .hero-canvas-layer.
    if (window.matchMedia('(max-width: 640px)').matches) return;

    const node = hostRef.current;
    if (!node) return;

    if (!('IntersectionObserver' in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <div
      ref={hostRef}
      className={`hero-canvas-layer${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {shouldRender && (
        <Suspense fallback={null}>
          <HeroScene variant={variant} />
        </Suspense>
      )}
    </div>
  );
};

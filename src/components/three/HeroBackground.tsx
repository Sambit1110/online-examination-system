import React, { Suspense, lazy } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

// Code-split: three.js + @react-three/fiber + @react-three/drei only ever
// download for a visitor who is on the login screen and hasn't asked for
// reduced motion. Every authenticated screen never pays this cost.
const HeroScene = lazy(() => import('./HeroScene').then(m => ({ default: m.HeroScene })));

/**
 * Ambient 3D background layer — floating geometric shapes behind the login
 * hero. Purely decorative (pointer-events: none), so it never interferes
 * with the actual form. Skipped entirely under prefers-reduced-motion.
 *
 * Small-viewport handling is left to the CSS media query on
 * `.hero-canvas-layer` (see index.css) — display:none there is resolved by
 * the real layout engine at paint time, unlike a one-off JS width check.
 */
export const HeroBackground: React.FC = () => {
  const reducedMotion = usePrefersReducedMotion();

  if (reducedMotion) return null;

  return (
    <div className="hero-canvas-layer" aria-hidden="true">
      <Suspense fallback={null}>
        <HeroScene />
      </Suspense>
    </div>
  );
};

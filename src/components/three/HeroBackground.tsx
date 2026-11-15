import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type { SceneVariant } from './HeroScene';

// Code-split: three.js + fiber + drei only download for a visitor who is
// actually looking at a surface that uses them, and never for the exam screen.
//
// The layer is purely decorative, so a failed download (offline, or a tab
// still running a build whose chunk a newer deploy has replaced) must
// render nothing, never reach the app-wide error boundary.
const HeroScene = lazy(() =>
  import('./HeroScene')
    .then(m => ({ default: m.HeroScene }))
    .catch(err => {
      console.warn('3D background skipped:', err);
      const Nothing: React.FC<{ variant?: SceneVariant }> = () => null;
      return { default: Nothing };
    })
);

/** Contains a WebGL/render failure inside the decorative layer. */
class SceneErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.warn('3D background disabled after an error:', err);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface HeroBackgroundProps {
  variant?: SceneVariant;
  className?: string;
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * The 3D chunk is ~800 kB (≈220 kB gzipped). On a slow or metered link
 * that is bandwidth the login request itself needs, so it is skipped.
 */
const isConstrainedNetwork = (): boolean => {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g' || connection.effectiveType === '3g';
};

/** Runs `callback` once the browser is idle, so the 3D download never competes with the page's own first paint. */
const whenIdle = (callback: () => void): (() => void) => {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  // `globalThis`, not `window`: after the `in` check above TypeScript
  // narrows `window` to `never` on this branch.
  const id = globalThis.setTimeout(callback, 600);
  return () => globalThis.clearTimeout(id);
};

/**
 * Ambient 3D layer. Purely decorative (`pointer-events: none`,
 * `aria-hidden`), so it can never interfere with a form or a screen reader.
 *
 * Five gates before any WebGL is downloaded:
 *  - the user has not asked for reduced motion,
 *  - the device is not a small viewport (CSS hides the layer there anyway,
 *    so downloading three.js for it would be pure waste),
 *  - the connection is not slow or in data-saver mode,
 *  - the layer has actually scrolled into view,
 *  - the browser is idle (the form is already usable).
 */
export const HeroBackground: React.FC<HeroBackgroundProps> = ({ variant = 'hero', className }) => {
  const reducedMotion = usePrefersReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;

    // Matches the `display: none` breakpoint on .hero-canvas-layer.
    if (window.matchMedia('(max-width: 640px)').matches) return;
    if (isConstrainedNetwork()) return;

    const node = hostRef.current;
    if (!node) return;

    let cancelIdle: (() => void) | null = null;
    const renderWhenIdle = () => {
      cancelIdle = whenIdle(() => setShouldRender(true));
    };

    if (!('IntersectionObserver' in window)) {
      renderWhenIdle();
      return () => cancelIdle?.();
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          observer.disconnect();
          renderWhenIdle();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelIdle?.();
    };
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <div
      ref={hostRef}
      className={`hero-canvas-layer${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {shouldRender && (
        <SceneErrorBoundary>
          <Suspense fallback={null}>
            <HeroScene variant={variant} />
          </Suspense>
        </SceneErrorBoundary>
      )}
    </div>
  );
};

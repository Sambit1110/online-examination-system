import { useEffect, RefObject } from 'react';

/**
 * Settles every `[data-reveal]` element inside `rootRef` into place as it
 * scrolls into view.
 *
 * Content is visible by default: the hidden start state only applies while
 * the root carries `reveal-armed`, which is added here, by script, and never
 * under reduced motion. If this hook never runs (no JS, an old browser, a
 * screenshot tool) the page is simply static and complete.
 *
 * `data-reveal-delay="2"` staggers an element by two steps.
 */
export const useScrollReveal = (rootRef: RefObject<HTMLElement>, deps: unknown[] = []) => {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A background tab pauses animation, so arming there would leave the
    // page in its hidden start state; it simply renders static instead.
    if (reduceMotion || document.hidden || !('IntersectionObserver' in window)) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])'));
    if (targets.length === 0) return;

    root.classList.add('reveal-armed');

    const reveal = (el: Element) => el.setAttribute('data-revealed', 'true');

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );

    targets.forEach(el => observer.observe(el));

    // Failsafe: anything on screen must never stay hidden, even if the
    // observer is throttled and never reports it.
    const failsafe = window.setTimeout(() => {
      for (const el of targets) {
        if (el.hasAttribute('data-revealed')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) reveal(el);
      }
    }, 1200);

    // Leaving the tab mid-animation: drop the start state for good.
    const onHide = () => {
      if (document.hidden) {
        targets.forEach(reveal);
        root.classList.remove('reveal-armed');
      }
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
      document.removeEventListener('visibilitychange', onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};

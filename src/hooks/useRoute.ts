import { useCallback, useEffect, useState } from 'react';

/**
 * The two authentication portals are genuinely separate pages with their own
 * URLs; everything after sign-in stays on the existing in-app `currentView`
 * switching. This is the smallest thing that gives us real routes without
 * pulling in a router: the History API plus a popstate listener.
 *
 * vercel.json already rewrites every non-/api path to index.html, so these
 * paths survive a hard refresh and a pasted link.
 */
export const ROUTES = {
  studentLogin: '/student-login',
  adminLogin: '/admin-login',
  app: '/'
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

const readPath = (): string =>
  typeof window === 'undefined' ? ROUTES.app : window.location.pathname;

export function useRoute(): { path: string; navigate: (to: string, replace?: boolean) => void } {
  const [path, setPath] = useState<string>(readPath);

  useEffect(() => {
    const onPop = () => setPath(readPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, replace = false) => {
    if (readPath() === to) return;
    if (replace) window.history.replaceState({}, '', to);
    else window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return { path, navigate };
}

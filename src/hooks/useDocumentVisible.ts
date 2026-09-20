import { useEffect, useState } from 'react';

/**
 * Tracks whether the tab is currently visible. Polling loops use this to
 * pause while the operator is looking at something else, so a dashboard
 * left open in a background tab stops issuing requests entirely.
 */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden
  );

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}

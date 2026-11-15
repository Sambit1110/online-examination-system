import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * Whether the browser build actually received its Supabase credentials.
 *
 * Throwing here at module-evaluation time would take the whole bundle down
 * before React mounts, so a deployment that is missing an environment
 * variable renders a blank white page with nothing but a console error.
 * Instead the app boots and shows an actionable configuration screen.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (!isSupabaseConfigured) {
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill in your Supabase project credentials (see README.md).'
  );
}

// The publishable key is safe to ship to the browser by design — it
// identifies the project, not a privileged user. All real authorization
// happens via Row Level Security policies (see supabase/migrations),
// enforced per-request based on the caller's authenticated session. The
// secret key (which bypasses RLS entirely) must never appear here or
// anywhere under src/.
/**
 * No request may wait forever. Without a limit, an unreachable project
 * (paused, or a dropped connection) leaves the boot spinner up
 * indefinitely instead of telling the user something is wrong.
 */
const REQUEST_TIMEOUT_MS = 15_000;

const fetchWithTimeout: typeof fetch = (input, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const callerSignal = init.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

export const supabase = createClient(
  supabaseUrl || 'https://unconfigured.supabase.co',
  supabasePublishableKey || 'unconfigured',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    global: { fetch: fetchWithTimeout }
  }
);

/**
 * Resolves `false` when the Supabase project cannot be reached at all
 * (DNS failure, project paused, offline). Any HTTP answer, even an error
 * status, means the service is up.
 */
export const isSupabaseReachable = async (timeoutMs = 6_000): Promise<boolean> => {
  if (!isSupabaseConfigured) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabasePublishableKey as string },
      signal: controller.signal
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

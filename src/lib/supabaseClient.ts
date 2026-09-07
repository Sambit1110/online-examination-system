import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill in your Supabase project credentials (see README.md).'
  );
}

// The publishable key is safe to ship to the browser by design — it
// identifies the project, not a privileged user. All real authorization
// happens via Row Level Security policies (see supabase/migrations),
// enforced per-request based on the caller's authenticated session. The
// secret key (which bypasses RLS entirely) must never appear here or
// anywhere under src/.
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

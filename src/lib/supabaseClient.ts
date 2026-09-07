import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project credentials (see README.md).'
  );
}

// The anon key is safe to ship to the browser by design — it identifies the
// project, not a privileged user. All real authorization happens via Row
// Level Security policies (see supabase/migrations), enforced per-request
// based on the caller's authenticated session. The service_role key (which
// bypasses RLS entirely) must never appear here or anywhere under src/.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

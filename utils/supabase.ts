import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Previously this used `process.env.NEXT_PUBLIC_SUPABASE_URL!` — a non-null
// assertion on a value that is genuinely absent when no .env.local exists.
// createClient then threw during module evaluation, which took down the whole
// production build while prerendering pages that do not even use Supabase
// (the error surfaced on /_not-found).
//
// Missing configuration is now a loud, attributable warning rather than an
// unrelated build crash. Calls still fail, but they fail where you made them.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False when the app is running without Supabase credentials. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.error(
    'Supabase is not configured. Copy .env.local.example to .env.local and set ' +
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Sign-in, report submission and the admin console will not work until you do.'
  );
}

// Syntactically valid placeholders keep module evaluation (and therefore the
// build) alive when credentials are absent.
const PLACEHOLDER_URL = 'http://localhost:54321';
const PLACEHOLDER_KEY = 'missing-anon-key';

const globalForSupabase = global as unknown as { supabase: SupabaseClient };

export const supabase =
  globalForSupabase.supabase ||
  createClient(supabaseUrl || PLACEHOLDER_URL, supabaseKey || PLACEHOLDER_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  });

if (process.env.NODE_ENV !== 'production') globalForSupabase.supabase = supabase;

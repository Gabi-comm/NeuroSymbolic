'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Browser client, backed by COOKIES rather than localStorage.
//
// This previously used createClient() from @supabase/supabase-js with
// `storage: window.localStorage`. That works fine in the browser, but the
// session then exists nowhere the server can see it — and `proxy.ts` gates
// /admin/* by reading a cookie. The result was that the admin console
// redirected everyone to "/", including signed-in administrators, because the
// cookie it looked for was never written.
//
// createBrowserClient from @supabase/ssr stores the session in cookies, so the
// middleware, route handlers and the browser all read the same session.
//
// Missing configuration stays a loud warning rather than a throw: createClient
// used to blow up during module evaluation and take the production build down
// while prerendering pages that do not even use Supabase.

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

// Syntactically valid placeholders keep module evaluation alive without config.
const PLACEHOLDER_URL = 'http://localhost:54321';
const PLACEHOLDER_KEY = 'missing-anon-key';

const globalForSupabase = global as unknown as { supabase: SupabaseClient };

export const supabase =
  globalForSupabase.supabase ||
  createBrowserClient(supabaseUrl || PLACEHOLDER_URL, supabaseKey || PLACEHOLDER_KEY);

if (process.env.NODE_ENV !== 'production') globalForSupabase.supabase = supabase;

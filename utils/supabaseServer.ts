import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for Server Components and Route Handlers.
 *
 * Reads the same cookies the browser client writes, so a session established in
 * the browser is visible on the server — which is what makes the /admin gate in
 * proxy.ts and the auth callback work at all.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'missing-anon-key',
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components cannot set cookies. Harmless: the middleware
            // refreshes the session on every request, so nothing is lost.
          }
        },
      },
    }
  );
}

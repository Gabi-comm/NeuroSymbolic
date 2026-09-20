import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js 16 renamed middleware.ts to proxy.ts; the exported function must be `proxy`.
//
// Two jobs:
//   1. Refresh the Supabase session cookie on every matched request, so a token
//      that expires mid-session is renewed rather than silently logging the
//      user out.
//   2. Bounce anonymous visitors away from /admin/*.
//
// History worth keeping: the first version looked for a cookie named
// 'auth_token' that Supabase never sets, with its redirect commented out, so it
// did nothing. The second looked for the right cookie name — but the browser
// client was storing the session in localStorage, so no cookie existed and this
// redirected EVERYONE away from /admin, signed-in admins included. The browser
// client now uses cookies (utils/supabase.ts), which is what makes this work.
//
// This is a first gate, not the security boundary. Role is checked in
// app/admin/layout.tsx, and Supabase RLS is what actually protects the rows —
// the publishable key ships to every browser.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'missing-anon-key',
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() revalidates against Supabase. getSession() only decodes the
  // cookie, which a client could forge, so it is not safe for a gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith('/admin')) {
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('signIn', 'required');
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  // Run on /admin to gate it, and on everything else to keep the session fresh,
  // while skipping static assets and image files that never need either.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

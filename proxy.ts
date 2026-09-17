import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js 16 renamed middleware.ts to proxy.ts; the exported function must be `proxy`.
//
// This is a first gate only. It can cheaply tell whether someone is signed in,
// but it cannot tell whether they are an admin without a database round trip on
// every request. The real boundaries are:
//
//   1. app/admin/layout.tsx  — checks UserDetail.role before rendering
//   2. Supabase RLS          — the only one that actually protects the data,
//                              since the anon key ships to every browser
//
// The previous version looked for a cookie named 'auth_token' that Supabase
// never sets, and had its redirect commented out, so it did nothing at all.
export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  // Supabase stores its session as sb-<project-ref>-auth-token, sometimes split
  // across .0/.1 chunks when the JWT is large. Match the family, not one name.
  const hasSession = request.cookies
    .getAll()
    .some(({ name, value }) => /^sb-.*-auth-token(\.\d+)?$/.test(name) && value);

  if (!hasSession) {
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('signIn', 'required');
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};

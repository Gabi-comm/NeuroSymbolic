import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // 1. Check if the user is trying to access any /admin route
  if (request.nextUrl.pathname.startsWith('/admin')) {
    
    // 2. Check for your auth token/cookie (Replace this with your actual auth logic)
    const isAuthenticated = request.cookies.get('auth_token'); 

    // 3. If they aren't logged in, kick them back to the login page
    if (!isAuthenticated) {
      //return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Otherwise, let them through!
  return NextResponse.next();
}

// 4. The Matcher: Tells the proxy to ONLY run on admin pages to save performance
export const config = {
  matcher: ['/admin/:path*'],
};
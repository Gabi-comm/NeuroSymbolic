import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabaseServer';

/**
 * Landing point for every emailed auth link — signup confirmation and password
 * recovery both arrive here.
 *
 * Supabase appends a one-time `code`; exchanging it sets the session cookies.
 * Without this route the links resolve to a 404 and the account is never
 * activated, which is what happened before: signup sent a mail whose link went
 * nowhere.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Recovery links carry ?next=/reset-password so they land on the form.
  const next = searchParams.get('next') ?? '/';

  // Supabase reports link failures in the query string, not as an HTTP error.
  const error = searchParams.get('error_description') ?? searchParams.get('error');
  if (error) {
    return NextResponse.redirect(`${origin}/?authError=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?authError=${encodeURIComponent('Missing confirmation code.')}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    // Almost always an expired or already-used link.
    return NextResponse.redirect(
      `${origin}/?authError=${encodeURIComponent(
        'That link has expired or was already used. Request a new one.'
      )}`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}

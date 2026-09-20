'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Surfaces the messages the auth redirects carry.
 *
 * `proxy.ts` sends anonymous visitors away from /admin with `?signIn=required`,
 * and `/auth/callback` reports expired or already-used links with `?authError=`.
 * Nothing rendered either, so both looked like the app had silently ignored the
 * click — the worst possible feedback for an expired confirmation email.
 *
 * The message is DERIVED from the query string rather than copied into state in
 * an effect. The effect that remains only cleans the URL, so a refresh cannot
 * resurrect a stale message.
 */
function AuthNoticeInner() {
  const params = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const authError = params.get('authError');
  const signInRequired = params.get('signIn') === 'required';

  const tone: 'error' | 'info' = authError ? 'error' : 'info';
  const message = authError
    ? authError
    : signInRequired
      ? 'Sign in with an administrator account to open the console.'
      : null;

  useEffect(() => {
    if (!message) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('authError');
    url.searchParams.delete('signIn');
    window.history.replaceState({}, '', url.toString());
  }, [message]);

  if (!message || dismissed) return null;

  return (
    <div
      role="status"
      className={`fixed top-24 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)] rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur-sm ${
        tone === 'error'
          ? 'bg-red-950/90 border-red-500/40 text-red-100'
          : 'bg-oasys-blue/15 border-oasys-blue/40 text-blue-100'
      }`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="font-black leading-none mt-0.5">
          {tone === 'error' ? '!' : 'i'}
        </span>
        <p className="text-sm leading-snug grow">{message}</p>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 opacity-70 hover:opacity-100 transition-opacity font-bold"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * useSearchParams opts its subtree into client-side rendering, so it needs a
 * Suspense boundary or every page using it would be forced dynamic.
 */
export default function AuthNotice() {
  return (
    <Suspense fallback={null}>
      <AuthNoticeInner />
    </Suspense>
  );
}

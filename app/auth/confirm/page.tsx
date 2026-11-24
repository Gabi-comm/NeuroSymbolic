'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Landing page for emailed links that use token_hash (password reset, and
 * sign-up confirmation once its template is switched too).
 *
 * The one-time token is spent only when the person presses the button. Email
 * security scanners and link previews open links but never press buttons, so
 * they can no longer use up a link before the user gets to it — which is what
 * made reset links fail with otp_expired.
 *
 * Supabase email template (Reset password):
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 */
export default function ConfirmPage() {
  const router = useRouter();
  const [params, setParams] = useState<URLSearchParams | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the query in the browser rather than with useSearchParams, so the
  // page builds without a Suspense boundary.
  useEffect(() => {
    setParams(new URLSearchParams(window.location.search));
  }, []);

  const tokenHash = params?.get('token_hash');
  const type = params?.get('type') as EmailOtpType | null;
  const next = params?.get('next') ?? '/';

  async function confirm() {
    if (!tokenHash || !type) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      setBusy(false);
      setError('That link has expired or was already used. Request a new one from the sign-in screen.');
      return;
    }
    // Only same-site paths, never an absolute URL from the query string.
    router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/');
  }

  if (!params) return null;

  return (
    <main style={{ maxWidth: 420, margin: '15vh auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
        {type === 'recovery' ? 'Reset your password' : 'Confirm your email'}
      </h1>
      {!tokenHash || !type ? (
        <p>This link is incomplete. Request a new one from the sign-in screen.</p>
      ) : (
        <>
          <p style={{ marginBottom: 24 }}>Press continue to verify this link.</p>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            style={{
              padding: '12px 28px',
              borderRadius: 999,
              background: '#2449d6',
              color: '#fff',
              fontWeight: 600,
              border: 'none',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
          {error && <p style={{ color: '#c0392b', marginTop: 16 }}>{error}</p>}
        </>
      )}
    </main>
  );
}

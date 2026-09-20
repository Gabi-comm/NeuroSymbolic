'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

/**
 * Sets a new password after arriving from a recovery email.
 *
 * This screen did not exist. `resetPasswordForEmail` was called with no
 * redirect, so the mail's link fell back to the project Site URL and landed
 * nowhere useful — and even if it had arrived, nothing handled the recovery
 * session or called updateUser. The reset flow was half-built: it sent an email
 * and then stopped.
 *
 * The link now routes through /auth/callback, which exchanges the code for a
 * session and forwards here. By the time this renders the user holds a
 * short-lived recovery session, which is what authorises the password change.
 */
type Status = 'checking' | 'ready' | 'invalid' | 'done';

const MIN_PASSWORD_LENGTH = 6;

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    // The recovery session may already be established by the callback, or may
    // arrive momentarily as a PASSWORD_RECOVERY event. Handle both.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || session) setStatus('ready');
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setStatus(session ? 'ready' : 'invalid');
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setErrorMsg('The two passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Sign out so the new password is actually used on the next sign-in,
      // rather than leaving them on the recovery session.
      await supabase.auth.signOut();
      setStatus('done');
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'Could not update your password.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const field =
    'w-full bg-white text-black px-4 py-3 rounded-xl outline-none border border-transparent ' +
    'focus:border-oasys-blue focus:ring-2 focus:ring-oasys-blue/40 transition-all placeholder-gray-400';
  const label = 'block text-xs font-bold text-gray-300 mb-1.5 uppercase tracking-wide';

  const shell =
    'pt-28 sm:pt-32 px-4 pb-16 min-h-screen flex items-start justify-center';
  const card =
    'bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-7 sm:p-10 w-full max-w-md';

  if (status === 'checking') {
    return (
      <div className={shell} aria-live="polite">
        <div className={`${card} text-center`}>
          <div className="w-10 h-10 border-4 border-oasys-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 font-bold">Checking your link…</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className={shell}>
        <div className={`${card} text-center`}>
          <span
            aria-hidden="true"
            className="w-14 h-14 mx-auto mb-5 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </span>
          <h1 className="text-2xl font-black text-white mb-2">Link expired</h1>
          <p className="text-gray-400 text-sm leading-relaxed mb-7">
            Password reset links can only be used once, and they expire after a
            short time. Request a fresh one from the sign-in screen.
          </p>
          <Link href="/" className="btn-blue w-full py-3.5">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className={shell}>
        <div className={`${card} text-center`}>
          <span
            aria-hidden="true"
            className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#16a34a]/15 text-[#4ade80] flex items-center justify-center text-2xl font-black"
          >
            ✓
          </span>
          <h1 className="text-2xl font-black text-white mb-2">Password updated</h1>
          <p className="text-gray-400 text-sm leading-relaxed mb-7">
            You have been signed out everywhere. Sign in again with your new
            password.
          </p>
          <button onClick={() => router.push('/')} className="btn-blue w-full py-3.5">
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div className={card}>
        <h1 className="text-2xl sm:text-3xl font-black text-white mb-1">
          Set a new password
        </h1>
        <p className="text-gray-400 text-sm mb-7">
          Choose something you have not used here before.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="new-password" className={label}>
              New password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} pr-20`}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:text-black rounded-lg hover:bg-gray-100 transition-colors"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm-password" className={label}>
              Confirm password
            </label>
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={field}
              placeholder="Type it again"
            />
          </div>

          <div aria-live="polite" className="min-h-[1.25rem]">
            {errorMsg && (
              <p role="alert" className="text-red-400 text-sm font-bold">
                {errorMsg}
              </p>
            )}
          </div>

          <button type="submit" disabled={isSaving} className="btn-blue w-full py-3.5">
            {isSaving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}

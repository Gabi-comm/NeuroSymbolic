'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  breachCount,
  breachMessage,
  checkPassword,
} from '@/utils/passwordPolicy';
import PasswordStrength from '@/components/PasswordStrength';
import TermsGuidelines, { TERMS_DONE_EVENT, TERMS_VERSION, hasAcceptedTerms } from '@/components/TermsGuidelines';

/**
 * Sign in / sign up.
 *
 * The previous version was a fixed 800x500 box with both forms absolutely
 * positioned as half-width panels and a blue cover sliding between them. It
 * looked fine at one viewport width and was unusable below it: the panels
 * overlapped, and on a phone the modal overflowed the screen entirely. Since the
 * stated user is an on-field inspector, that is the wrong half to optimise for.
 *
 * This version is one column on mobile and two on desktop, with an ordinary
 * segmented control instead of the sliding cover. The Supabase calls are
 * unchanged.
 */
const RESEND_SECONDS = 60;
// Supabase email codes are 6 digits by default and can be set up to 10.
const CODE_MIN = 6;
const CODE_MAX = 10;

const TOO_MANY_EMAILS = 'Too many emails have been sent in the last hour. Wait a while, then try again.';

/**
 * Supabase's own messages, said plainly. Returns how long to wait when the
 * error is a cooldown, so the resend countdown can show it. A cooldown has no
 * message: the countdown on the button already says it.
 */
function explainAuthError(error: unknown, fallback: string): { message: string; waitSeconds?: number } {
  if (!(error instanceof Error)) return { message: fallback };
  const raw = error.message;
  const lower = raw.toLowerCase();
  const code = (error as { code?: string }).code ?? '';
  // "For security purposes, you can only request this after 42 seconds."
  const after = raw.match(/after (\d+) seconds?/i);
  if (after) return { message: '', waitSeconds: Number(after[1]) };
  // The project-wide cap on emails per hour. With Supabase's built-in email
  // sender it is only a handful an hour, so testing hits it quickly.
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || lower.includes('rate limit')) {
    return { message: TOO_MANY_EMAILS, waitSeconds: RESEND_SECONDS };
  }
  return { message: raw || fallback };
}

export default function LoginModal({ onClose }: { onClose: () => void }) {
  // Opens on Sign in, because the button that opens it says "Sign in". The
  // previous default showed the sign-up panel, which contradicted the trigger.
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Set after a successful sign-up (or a sign-in to an unconfirmed account):
  // the email the verification code went to. The account stays inactive until
  // that code is typed back here, so a throwaway or mistyped address never
  // becomes a working account.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null);
  const [code, setCode] = useState('');
  // Seconds until another code may be requested. Supabase refuses a resend
  // inside 60 s anyway; counting down says so instead of failing.
  const [resendIn, setResendIn] = useState(0);
  // Signed in, but not yet agreed to the terms: a new account right after its
  // code is verified, or an older one that never agreed. The modal cannot be
  // dismissed until the user agrees or declines (which signs them out).
  const [needsTerms, setNeedsTerms] = useState(false);
  const needsTermsRef = useRef(false);
  useEffect(() => {
    needsTermsRef.current = needsTerms;
  }, [needsTerms]);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Set when the breach lookup refused the password on submit.
  const [breachNote, setBreachNote] = useState<string | null>(null);

  // Sign-up only: the password rules (utils/passwordPolicy.ts) checked as the
  // user types, so the meter and the reasons update live.
  const passwordCheck = useMemo(
    () => checkPassword(password, { email, username }),
    [password, email, username]
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Escape closes, and focus starts inside the dialog rather than behind it.
  useEffect(() => {
    firstFieldRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !needsTermsRef.current) onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const startVerification = (address: string) => {
    setAwaitingConfirmation(address);
    setCode('');
    setErrorMsg('');
    setSuccessMsg('');
    setResendIn(RESEND_SECONDS);
  };

  // ---------------------------------------------------------------- auth

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBreachNote(null);

    if (!passwordCheck.ok) {
      setErrorMsg(passwordCheck.problems[0]);
      return;
    }

    setIsLoading(true);

    try {
      // Refuse a password already exposed in a breach (NIST SP 800-63B-4).
      // Only a 5-character hash prefix is sent; see breachCount().
      const leaked = breachMessage(await breachCount(password));
      if (leaked) {
        setBreachNote(leaked);
        setErrorMsg('Choose a different password.');
        return;
      }

      // The profile row is created by handle_new_user once the emailed code is
      // verified (migration.sql section I), not here. The app used to insert into
      // UserDetail itself as a second step; when that failed it left a
      // half-created account -- an auth user with no profile, or a profile with
      // a null userloginuuid that could never sign in. Nine of those had
      // accumulated. `username` rides along in user metadata for the trigger.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      // With email confirmation on, Supabase returns a user but no session.
      // A session here means confirmation is still disabled in the project.
      if (data.session) {
        setNeedsTerms(true);
        return;
      }

      // Supabase answers a sign-up for an address that is already registered
      // with a user that has no identities, and sends nothing, so accounts
      // cannot be probed. Waiting for a code here would wait forever.
      if (data.user && data.user.identities?.length === 0) {
        setErrorMsg('This email is already registered. Sign in instead.');
        return;
      }

      startVerification(email);
    } catch (error) {
      setErrorMsg(explainAuthError(error, 'Failed to create account.').message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!hasAcceptedTerms(data.user)) {
        setNeedsTerms(true);
        return;
      }
      onClose();
    } catch (error) {
      // Distinguish "wrong password" from "you never confirmed your email",
      // which otherwise both surface as a generic failure and leave the user
      // retrying a password that was correct all along.
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('not confirmed') || message.includes('confirm')) {
        // The password was right but the email was never verified: send a
        // fresh code and ask for it, rather than a dead end.
        const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
        startVerification(email);
        if (resendError) {
          const { message, waitSeconds } = explainAuthError(resendError, 'Could not send a code.');
          setErrorMsg(message);
          if (waitSeconds) setResendIn(waitSeconds);
        }
      } else {
        setErrorMsg('Invalid email or password.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!awaitingConfirmation) return;
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // A correct code confirms the account and returns a session, so the
      // user is signed in from here. The account now exists: the terms come next.
      const { error } = await supabase.auth.verifyOtp({
        email: awaitingConfirmation,
        token: code,
        type: 'signup',
      });
      if (error) throw error;
      setAwaitingConfirmation(null);
      setNeedsTerms(true);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      setErrorMsg(
        message.includes('expired') || message.includes('invalid')
          ? 'That code is wrong or has expired. Check it, or send a new one.'
          : error instanceof Error
            ? error.message
            : 'Could not verify the code.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!awaitingConfirmation || resendIn > 0) return;
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: awaitingConfirmation,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setCode('');
      setResendIn(RESEND_SECONDS);
    } catch (error) {
      const { message, waitSeconds } = explainAuthError(error, 'Could not send a new code.');
      setErrorMsg(message);
      if (waitSeconds) setResendIn(waitSeconds);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptTerms = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      // Merged into user_metadata; the username stored at sign-up stays.
      const { error } = await supabase.auth.updateUser({
        data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
      });
      if (error) throw error;
      setNeedsTerms(false);
      window.dispatchEvent(new Event(TERMS_DONE_EVENT));
      onClose();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Could not save your agreement. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Declining leaves the account unused: signed out, and asked again on the
  // next sign-in.
  const handleDeclineTerms = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setIsLoading(false);
    setNeedsTerms(false);
    toggleMode(true);
    setErrorMsg('You need to agree to the terms to use OASYS. Sign in again when you are ready.');
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrorMsg('Enter your email address first.');
      firstFieldRef.current?.focus();
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      // Without redirectTo, Supabase falls back to the project Site URL and
      // the link lands nowhere useful. /reset-password is the screen that
      // actually completes the flow.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) throw error;
      setSuccessMsg(`Password reset link sent to ${email}. Check your inbox.`);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Failed to send reset link.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = (toLogin: boolean) => {
    setIsLogin(toLogin);
    setErrorMsg('');
    setSuccessMsg('');
    setEmail('');
    setUsername('');
    setPassword('');
    setBreachNote(null);
    setShowPassword(false);
    setAwaitingConfirmation(null);
    setCode('');
  };

  // ---------------------------------------------------------------- markup

  const field =
    'w-full bg-inset text-fg px-4 py-3 rounded-xl outline-none border border-line ' +
    'focus:border-oasys-blue focus:ring-2 focus:ring-oasys-blue/40 transition-all placeholder:text-fg-faint';
  const label = 'block text-xs font-bold text-fg-soft mb-1.5 uppercase tracking-wide';

  const tab = (active: boolean) =>
    `flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
      active ? 'bg-oasys-blue text-accent-fg shadow' : 'text-fg-muted hover:text-accent-fg'
    }`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={needsTerms ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl my-auto bg-panel-gradient rounded-oasys shadow-2xl border border-line overflow-hidden flex flex-col lg:flex-row"
      >
        {!needsTerms && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-fg/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}

        {/* Brand panel — desktop only; on mobile it would just push the form
            below the fold, which is the opposite of helpful. */}
        <aside className="hidden lg:flex lg:w-5/12 bg-brand-gradient p-10 flex-col items-center justify-center text-center border-r border-line">
          <Image
            src="/oasys-logo.png"
            alt=""
            width={281}
            height={281}
            priority
            className="w-40 h-40 object-contain mb-6 drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          />
          <p className="font-semibold text-4xl tracking-tight text-fg mb-2">OASYS</p>
          <p className="text-fg-muted text-sm font-medium">Road distress assessment</p>
        </aside>

        {/* Form */}
        <div className="flex-1 p-7 sm:p-10">
          {needsTerms ? (
            <TermsGuidelines
              onAccept={handleAcceptTerms}
              onDecline={handleDeclineTerms}
              busy={isLoading}
              error={errorMsg}
            />
          ) : awaitingConfirmation ? (
            /* Sign-up succeeded but the account is inactive until the emailed
               code comes back. No session exists before then. */
            <form onSubmit={handleVerify} className="flex flex-col">
              <span
                aria-hidden="true"
                className="w-16 h-16 mx-auto mb-5 rounded-full bg-oasys-blue/15 text-oasys-blue flex items-center justify-center"
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </span>

              <h2 id="auth-title" className="text-2xl font-semibold text-fg mb-2 text-center">
                Enter your verification code
              </h2>
              <p className="text-fg-muted text-sm leading-relaxed text-center">We sent a code to</p>
              <p className="font-bold text-fg mb-6 break-all text-center">{awaitingConfirmation}</p>

              <label htmlFor="auth-code" className={label}>
                Verification code
              </label>
              <input
                id="auth-code"
                autoFocus
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern={`[0-9]{${CODE_MIN},${CODE_MAX}}`}
                minLength={CODE_MIN}
                maxLength={CODE_MAX}
                value={code}
                // Digits only, so a code pasted with spaces or a dash still fits.
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_MAX))}
                className={`${field} text-center font-mono text-2xl tracking-[0.4em]`}
                placeholder="000000"
              />

              <div aria-live="polite" className="min-h-[1.25rem] my-4">
                {errorMsg && (
                  <p role="alert" className="text-danger text-sm font-bold">
                    {errorMsg}
                  </p>
                )}
                {successMsg && <p className="text-ok text-sm font-bold">{successMsg}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading || code.length < CODE_MIN}
                className="btn-blue w-full py-3.5 disabled:opacity-60"
              >
                {isLoading ? 'Verifying…' : 'Verify and continue'}
              </button>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => toggleMode(true)}
                  className="text-fg-muted hover:text-fg font-bold transition-colors"
                >
                  Back to sign in
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isLoading || resendIn > 0}
                  className="text-oasys-blue hover:underline font-bold disabled:text-fg-faint disabled:no-underline tabular-nums"
                >
                  {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <h2 id="auth-title" className="text-2xl sm:text-3xl font-semibold text-fg mb-1">
                {isLogin ? 'Welcome back' : 'Create an account'}
              </h2>
              <p className="text-fg-muted text-sm mb-6">
                {isLogin
                  ? 'Sign in to submit and track road distress reports.'
                  : 'It takes a moment, and lets you submit reports.'}
              </p>

              <div
                role="tablist"
                aria-label="Authentication mode"
                className="flex gap-1 bg-inset p-1 rounded-xl mb-6"
              >
                <button role="tab" aria-selected={isLogin} onClick={() => toggleMode(true)} className={tab(isLogin)}>
                  Sign in
                </button>
                <button role="tab" aria-selected={!isLogin} onClick={() => toggleMode(false)} className={tab(!isLogin)}>
                  Sign up
                </button>
              </div>

              <form onSubmit={isLogin ? handleLogin : handleSignUp} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="auth-email" className={label}>
                    Email
                  </label>
                  <input
                    id="auth-email"
                    ref={firstFieldRef}
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={field}
                    placeholder="you@example.com"
                  />
                </div>

                {!isLogin && (
                  <div>
                    <label htmlFor="auth-username" className={label}>
                      Username
                    </label>
                    <input
                      id="auth-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={field}
                      placeholder="How you appear on reports"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="auth-password" className={label}>
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={isLogin ? undefined : PASSWORD_MIN_LENGTH}
                      maxLength={isLogin ? undefined : PASSWORD_MAX_LENGTH}
                      autoComplete={isLogin ? 'current-password' : 'new-password'}
                      aria-describedby={isLogin ? undefined : 'auth-password-rules'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setBreachNote(null);
                      }}
                      className={`${field} pr-20`}
                      placeholder={isLogin ? 'Your password' : `At least ${PASSWORD_MIN_LENGTH} characters`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-bold text-fg-faint hover:text-fg rounded-lg hover:bg-fg/5 transition-colors"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {!isLogin && (
                    <PasswordStrength
                      id="auth-password-rules"
                      password={password}
                      check={passwordCheck}
                      breachNote={breachNote}
                    />
                  )}
                </div>

                {isLogin && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isLoading}
                    className="self-end text-xs text-fg-muted hover:text-oasys-blue font-bold transition-colors disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                )}

                <div aria-live="polite" className="min-h-[1.25rem]">
                  {errorMsg && (
                    <p role="alert" className="text-danger text-sm font-bold">
                      {errorMsg}
                    </p>
                  )}
                  {successMsg && (
                    <p className="text-ok text-sm font-bold">{successMsg}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || (!isLogin && !passwordCheck.ok)}
                  className="btn-blue w-full py-3.5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading
                    ? isLogin
                      ? 'Signing in…'
                      : 'Creating account…'
                    : isLogin
                      ? 'Sign in'
                      : 'Create account'}
                </button>
              </form>

              <p className="text-center text-sm text-fg-muted mt-6">
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => toggleMode(!isLogin)}
                  className="text-oasys-blue hover:underline font-bold"
                >
                  {isLogin ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

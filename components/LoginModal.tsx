'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase';

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
export default function LoginModal({ onClose }: { onClose: () => void }) {
  // Opens on Sign in, because the button that opens it says "Sign in". The
  // previous default showed the sign-up panel, which contradicted the trigger.
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Escape closes, and focus starts inside the dialog rather than behind it.
  useEffect(() => {
    firstFieldRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // ---------------------------------------------------------------- auth

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      if (data.user) {
        const { error: dbError } = await supabase.from('UserDetail').insert({
          userloginuuid: data.user.id,
          username,
          email,
          role: 'user',
        });

        if (dbError) {
          console.error('Database insert error:', dbError);
          throw new Error('Account created, but the profile could not be saved.');
        }
      }

      // Supabase signs the user in automatically on sign-up. Give it a moment to
      // finish writing the session before tearing it down, so they land on the
      // sign-in form rather than in a half-authenticated state.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await supabase.auth.signOut();

      toggleMode(true);
      setSuccessMsg('Account created. You can sign in now.');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Failed to create account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onClose();
    } catch {
      setErrorMsg('Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
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
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setSuccessMsg(`Password reset link sent to ${email}.`);
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
    setShowPassword(false);
  };

  // ---------------------------------------------------------------- markup

  const field =
    'w-full bg-white text-black px-4 py-3 rounded-xl outline-none border border-transparent ' +
    'focus:border-oasys-blue focus:ring-2 focus:ring-oasys-blue/40 transition-all placeholder-gray-400';
  const label = 'block text-xs font-bold text-gray-300 mb-1.5 uppercase tracking-wide';

  const tab = (active: boolean) =>
    `flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
      active ? 'bg-oasys-blue text-white shadow' : 'text-gray-400 hover:text-white'
    }`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl my-auto bg-panel-gradient rounded-oasys shadow-2xl border border-white/10 overflow-hidden flex flex-col lg:flex-row"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        {/* Brand panel — desktop only; on mobile it would just push the form
            below the fold, which is the opposite of helpful. */}
        <aside className="hidden lg:flex lg:w-5/12 bg-brand-gradient p-10 flex-col items-center justify-center text-center border-r border-white/10">
          <Image
            src="/oasys-logo.png"
            alt=""
            width={281}
            height={281}
            priority
            className="w-40 h-40 object-contain mb-6 drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          />
          <p className="font-black text-4xl tracking-tight text-white mb-2">OASYS</p>
          <p className="text-gray-400 text-sm font-medium">Road damage assessment</p>
        </aside>

        {/* Form */}
        <div className="flex-1 p-7 sm:p-10">
          <h2 id="auth-title" className="text-2xl sm:text-3xl font-black text-white mb-1">
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {isLogin
              ? 'Sign in to submit and track road damage reports.'
              : 'It takes a moment, and lets you submit reports.'}
          </p>

          <div
            role="tablist"
            aria-label="Authentication mode"
            className="flex gap-1 bg-black/30 p-1 rounded-xl mb-6"
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
                  minLength={isLogin ? undefined : 6}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${field} pr-20`}
                  placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
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

            {isLogin && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="self-end text-xs text-gray-400 hover:text-oasys-blue font-bold transition-colors disabled:opacity-50"
              >
                Forgot password?
              </button>
            )}

            <div aria-live="polite" className="min-h-[1.25rem]">
              {errorMsg && (
                <p role="alert" className="text-red-400 text-sm font-bold">
                  {errorMsg}
                </p>
              )}
              {successMsg && (
                <p className="text-green-400 text-sm font-bold">{successMsg}</p>
              )}
            </div>

            <button type="submit" disabled={isLoading} className="btn-blue w-full py-3.5">
              {isLoading
                ? isLogin
                  ? 'Signing in…'
                  : 'Creating account…'
                : isLogin
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => toggleMode(!isLogin)}
              className="text-oasys-blue hover:underline font-bold"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

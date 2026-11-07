'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

/**
 * Terms and reporting guidelines, shown inside LoginModal right after an
 * account is created (the emailed code is verified), and on sign-in to any
 * account that has not agreed to the current version yet.
 *
 * Agreement is stored on the auth user's metadata (terms_version +
 * terms_accepted_at), so no table change is needed. Bump TERMS_VERSION when
 * the text changes in substance: everyone is asked again on their next sign-in.
 */
export const TERMS_VERSION = '2026-11-07';
export const TERMS_DONE_EVENT = 'oasys:terms-done';

/** True while the popup is on screen; the guided tour waits for it. */
export const termsOpen = () =>
  typeof document !== 'undefined' && document.documentElement.dataset.terms === '1';

export const hasAcceptedTerms = (user: User | null | undefined) =>
  user?.user_metadata?.terms_version === TERMS_VERSION;

const CONTACT = 'oasysph@gmail.com';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What OASYS is',
    body:
      'OASYS is a research system from a University of the East Caloocan thesis. Its severity grades and repair suggestions are an assessment aid. They are not an official DPWH rating and not a promise that a road will be repaired.',
  },
  {
    title: 'Report what is real',
    body:
      'Submit only road distress you actually saw, in photos you took. Do not upload edited, borrowed or duplicate photos, or file reports to test, joke or mislead.',
  },
  {
    title: 'Stay safe',
    body:
      'Never take photos while driving or riding, and never stand in a live lane. Pull over or stay on the sidewalk. No report is worth an accident.',
  },
  {
    title: 'Respect privacy',
    body:
      'Frame the road surface. Avoid faces, plate numbers and the inside of homes. Photos that identify people may be removed, in line with the Data Privacy Act of 2012 (RA 10173).',
  },
  {
    title: 'Location',
    body:
      'Each report stores the GPS location of the photo so it can be placed on the map. Administrators see that location with the report.',
  },
  {
    title: 'What is kept',
    body:
      'Your email, username, reports, photos and their locations. They are used to assess roads and, without your email or username, for the thesis research. They are not sold or shared for advertising.',
  },
  {
    title: 'Admin review',
    body:
      'Administrators may correct a report’s severity or type, mark it resolved, or remove it. Accounts that break these guidelines can be removed.',
  },
  {
    title: 'Your account',
    body: `Keep your password to yourself; you are responsible for what is sent from your account. To have your account and data deleted, email ${CONTACT}.`,
  },
];

export default function TermsGuidelines({
  onAccept,
  onDecline,
  busy,
  error,
}: {
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
  error: string;
}) {
  const [agreed, setAgreed] = useState(false);

  // Flag the page while the popup is up, so the tour does not start under it.
  useEffect(() => {
    document.documentElement.dataset.terms = '1';
    return () => {
      delete document.documentElement.dataset.terms;
    };
  }, []);

  return (
    <div className="flex flex-col">
      <h2 id="auth-title" className="text-2xl font-semibold text-fg">
        Terms and reporting guidelines
      </h2>
      <p className="mt-1 text-xs text-fg-faint tabular-nums">Version {TERMS_VERSION}</p>

      <div
        tabIndex={0}
        aria-label="Terms and reporting guidelines"
        className="mt-5 max-h-[46vh] lg:max-h-[22rem] overflow-y-auto overscroll-contain pr-2 -mr-2 border-y border-line focus:outline-none focus-visible:ring-2 focus-visible:ring-oasys-blue/40 rounded-sm"
      >
        <ol>
          {SECTIONS.map((s, i) => (
            <li key={s.title} className="flex gap-4 py-4 border-b border-line last:border-b-0">
              <span className="font-stat text-sm text-oasys-blue tabular-nums w-6 shrink-0 pt-0.5">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-fg">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <label className="mt-5 flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 shrink-0 accent-oasys-blue cursor-pointer"
        />
        <span className="text-sm text-fg-soft leading-snug">
          I have read and agree to the terms and reporting guidelines.
        </span>
      </label>

      <div aria-live="polite" className="min-h-[1.25rem] my-3">
        {error && (
          <p role="alert" className="text-danger text-sm font-bold">
            {error}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onAccept}
        disabled={!agreed || busy}
        className="btn-blue w-full py-3.5 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? 'Saving…' : 'Agree and continue'}
      </button>
      <button
        type="button"
        onClick={onDecline}
        disabled={busy}
        className="mt-4 self-center text-sm text-fg-muted hover:text-fg font-bold transition-colors disabled:opacity-50"
      >
        Decline and sign out
      </button>
    </div>
  );
}

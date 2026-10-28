'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { INTRO_KEY } from '@/components/shell/themeBoot';

export { INTRO_KEY };
export const INTRO_DONE_EVENT = 'oasys:intro-done';

/** Set by the boot script in app/layout before first paint; see themeBoot. */
export const introPlaying = () =>
  typeof document !== 'undefined' && document.documentElement.dataset.intro === '1';

const HOLD_MS = 2400;
const EXIT_MS = 650;

/**
 * Once per browser session: a road centre-line draws across, a scan beam sweeps
 * it, the logo resolves inside a detection box, the wordmark rises, and the
 * whole sheet lifts away into the app. ~3s, skippable, never shown under
 * reduced motion (the boot script does not set the flag then).
 */
export default function IntroSplash() {
  const [phase, setPhase] = useState<'off' | 'on' | 'exit'>('off');

  const end = useCallback(() => {
    setPhase('off');
    delete document.documentElement.dataset.intro;
    try {
      sessionStorage.setItem(INTRO_KEY, '1');
    } catch {}
    window.dispatchEvent(new Event(INTRO_DONE_EVENT));
  }, []);

  const skip = useCallback(() => {
    setPhase('exit');
    window.setTimeout(end, EXIT_MS);
  }, [end]);

  useEffect(() => {
    if (!introPlaying()) return;
    // Reading a flag the pre-paint script set is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase('on');
    const t = window.setTimeout(skip, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [skip]);

  if (phase === 'off') return null;

  return (
    <div
      className={`intro fixed inset-0 z-[90] grid place-items-center overflow-hidden bg-[#0d1b36] text-white ${
        phase === 'exit' ? 'intro-exit' : ''
      }`}
      role="presentation"
    >
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(70% 60% at 50% 45%, rgba(124,157,255,0.22), transparent 70%)' }}
      />

      {/* Road and centre line */}
      <svg aria-hidden="true" className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-40" viewBox="0 0 1000 160" preserveAspectRatio="none">
        <path className="intro-road" d="M0 80 H1000" stroke="rgba(169,190,255,0.25)" strokeWidth="70" pathLength="1" />
        <path className="intro-line" d="M0 80 H1000" stroke="#ffffff" strokeWidth="3" strokeDasharray="0.03 0.025" pathLength="1" />
      </svg>
      <div className="intro-beam absolute inset-y-0 w-48 bg-gradient-to-r from-transparent via-[#7c9dff]/35 to-transparent" />

      <div aria-hidden="true" className="relative flex flex-col items-center">
        <div className="relative w-36 h-36 grid place-items-center">
          <svg className="absolute inset-0" viewBox="0 0 144 144" fill="none">
            <rect className="intro-box" x="4" y="4" width="136" height="136" rx="6" stroke="#22c55e" strokeWidth="2.5" pathLength="1" />
            <path className="intro-corners" d="M4 28V4h24M116 4h24v24M140 116v24h-24M28 140H4v-24" stroke="#ffffff" strokeWidth="3" />
          </svg>
          <Image src="/oasys-logo.png" alt="" width={192} height={192} priority className="intro-logo w-24 h-24 object-contain" />
        </div>
        <p className="intro-word mt-6 text-5xl font-semibold tracking-tight">OASYS</p>
        <p className="intro-tag mt-2 text-sm font-semibold text-[#a9beff] tracking-[0.2em] uppercase">Road distress assessment</p>
      </div>

      <button
        onClick={skip}
        className="absolute bottom-[calc(28px+env(safe-area-inset-bottom))] right-6 h-10 px-4 rounded-full text-sm font-semibold text-white/80 hover:text-white border border-white/25 hover:bg-white/10 transition-colors"
      >
        Skip
      </button>
    </div>
  );
}

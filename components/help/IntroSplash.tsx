'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';

export const INTRO_DONE_EVENT = 'oasys:intro-done';

/** Set by the boot script in app/layout before first paint; see themeBoot. */
export const introPlaying = () =>
  typeof document !== 'undefined' && document.documentElement.dataset.intro === '1';

const HOLD_MS = 2300;
const EXIT_MS = 700;
const WORD = 'OASYS';

/**
 * On every page load: the logo pops in with two burst rings and a glow, the
 * name flips up letter by letter with a light sweep, the tagline settles, and
 * an iris closes onto the app. ~3s, skippable, never shown under reduced motion.
 */
export default function IntroSplash() {
  const [phase, setPhase] = useState<'off' | 'on' | 'exit'>('off');

  const end = useCallback(() => {
    setPhase('off');
    window.dispatchEvent(new Event(INTRO_DONE_EVENT));
  }, []);

  const skip = useCallback(() => {
    setPhase((p) => (p === 'on' ? 'exit' : p));
    // Lift the pre-paint navy cover now, so the app shows through the iris.
    delete document.documentElement.dataset.intro;
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
      role="presentation"
      className={`intro fixed inset-0 z-[90] overflow-hidden text-white ${phase === 'exit' ? 'intro-exit' : ''}`}
      style={{ background: 'radial-gradient(80% 70% at 50% 45%, #13265a 0%, #050a1a 100%)' }}
    >
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="relative grid place-items-center w-36 h-36">
          <span className="intro-ring absolute inset-0 rounded-full border border-[#86a3ff]" />
          <span className="intro-ring intro-ring-2 absolute inset-0 rounded-full border border-[#38bdf8]" />
          <span className="intro-halo absolute inset-[-30%] rounded-full" />
          <Image src="/oasys-logo.png" alt="" width={224} height={224} priority className="intro-logo relative w-28 h-28 object-contain" />
        </div>
        <p className="mt-6 flex text-5xl sm:text-7xl font-semibold tracking-tight [perspective:600px]">
          {WORD.split('').map((ch, i) => (
            <span
              key={i}
              className="intro-letter inline-block"
              style={{ animationDelay: `${0.55 + i * 0.07}s, ${1.25 + i * 0.06}s` }}
            >
              {ch}
            </span>
          ))}
        </p>
        <p className="intro-tag mt-3 text-xs sm:text-sm font-semibold tracking-[0.32em] uppercase">
          Road distress assessment
        </p>
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

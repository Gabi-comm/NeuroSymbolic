'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/shell/AuthProvider';
import { SHELL_EVENTS } from '@/components/shell/nav';
import { INTRO_DONE_EVENT, introPlaying } from './IntroSplash';
import { HelpDemoArt, type HelpTopic } from './demos';

export const TOUR_KEY = 'oasys.tourDone';

interface Step {
  /** `data-tour` value(s) to spotlight; the first one visible wins. None = centred card. */
  targets?: string[];
  title: string;
  body: string;
  /** Looping how-to animation shown in the card. */
  demo: HelpTopic;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to OASYS',
    body: 'Pin the place, add one photo, and OASYS grades the distress. Here is where everything lives.',
    demo: 'flow',
  },
  {
    targets: ['stats'],
    title: 'Your numbers at a glance',
    body: 'Reports filed, waiting, resolved and photos you still have to report. Tap one to filter the map.',
    demo: 'stats',
  },
  {
    targets: ['map'],
    title: 'Every report, on the map',
    body: 'Pins carry severity as colour, shape and word. Use the tabs to switch what is shown.',
    demo: 'map',
  },
  {
    targets: ['nav-report', 'fab'],
    title: 'Report a distress',
    body: 'Drop a pin where the distress is, then upload one clear photo of it.',
    demo: 'pin',
  },
  {
    targets: ['captures', 'nav-captured'],
    title: 'Capture now, report later',
    body: 'Photos taken on the road wait here with their location until you file them.',
    demo: 'capture',
  },
];

const PAD = 8;

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(step: Step): HTMLElement | null {
  for (const name of step.targets ?? []) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) return el;
    }
  }
  return null;
}

/** Spotlight tour over the shell and the Home dashboard. */
export default function Tour() {
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { authUser, isAdmin } = useAuth();

  const finish = useCallback(() => {
    setStep(null);
    setRect(null);
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {}
  }, []);

  // Started from the Guide card, the mobile "?" or the command palette. The
  // dashboard is where the targets are, so go there first.
  useEffect(() => {
    const start = () => {
      if (pathname !== '/') router.push('/');
      setStep(0);
    };
    window.addEventListener(SHELL_EVENTS.tour, start);
    return () => window.removeEventListener(SHELL_EVENTS.tour, start);
  }, [pathname, router]);

  // First visit to the dashboard after signing in: start by itself, once,
  // after the intro has finished.
  useEffect(() => {
    if (!authUser || isAdmin || pathname !== '/') return;
    let done = '1';
    try {
      done = localStorage.getItem(TOUR_KEY) ?? '';
    } catch {}
    if (done) return;

    let timer = 0;
    const begin = () => {
      timer = window.setTimeout(() => setStep((s) => s ?? 0), 900);
    };
    if (introPlaying()) window.addEventListener(INTRO_DONE_EVENT, begin, { once: true });
    else begin();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(INTRO_DONE_EVENT, begin);
    };
  }, [authUser, isAdmin, pathname]);

  // Follow the current target: scroll it into view, then track it.
  useLayoutEffect(() => {
    if (step === null) return;
    const current = STEPS[step];
    let el = findTarget(current);
    let frame = 0;

    const measure = () => {
      el = el?.isConnected ? el : findTarget(current);
      if (!el) {
        setRect(null);
        return;
      }
      const b = el.getBoundingClientRect();
      setRect({
        top: b.top - PAD,
        left: b.left - PAD,
        width: b.width + PAD * 2,
        height: b.height + PAD * 2,
      });
    };

    if (current.targets) {
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // The dashboard may still be loading when the tour starts.
      const retry = window.setInterval(measure, 250);
      window.setTimeout(() => window.clearInterval(retry), 2500);
      const onMove = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(measure);
      };
      window.addEventListener('scroll', onMove, true);
      window.addEventListener('resize', onMove);
      measure();
      return () => {
        window.clearInterval(retry);
        cancelAnimationFrame(frame);
        window.removeEventListener('scroll', onMove, true);
        window.removeEventListener('resize', onMove);
      };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRect(null);
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') setStep((s) => (s === null ? s : Math.min(s + 1, STEPS.length - 1)));
      if (e.key === 'ArrowLeft') setStep((s) => (s === null ? s : Math.max(s - 1, 0)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, finish]);

  // Place the card once its real size is known: beside a narrow target (the
  // sidebar links), else below it, else above it, always kept on screen.
  // Phones use a sheet above the tab bar instead.
  const cardRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (step === null || !card || !rect || window.innerWidth < 768) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlace(null);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const gap = 14;
    const margin = 16;
    const clampTop = (t: number) => Math.min(Math.max(t, margin), vh - h - margin);
    const clampLeft = (l: number) => Math.min(Math.max(l, margin), vw - w - margin);

    if (rect.width < vw / 3 && rect.left + rect.width + gap + w + margin <= vw) {
      setPlace({
        left: rect.left + rect.width + gap,
        top: clampTop(rect.top + rect.height / 2 - h / 2),
      });
    } else if (rect.top + rect.height + gap + h + margin <= vh) {
      setPlace({
        left: clampLeft(rect.left),
        top: rect.top + rect.height + gap,
      });
    } else if (rect.top - gap - h >= margin) {
      setPlace({ left: clampLeft(rect.left), top: rect.top - gap - h });
    } else {
      // Target fills the screen (a tall map): float inside it, bottom right.
      setPlace({
        left: clampLeft(rect.left + rect.width - w - gap),
        top: clampTop(rect.top + rect.height - h - gap),
      });
    }
  }, [rect, step]);

  if (step === null) return null;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const floating = !!rect && !!place;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect ? (
        <div className="tour-spot" style={rect} />
      ) : (
        <div className="absolute inset-0 bg-[rgba(5,10,24,0.62)] transition-opacity" />
      )}
      {/* Clicks outside the card do nothing rather than closing by accident. */}
      <div className="absolute inset-0" />

      <div
        ref={cardRef}
        key={step}
        className={`pop-in off-brand fixed w-[340px] max-w-[calc(100vw-32px)] rounded-2xl bg-surface border border-line shadow-2xl p-4 transition-[top,left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          floating
            ? ''
            : rect
              ? 'left-4 right-4 w-auto max-w-none bottom-[calc(88px+env(safe-area-inset-bottom))] md:left-1/2 md:right-auto md:w-[340px] md:-translate-x-1/2 md:bottom-6'
              : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
        }`}
        style={floating ? place! : undefined}
      >
        <HelpDemoArt topic={current.demo} />
        <p className="mt-3 font-stat text-sm text-accent">
          {step + 1} / {STEPS.length}
        </p>
        <h2 className="mt-0.5 text-lg font-semibold text-fg">{current.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{current.body}</p>

        <div className="mt-4 flex items-center gap-2">
          <span className="flex gap-1.5 mr-auto" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'}`}
              />
            ))}
          </span>
          {!last && (
            <button onClick={finish} className="h-9 px-3 rounded-lg text-sm font-semibold text-fg-muted hover:text-fg">
              Skip
            </button>
          )}
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="h-9 px-3 rounded-lg text-sm font-semibold text-fg border border-line hover:bg-fg/5"
            >
              Back
            </button>
          )}
          <button
            autoFocus
            onClick={() => (last ? finish() : setStep(step + 1))}
            className="btn-blue h-9 px-4 rounded-lg text-sm font-semibold"
          >
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

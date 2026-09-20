'use client';

import { useRef, useState } from 'react';
import { SeverityBadge } from './Severity';
import type { Distress } from '@/utils/pendingAnalysis';

/**
 * Detected damage, one at a time, navigated vertically.
 *
 * Replaces a scrolling list. With four or five detections the list forced the
 * reader to compare cramped rows and scan for the worst one; showing a single
 * detection at full size makes each set of numbers legible on its own, which is
 * what an inspector actually reads them for.
 *
 * Vertical rather than horizontal because the panel is tall and narrow, and
 * because up/down matches the scroll gesture the list used to have.
 *
 * Navigation clamps at both ends rather than wrapping: with a known, small
 * number of detections, a disabled arrow tells you where you are in the set.
 */
export default function DistressCarousel({ distresses }: { distresses: Distress[] }) {
  const [rawIndex, setIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  const total = distresses.length;

  // Clamped during render rather than corrected in an effect: if the detection
  // list shrinks, a stale index is simply never read, with no extra render pass
  // and no frame showing the wrong slide.
  const index = Math.min(rawIndex, Math.max(0, total - 1));

  if (total === 0) {
    return (
      <p className="text-center py-8 text-zinc-500 font-bold italic">No damage detected.</p>
    );
  }

  const go = (next: number) => setIndex(Math.min(Math.max(next, 0), total - 1));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    }
  };

  const arrow = (disabled: boolean) =>
    `w-9 h-9 rounded-full flex items-center justify-center transition-all ${
      disabled
        ? 'bg-zinc-300/60 text-zinc-400 cursor-not-allowed'
        : 'bg-zinc-800 text-white hover:bg-black active:scale-95'
    }`;

  return (
    <div className="flex gap-3">
      {/* Slide viewport. Fixed height so the translated track has something to
          clip against; every card fills it, so the panel never jumps. */}
      <div
        ref={viewportRef}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={`Detected damage, ${index + 1} of ${total}`}
        onKeyDown={onKeyDown}
        className="grow min-w-0 h-44 overflow-hidden rounded-xl bg-white/60 border border-white/40 focus-visible:ring-2 focus-visible:ring-oasys-blue"
      >
        <div
          className="h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateY(-${index * 100}%)` }}
        >
          {distresses.map((distress, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${total}`}
              aria-hidden={i !== index}
              className="h-full p-4 flex flex-col justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="font-black text-base text-zinc-900 leading-tight">
                    {distress.label}
                  </p>
                  <span className="bg-zinc-800 text-white text-[11px] font-black px-2 py-1 rounded-lg shrink-0">
                    {(distress.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <SeverityBadge severity={distress.severity} tone="light" />
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-700">
                <dt className="font-bold">{distress.measurement_type}</dt>
                <dd className="text-right tabular-nums">
                  {distress.metric_value?.toFixed(3)} {distress.unit}
                </dd>

                <dt className="font-bold">Mean width</dt>
                <dd className="text-right tabular-nums">
                  {distress.width_mm?.toFixed(1)} mm
                </dd>

                {distress.severity_dpwh_nw && (
                  <>
                    <dt className="font-bold">DPWH band</dt>
                    <dd className="text-right">{distress.severity_dpwh_nw}</dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </div>
      </div>

      {/* Vertical controls */}
      <div className="flex flex-col items-center justify-between py-0.5 shrink-0">
        <button
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Previous detection"
          className={arrow(index === 0)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>

        {/* Dot rail. Capped so a long detection list does not stretch the panel. */}
        <div className="flex flex-col items-center gap-1.5 my-2" aria-hidden="true">
          {total <= 8 ? (
            distresses.map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                tabIndex={-1}
                className={`rounded-full transition-all ${
                  i === index ? 'bg-zinc-800 w-2 h-4' : 'bg-zinc-400 hover:bg-zinc-600 w-2 h-2'
                }`}
              />
            ))
          ) : (
            <span className="text-[10px] font-black text-zinc-600 tabular-nums">
              {index + 1}/{total}
            </span>
          )}
        </div>

        <button
          onClick={() => go(index + 1)}
          disabled={index === total - 1}
          aria-label="Next detection"
          className={arrow(index === total - 1)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Announce the change for screen readers without moving focus. */}
      <span aria-live="polite" className="sr-only">
        Detection {index + 1} of {total}: {distresses[index]?.label},{' '}
        {distresses[index]?.severity} severity
      </span>
    </div>
  );
}

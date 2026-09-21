'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePipelineStagesRaw, parseStagePayload } from '@/utils/pipelineStages';

/**
 * The pipeline, one stage at a time, on the image the user actually uploaded.
 *
 * Every step shown here already ran during the analysis; the backend only
 * started returning what each one produced. Nothing is re-computed and nothing
 * is simulated -- these are the real intermediate frames.
 *
 * Stepping rather than a six-up grid: the point is that each stage *transforms*
 * the previous one, and holding the frame still while the content changes is
 * what makes the transformation legible. The rail underneath still shows all
 * six at once.
 */
export default function ProcessPage() {
  // Raw string from the store, parsed once. See usePipelineStagesRaw.
  const raw = usePipelineStagesRaw();
  const payload = useMemo(() => parseStagePayload(raw), [raw]);
  const stages = payload?.stages ?? [];
  const returnTo = payload?.returnTo ?? '/';
  // Both result screens lead here, so the arrow says which one it goes to.
  const returnLabel = returnTo.startsWith('/report-damage')
    ? 'Back to the report'
    : 'Back to the result';

  const [index, setIndex] = useState(0);
  const total = stages.length;
  // Clamped during render rather than corrected in an effect, so there is never
  // a frame showing the wrong stage.
  const current = total ? stages[Math.min(index, total - 1)] : null;
  const safeIndex = total ? Math.min(index, total - 1) : 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, total - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [total]);

  if (!total || !current) {
    return (
      <div className="pt-28 sm:pt-32 px-4 pb-16 min-h-screen flex items-start justify-center">
        <div className="bg-panel-gradient border border-white/10 rounded-oasys shadow-2xl p-8 sm:p-10 max-w-md w-full text-center">
          <span
            aria-hidden="true"
            className="w-14 h-14 mx-auto mb-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <h1 className="text-2xl font-black mb-2">No analysis to walk through</h1>
          <p className="text-sm text-gray-400 leading-snug mb-7">
            This page shows the detection stages for an image you have just
            scanned. Scan one and the walkthrough opens from the result screen.
          </p>
          <Link href="/upload-media" className="btn-blue w-full px-6 py-3">
            Scan an image
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-oasys-blue font-bold text-sm uppercase tracking-wider mb-1">
              How does the detection work?
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight">
              Six steps, on your image
            </h1>
          </div>
          {/* A link, not history.back(): back follows whatever the user did
              last, which after stepping through the stages is not necessarily
              the result screen, and it has nowhere to go on a reload. */}
          <Link
            href={returnTo}
            aria-label={returnLabel}
            title={returnLabel}
            className="p-2 rounded-full hover:bg-white/10 transition-all group shrink-0"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="group-hover:-translate-x-1 transition-transform">
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
        </div>

        {/* Progress across the six stages. */}
        <div
          className="flex gap-1.5 mb-5"
          role="img"
          aria-label={`Stage ${safeIndex + 1} of ${total}`}
        >
          {stages.map((stage, i) => (
            <span
              key={stage.key}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= safeIndex ? 'bg-oasys-blue' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* The frame. */}
          <section className="lg:col-span-2 bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-6 flex flex-col gap-4">
            <div className="rounded-2xl overflow-hidden bg-black border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL from the analysis */}
              <img
                key={current.key}
                src={current.image}
                alt={`${current.title}: ${current.summary}`}
                className="w-full h-auto max-h-[32rem] object-contain page-enter"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setIndex((i) => Math.max(i - 1, 0))}
                disabled={safeIndex === 0}
                className="px-5 py-2.5 rounded-full font-bold text-sm bg-white/10 hover:bg-white/20 border border-white/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                &larr; Previous
              </button>
              <span className="text-xs font-bold text-gray-500 tabular-nums">
                {safeIndex + 1} / {total}
              </span>
              <button
                onClick={() => setIndex((i) => Math.min(i + 1, total - 1))}
                disabled={safeIndex === total - 1}
                className="btn-blue px-6 py-2.5 text-sm disabled:opacity-40"
              >
                Next &rarr;
              </button>
            </div>
          </section>

          {/* What this stage did. */}
          <aside className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-6 flex flex-col">
            <span className="text-xs font-black text-oasys-blue uppercase tracking-widest mb-2">
              Step {safeIndex + 1}
            </span>
            <h2 className="text-2xl font-black leading-tight mb-1.5">{current.title}</h2>
            <p className="text-sm font-bold text-gray-300 mb-4">{current.summary}</p>
            <p className="text-sm text-gray-400 leading-relaxed">{current.detail}</p>

            <p className="text-xs text-gray-500 mt-auto pt-5 leading-snug">
              These are the real intermediate frames from your analysis, not
              illustrations. Use the arrow keys to step through them.
            </p>
          </aside>
        </div>

        {/* All six at once, and the way to jump. */}
        <nav aria-label="Stages" className="mt-5">
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {stages.map((stage, i) => (
              <li key={stage.key}>
                <button
                  onClick={() => setIndex(i)}
                  aria-current={i === safeIndex ? 'step' : undefined}
                  className={`w-full text-left rounded-2xl overflow-hidden border transition-all ${
                    i === safeIndex
                      ? 'border-oasys-blue ring-2 ring-oasys-blue/40'
                      : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'
                  }`}
                >
                  <span className="block aspect-video bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL from the analysis */}
                    <img
                      src={stage.image}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </span>
                  <span className="block p-2.5 bg-black/40">
                    <span className="block text-[10px] font-black text-gray-500 tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="block text-xs font-bold leading-snug">
                      {stage.title}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import HelpDemo, { type HelpTopic } from './demos';

/** A "?" beside a section heading that opens an animated how-to for it. */
export default function HelpButton({ topic, className = '' }: { topic: HelpTopic; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label="How this works"
        className={`grid place-items-center w-6 h-6 rounded-full border text-[12px] font-semibold transition-colors ${
          open ? 'border-accent text-accent' : 'border-line-strong text-fg-muted hover:text-accent hover:border-accent'
        }`}
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="dialog"
          aria-label="Help"
          className="pop-in off-brand absolute z-50 top-8 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 w-[17rem] rounded-2xl bg-surface border border-line shadow-2xl p-3 text-left font-normal normal-case tracking-normal"
        >
          <HelpDemo topic={topic} />
        </span>
      )}
    </span>
  );
}

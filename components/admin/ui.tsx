'use client';

// Building blocks shared by the four admin pages, so they read as one product
// with the reporter dashboard: same page width, surfaces, tile and tab styles.
// No chip backgrounds anywhere (project rule): status is dot + word, the active
// tab is bold + underline.

import Link from 'next/link';
import type { ReactNode } from 'react';
import CountUp from '@/components/dashboard/CountUp';
import { Sparkline } from '@/components/Charts';

export const PAGE = 'px-4 sm:px-8 lg:px-10 pt-5 md:pt-8 pb-16 max-w-[1240px] mx-auto';

/** Page title row: eyebrow, heading, and actions on the right. */
export function AdminHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-enter flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        <h1 className="mt-1.5 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{children}</div>}
    </header>
  );
}

/** A surface card with an optional heading row. */
export function Panel({
  title,
  action,
  children,
  className = '',
  ...rest
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={`page-enter rounded-2xl bg-surface border border-line p-5 sm:p-6 ${className}`} {...rest}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          {title && <h2 className="text-base font-semibold text-fg">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Number tile: label + icon, big count, optional change and sparkline. */
export function StatTile({
  label,
  value,
  icon,
  tone = 'text-fg',
  delta,
  spark,
  sparkColor,
  href,
  loading,
}: {
  label: string;
  value: number | null;
  icon?: ReactNode;
  tone?: string;
  /** Change against the previous period, already worded: "+3 vs last week". */
  delta?: { text: string; good: boolean | null };
  spark?: number[];
  sparkColor?: string;
  href?: string;
  loading?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-fg-muted">
        {label}
        {icon && <span className="text-fg-faint group-hover:text-accent transition-colors">{icon}</span>}
      </span>
      <span className={`mt-3 font-stat text-4xl sm:text-5xl leading-none ${tone}`}>
        {loading || value === null ? (
          <span className="skeleton inline-block h-10 w-16 rounded-lg align-middle" />
        ) : (
          <CountUp value={value} />
        )}
      </span>
      {delta && !loading && (
        <span
          className={`mt-2 text-xs font-semibold ${
            delta.good === null ? 'text-fg-muted' : delta.good ? 'text-ok' : 'text-danger'
          }`}
        >
          {delta.text}
        </span>
      )}
      {spark && !loading && (
        <span className="mt-3 block -mx-1">
          <Sparkline values={spark} color={sparkColor} />
        </span>
      )}
    </>
  );
  const cls =
    'lift group flex flex-col rounded-2xl bg-surface border border-line p-4 sm:p-5 min-h-[8.5rem] transition-colors hover:border-line-strong';
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Bold + underline tabs (no pill). Works as a filter or a segmented control. */
export function UnderlineTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { key: K; label: ReactNode; count?: number }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`relative inline-flex items-center gap-1.5 pb-1 transition-colors ${
              active ? 'font-semibold text-fg' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="tabular-nums text-fg-faint font-normal">{t.count}</span>}
            <span
              aria-hidden="true"
              className={`absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-accent origin-left transition-transform duration-300 ${
                active ? 'scale-x-100' : 'scale-x-0'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

export function ErrorNote({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/40 bg-surface p-5 mb-6">
      <p className="font-semibold text-danger">{title}</p>
      <p className="mt-1 text-sm text-fg-muted">{message}</p>
    </div>
  );
}

/** Bottom toast for a failed action. */
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="pop-in fixed bottom-[calc(96px+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-start gap-4 rounded-xl border border-danger/40 bg-surface px-5 py-3 shadow-2xl max-w-md"
    >
      <p className="text-sm font-semibold text-danger">{message}</p>
      <button onClick={onDismiss} className="text-xs font-semibold text-fg-muted hover:text-fg underline shrink-0">
        Dismiss
      </button>
    </div>
  );
}

/** A small yes/no dialog. `tone` colours the confirm button. */
export function ConfirmDialog({
  title,
  body,
  confirm,
  tone = 'accent',
  onCancel,
  onConfirm,
}: {
  title: string;
  body: ReactNode;
  confirm: string;
  tone?: 'accent' | 'ok' | 'neutral' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const btn = {
    accent: 'btn-blue',
    ok: 'bg-ok text-white hover:brightness-110',
    neutral: 'bg-fg text-bg hover:opacity-90',
    danger: 'bg-danger text-white hover:brightness-110',
  }[tone];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="pop-in w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <h2 id="confirm-title" className="text-lg font-semibold text-fg">
          {title}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">{body}</p>
        <div className="mt-6 flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl border border-line text-sm font-semibold text-fg hover:bg-fg/5"
          >
            Cancel
          </button>
          <button autoFocus onClick={onConfirm} className={`flex-1 h-11 rounded-xl text-sm font-semibold transition ${btn}`}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "+3 vs previous 7 days" style change, with whether up is good. */
export function deltaOf(current: number, previous: number, period: string, upIsGood: boolean | null = null) {
  const diff = current - previous;
  if (!previous && !current) return { text: `No change vs ${period}`, good: null };
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
  return {
    text: `${sign}${Math.abs(diff)} vs ${period}`,
    good: diff === 0 || upIsGood === null ? null : diff > 0 === upIsGood,
  };
}

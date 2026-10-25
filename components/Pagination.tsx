'use client';

// Page controls for the 5-at-a-time lists. Each list used to fetch every row,
// and most rows carry a photo, so the pages page on the server with .range().

export const PAGE_SIZE = 5;

/** Inclusive [from, to] row offsets for Supabase's .range(). Pages start at 1. */
export function pageRange(page: number, size = PAGE_SIZE): [number, number] {
  const from = (page - 1) * size;
  return [from, from + size - 1];
}

export function lastPage(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

interface Props {
  page: number;
  total: number;
  onChange: (page: number) => void;
  pageSize?: number;
  /** What is being paged, for screen readers ("Needs action"). */
  label?: string;
  /** Surface the controls sit on. */
  tone?: 'dark' | 'light';
}

export default function Pagination({
  page,
  total,
  onChange,
  pageSize = PAGE_SIZE,
  label,
  tone = 'dark',
}: Props) {
  if (total <= pageSize) return null;

  const pages = lastPage(total, pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const button =
    'px-4 py-2 rounded-full font-bold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white/10 hover:bg-white/20 text-white border border-white/15';
  const muted = tone === 'light' ? 'text-zinc-500' : 'text-gray-400';

  return (
    <nav
      aria-label={label ? `${label} pages` : 'Pages'}
      className="flex flex-wrap items-center justify-between gap-3 pt-1"
    >
      <p className={`text-xs font-bold tabular-nums ${muted}`}>
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className={button}
        >
          ‹ Prev
        </button>
        <span className={`text-xs font-bold tabular-nums px-1 ${muted}`} aria-live="polite">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className={button}
        >
          Next ›
        </button>
      </div>
    </nav>
  );
}

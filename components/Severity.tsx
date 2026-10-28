import type { ReactNode } from 'react';

export type Severity = 'Low' | 'Medium' | 'High';

/**
 * One severity vocabulary for the whole app.
 *
 * Previously Medium was yellow on the dashboard and orange on the reports page,
 * and severity was communicated by colour alone. For a tool whose entire output
 * is a severity grade that is the one thing that must not drift, and roughly 8%
 * of male inspectors -- the stated user group -- have some colour vision
 * deficiency. Every badge therefore carries three independent cues: colour, a
 * distinct shape, and the word itself.
 */

interface SeverityStyle {
  label: Severity;
  /** Distinct silhouette, legible in greyscale and at small sizes. */
  icon: ReactNode;
  /** Theme-aware text colour (validated palette; see app/globals.css). */
  text: string;
  /** Filled tile, for the one large verdict icon on the result page. */
  solid: string;
  description: string;
}

const CircleIcon = (
  <svg viewBox="0 0 16 16" className="w-3 h-3 shrink-0" aria-hidden="true">
    <circle cx="8" cy="8" r="6" fill="currentColor" />
  </svg>
);

const TriangleIcon = (
  <svg viewBox="0 0 16 16" className="w-3 h-3 shrink-0" aria-hidden="true">
    <path d="M8 2 L15 14 L1 14 Z" fill="currentColor" />
  </svg>
);

const OctagonIcon = (
  <svg viewBox="0 0 16 16" className="w-3 h-3 shrink-0" aria-hidden="true">
    <path d="M5.2 1h5.6L15 5.2v5.6L10.8 15H5.2L1 10.8V5.2Z" fill="currentColor" />
  </svg>
);

export const SEVERITY: Record<Severity, SeverityStyle> = {
  Low: {
    label: 'Low',
    icon: CircleIcon,
    text: 'text-sev-low',
    solid: 'bg-[#16a34a] text-white',
    description: 'Monitor during routine inspection',
  },
  Medium: {
    label: 'Medium',
    icon: TriangleIcon,
    text: 'text-sev-medium',
    solid: 'bg-[#fbbf24] text-black',
    description: 'Schedule maintenance',
  },
  High: {
    label: 'High',
    icon: OctagonIcon,
    text: 'text-sev-high',
    solid: 'bg-[#dc2626] text-white',
    description: 'Prioritise for repair',
  },
};

/** Normalise whatever the API or database returned into a known severity. */
export function toSeverity(value: unknown): Severity | null {
  if (typeof value !== 'string') return null;
  const normalised = value.trim().toLowerCase();
  if (normalised === 'low') return 'Low';
  if (normalised === 'medium') return 'Medium';
  if (normalised === 'high') return 'High';
  return null;
}

export const SEVERITY_RANK: Record<Severity, number> = { Low: 0, Medium: 1, High: 2 };

interface BadgeProps {
  severity: unknown;
  /** Kept for existing call sites; colours now follow the theme tokens. */
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Glyph + word, no pill behind it (2026-10 redesign). The colour comes from the
 * theme, so the same badge reads on light cards, dark cards and navy bands.
 */
export function SeverityBadge({ severity, size = 'sm', className = '' }: BadgeProps) {
  const key = toSeverity(severity);
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs';

  if (!key) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-semibold text-fg-muted ${textSize} ${className}`}>
        <span aria-hidden="true" className="w-3 h-3 rounded-full border-[1.5px] border-current shrink-0" />
        Unknown
      </span>
    );
  }

  const style = SEVERITY[key];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide ${style.text} ${textSize} ${className}`}
    >
      {style.icon}
      {style.label}
      <span className="sr-only"> severity. {style.description}.</span>
    </span>
  );
}

const RESOLVED_STATES = ['resolved', 'done'];

export const isResolvedState = (state: unknown) =>
  typeof state === 'string' && RESOLVED_STATES.includes(state.trim().toLowerCase());

/** Report status as a dot + word, with no chip behind it. */
export function StatusLabel({ state, className = '' }: { state: string | null | undefined; className?: string }) {
  const resolved = isResolvedState(state);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${
        resolved ? 'text-ok' : 'text-warn'
      } ${className}`}
    >
      <span aria-hidden="true" className="w-2 h-2 rounded-full bg-current shrink-0" />
      {state || 'Needs Action'}
    </span>
  );
}

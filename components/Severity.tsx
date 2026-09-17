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
  onDark: string;
  onLight: string;
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
    onDark: 'bg-[#16a34a]/15 text-[#16a34a] border-[#16a34a]/40',
    onLight: 'bg-white/70 text-[#15803d] border-[#15803d]/40',
    solid: 'bg-[#16a34a] text-white',
    description: 'Monitor during routine inspection',
  },
  Medium: {
    label: 'Medium',
    icon: TriangleIcon,
    onDark: 'bg-[#fbbf24]/15 text-[#fbbf24] border-[#fbbf24]/40',
    onLight: 'bg-white/70 text-[#854d0e] border-[#854d0e]/40',
    solid: 'bg-[#fbbf24] text-black',
    description: 'Schedule maintenance',
  },
  High: {
    label: 'High',
    icon: OctagonIcon,
    onDark: 'bg-[#dc2626]/15 text-[#f87171] border-[#dc2626]/50',
    onLight: 'bg-white/70 text-[#dc2626] border-[#dc2626]/40',
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
  /** Surface the badge sits on. Controls contrast, not meaning. */
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md';
  className?: string;
}

export function SeverityBadge({
  severity,
  tone = 'dark',
  size = 'sm',
  className = '',
}: BadgeProps) {
  const key = toSeverity(severity);

  if (!key) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bold ${
          tone === 'dark'
            ? 'bg-white/5 text-gray-400 border-white/10'
            : 'bg-gray-100 text-gray-600 border-gray-300'
        } ${size === 'sm' ? 'text-[10px]' : 'text-xs'} ${className}`}
      >
        Unknown
      </span>
    );
  }

  const style = SEVERITY[key];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bold uppercase tracking-wide ${
        tone === 'dark' ? style.onDark : style.onLight
      } ${size === 'sm' ? 'text-[10px]' : 'text-xs'} ${className}`}
    >
      {style.icon}
      {style.label}
      <span className="sr-only"> severity. {style.description}.</span>
    </span>
  );
}

/**
 * The stacked Low/Medium/High indicator on the result screen.
 *
 * Renders as a labelled list rather than three coloured blocks, so the active
 * grade is announced to assistive technology instead of being conveyed only by
 * which block is bright.
 */
export function SeverityMeter({ severity }: { severity: unknown }) {
  const active = toSeverity(severity);
  const order: Severity[] = ['High', 'Medium', 'Low'];

  return (
    <div
      className="flex flex-col gap-2 w-full max-w-[13rem]"
      role="group"
      aria-label={active ? `Overall severity: ${active}` : 'Overall severity unknown'}
    >
      {order.map((level) => {
        const isActive = level === active;
        const style = SEVERITY[level];

        return (
          <div
            key={level}
            aria-current={isActive ? 'true' : undefined}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border-2 transition-all ${
              isActive
                ? `${style.solid} border-white shadow-lg scale-[1.03]`
                : 'bg-zinc-800/60 text-zinc-500 border-transparent'
            }`}
          >
            {/* Inherit colour from the row: Medium is black-on-amber, the others white-on-colour. */}
            <span className={isActive ? undefined : 'text-zinc-600'}>{style.icon}</span>
            <span className="font-black text-sm tracking-wider">{level.toUpperCase()}</span>
            {isActive && <span className="ml-auto text-xs font-bold">&larr;</span>}
          </div>
        );
      })}
    </div>
  );
}

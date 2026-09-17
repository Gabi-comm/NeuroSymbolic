'use client';

import { useId, useState } from 'react';

/**
 * Charts for the admin console.
 *
 * Both are single-series, so no categorical palette is needed and no colour-vision
 * adjacency applies: one mark colour, identity carried by axis labels. That also
 * means no legend -- the title names the series.
 *
 * These replace a hardcoded SVG path with six fixed points labelled Mon-Sat that
 * never changed regardless of the data, next to a filter dropdown that did
 * nothing. A dashboard that invents its own numbers is worse than no dashboard.
 */

const MARK = 'var(--color-chart-mark)';

export interface TallyDatum {
  label: string;
  value: number;
}

/**
 * Horizontal bars for counts per category.
 *
 * Horizontal rather than vertical because the category labels are multi-word
 * ("Longitudinal Crack"); vertical bars would force rotated or truncated labels.
 */
export function BarTally({ data, emptyMessage = 'No data yet.' }: {
  data: TallyDatum[];
  emptyMessage?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (!total) {
    return <p className="text-sm text-gray-500 font-bold py-8 text-center">{emptyMessage}</p>;
  }

  const max = Math.max(...data.map((d) => d.value));

  return (
    <ul className="flex flex-col gap-3">
      {data.map((datum) => {
        const pct = max > 0 ? (datum.value / max) * 100 : 0;
        return (
          <li key={datum.label} className="flex items-center gap-3">
            <span className="w-32 sm:w-40 shrink-0 text-xs font-bold text-gray-300 truncate">
              {datum.label}
            </span>
            <div className="grow h-5 bg-white/5 rounded-md overflow-hidden">
              <div
                className="h-full rounded-md transition-all duration-700"
                style={{ width: `${Math.max(pct, datum.value > 0 ? 2 : 0)}%`, backgroundColor: MARK }}
              />
            </div>
            {/* Direct label: a tally this small does not need an axis. */}
            <span className="w-14 shrink-0 text-right text-sm font-black text-white tabular-nums">
              {datum.value}
              <span className="text-gray-500 font-bold text-xs">
                {' '}
                ({Math.round((datum.value / total) * 100)}%)
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export interface TrendPoint {
  /** Axis label, e.g. "12 Sep". */
  label: string;
  value: number;
}

/**
 * Sparkline-style trend with a crosshair tooltip.
 *
 * Y starts at zero and the axis maximum is at least 1, so a run of zeroes renders
 * as a flat line on the floor rather than a misleading full-height line.
 */
export function TrendLine({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  if (data.length < 2) {
    return (
      <p className="text-sm text-gray-500 font-bold py-10 text-center">
        Not enough data in this range to show a trend.
      </p>
    );
  }

  const width = 100;
  const height = 40;
  const max = Math.max(1, ...data.map((d) => d.value));

  const x = (i: number) => (i / (data.length - 1)) * width;
  const y = (v: number) => height - (v / max) * height;

  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const area = `M0,${height} L${points.split(' ').join(' L')} L${width},${height} Z`;

  const active = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-28 overflow-visible"
        role="img"
        aria-label={`Reports over time. ${data
          .map((d) => `${d.label}: ${d.value}`)
          .join('. ')}.`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={MARK} stopOpacity="0.35" />
            <stop offset="100%" stopColor={MARK} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive baseline only; no full grid for a range this short. */}
        <line x1="0" y1={height} x2={width} y2={height} stroke="white" strokeOpacity="0.12" strokeWidth="0.5" />

        <path d={area} fill={`url(#${gradientId})`} />
        <polyline
          points={points}
          fill="none"
          stroke={MARK}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {data.map((datum, i) => (
          <g key={datum.label}>
            {hover === i && (
              <line x1={x(i)} y1="0" x2={x(i)} y2={height} stroke="white" strokeOpacity="0.25" strokeWidth="0.5" />
            )}
            <circle
              cx={x(i)}
              cy={y(datum.value)}
              r={hover === i ? 2.4 : 1.6}
              fill={hover === i ? '#fff' : '#18181b'}
              stroke={MARK}
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
            {/* Hit target larger than the mark. */}
            <rect
              x={x(i) - width / data.length / 2}
              y="0"
              width={width / data.length}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
      </svg>

      <div className="flex justify-between text-[10px] text-gray-500 font-bold mt-1">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>

      {active && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-black border border-white/15 rounded-lg px-3 py-1.5 text-xs font-bold pointer-events-none shadow-xl">
          <span className="text-gray-400">{active.label}: </span>
          <span className="text-white tabular-nums">
            {active.value} report{active.value === 1 ? '' : 's'}
          </span>
        </div>
      )}
    </div>
  );
}

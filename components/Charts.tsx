'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Charts for the admin console. Plain SVG + CSS, no chart library.
 *
 * Colour: one series wears the accent; the per-severity view uses the validated
 * severity palette (Design Tokens), which is the only categorical set in the
 * app. No other categorical colours are introduced -- categories such as
 * distress types are told apart by their labels, all in the accent.
 *
 * Marks follow the dataviz rules: 2px lines, recessive grid, a crosshair
 * tooltip on lines, a hover tooltip on bars, a legend whenever there are two or
 * more series, and a visually hidden table for screen readers. Text always
 * wears text tokens; colour sits only on the marks.
 *
 * These replaced a hardcoded SVG path with six fixed points labelled Mon-Sat
 * that never changed regardless of the data. A dashboard that invents its own
 * numbers is worse than no dashboard.
 */

export interface Series {
  key: string;
  label: string;
  /** A CSS colour, normally a token: var(--accent), var(--sev-high). */
  color: string;
  values: number[];
  /** Optional glyph shown in the legend and tooltip (severity shapes). */
  glyph?: ReactNode;
}

/**
 * A smooth line through the points that never overshoots them (monotone cubic,
 * Fritsch-Carlson), so a count of 0 never dips below the axis.
 */
function smoothPath(pts: readonly (readonly [number, number])[]) {
  const n = pts.length;
  if (n < 3) return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/** Track an element's width, for charts that draw in real pixels so text stays crisp. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A round axis maximum: 1, 2, 5, 10, 20, 50 ... at or above `n`. */
function niceMax(n: number) {
  if (n <= 4) return Math.max(1, Math.ceil(n));
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= n) return step * pow;
  return 10 * pow;
}

const Swatch = ({ color, glyph }: { color: string; glyph?: ReactNode }) =>
  glyph ? (
    <span className="inline-flex shrink-0" style={{ color }}>
      {glyph}
    </span>
  ) : (
    <span aria-hidden="true" className="inline-block w-3 h-[3px] rounded-full shrink-0" style={{ background: color }} />
  );

export function Legend({ series, totals = true }: { series: Series[]; totals?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-fg-muted">
          <Swatch color={s.color} glyph={s.glyph} />
          <span className="font-semibold text-fg">{s.label}</span>
          {totals && <span className="font-stat text-sm text-fg">{s.values.reduce((a, b) => a + b, 0)}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Line chart over time with a crosshair tooltip.
 *
 * Y starts at zero on a rounded maximum, so a run of zeroes sits on the floor
 * rather than drawing a misleading full-height line. One series gets a soft
 * area fill; several get none, so lines never hide one another.
 */
export function LineChart({
  labels,
  series,
  height = 240,
  unit = 'report',
}: {
  labels: string[];
  series: Series[];
  height?: number;
  unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const n = labels.length;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const pad = { top: 12, right: 12, bottom: 26, left: 30 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max];
  // One x label per ~72px (at most six), always including both ends. The end
  // labels are anchored outward, so a neighbour too close to the last is dropped.
  const slots = Math.min(6, Math.max(2, Math.floor(innerW / 72)));
  const every = Math.max(1, Math.ceil(n / slots));
  const xTicks = labels.map((_, i) => i).filter((i) => i % every === 0 || i === n - 1);
  if (xTicks.length > 2 && xTicks[xTicks.length - 1] - xTicks[xTicks.length - 2] < every * 0.8) xTicks.splice(-2, 1);

  const path = (values: number[]) => smoothPath(values.map((v, i) => [x(i), y(v)] as const));
  const single = series.length === 1;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - box.left) / box.width;
    setHover(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))));
  };

  // Beside the crosshair, flipping to its left near the right edge.
  const tipRight = hover !== null && x(hover) > width - 180;

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-3">
          <Legend series={series} />
        </div>
      )}
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            className="block overflow-visible"
            role="img"
            aria-label={`${series.map((s) => s.label).join(', ')} over time`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={series[0]?.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={series[0]?.color} stopOpacity="0" />
              </linearGradient>
            </defs>

            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--line)"
                  strokeDasharray={t ? '3 4' : undefined}
                />
                <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-faint text-[10px] tabular-nums">
                  {Number.isInteger(t) ? t : t.toFixed(1)}
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text
                key={i}
                x={x(i)}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                className="fill-fg-faint text-[10px]"
              >
                {labels[i]}
              </text>
            ))}

            {single && series[0] && (
              <path
                className="chart-area"
                d={`${path(series[0].values)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`}
                fill={`url(#${gradientId})`}
              />
            )}
            {series.map((s, si) => (
              <path
                key={s.key}
                className="chart-draw"
                style={{ animationDelay: `${si * 120}ms` }}
                d={path(s.values)}
                pathLength={1}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {hover !== null && (
              <g pointerEvents="none">
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={pad.top}
                  y2={pad.top + innerH}
                  stroke="var(--fg-faint)"
                  strokeOpacity="0.5"
                />
                {series.map((s) => (
                  <circle
                    key={s.key}
                    cx={x(hover)}
                    cy={y(s.values[hover])}
                    r={4.5}
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}
            <rect
              x={pad.left}
              y={0}
              width={innerW}
              height={height}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}

        {hover !== null && (
          <div
            className={`pointer-events-none absolute top-1 rounded-xl border border-line bg-surface px-3 py-2 shadow-xl text-xs min-w-[8rem] ${
              tipRight ? '-translate-x-[calc(100%+12px)]' : 'translate-x-3'
            }`}
            style={{ left: x(hover) }}
          >
            <p className="font-semibold text-fg mb-1">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-2 text-fg-muted">
                <Swatch color={s.color} glyph={s.glyph} />
                <span className="grow">{s.label}</span>
                <span className="font-semibold text-fg tabular-nums">{s.values[hover]}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>{series.map((s) => s.label).join(', ')} per period</caption>
        <thead>
          <tr>
            <th>Period</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l + i}>
              <td>{l}</td>
              {series.map((s) => (
                <td key={s.key}>
                  {s.values[i]} {unit}
                  {s.values[i] === 1 ? '' : 's'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface ProgressDatum {
  label: ReactNode;
  value: number;
  /** Mark colour; the accent when omitted. */
  color?: string;
  /** Plain-text label for the tooltip and screen readers when `label` is a node. */
  name?: string;
}

/**
 * Progress bars that grow in, one per row, with the count and its share.
 *
 * Bars are scaled to `max` (default: the largest value) so the leader fills the
 * track; the percentage is of `total` (default: the sum).
 */
export function ProgressList({
  items,
  total,
  max,
  emptyMessage = 'No data yet.',
}: {
  items: ProgressDatum[];
  total?: number;
  max?: number;
  emptyMessage?: string;
}) {
  const sum = total ?? items.reduce((a, d) => a + d.value, 0);
  const top = max ?? Math.max(0, ...items.map((d) => d.value));
  if (!sum) return <p className="text-sm text-fg-muted py-6 text-center">{emptyMessage}</p>;

  return (
    <ul className="flex flex-col gap-4">
      {items.map((d, i) => {
        const pct = top ? (d.value / top) * 100 : 0;
        const share = Math.round((d.value / sum) * 100);
        const name = d.name ?? (typeof d.label === 'string' ? d.label : '');
        return (
          <li key={name || i} title={`${name}: ${d.value} (${share}%)`}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="min-w-0 truncate text-sm font-semibold text-fg">{d.label}</span>
              <span className="shrink-0 flex items-baseline gap-2">
                <span className="text-xs text-fg-muted tabular-nums">{share}%</span>
                <span className="font-stat text-lg leading-none text-fg">{d.value}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-fg/[0.07] overflow-hidden">
              <div
                className="bar-grow h-full rounded-full"
                style={{
                  width: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`,
                  background: d.color ?? 'var(--accent)',
                  animationDelay: `${i * 90 + 150}ms`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One bar split into parts, 2px gaps between them, with a glyph + word legend. */
export function StackedBar({ parts }: { parts: { label: string; value: number; color: string; glyph?: ReactNode }[] }) {
  const sum = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div>
      <div
        className="flex h-3 gap-[2px] rounded-full overflow-hidden bg-fg/[0.07]"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}
      >
        {sum > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p, i) => (
              <div
                key={p.label}
                title={`${p.label}: ${p.value} (${Math.round((p.value / sum) * 100)}%)`}
                className="bar-grow h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(p.value / sum) * 100}%`, background: p.color, animationDelay: `${i * 120 + 150}ms` }}
              />
            ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5 text-fg-muted">
            {p.glyph ?? <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: p.color }} />}
            <span className="font-semibold text-fg">{p.label}</span>
            <span className="font-stat text-sm text-fg">{p.value}</span>
            {sum > 0 && <span className="tabular-nums">{Math.round((p.value / sum) * 100)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A ring that fills to `value / total`, with the percentage in the middle. */
export function RingProgress({
  value,
  total,
  label,
  color = 'var(--accent)',
  size = 132,
}: {
  value: number;
  total: number;
  label: string;
  color?: string;
  size?: number;
}) {
  const pct = total ? value / total : 0;
  const stroke = 11;
  const r = (size - stroke) / 2;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${Math.round(pct * 100)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fg)" strokeOpacity="0.07" strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct * 100} 100`}
          style={{ ['--ring' as string]: pct * 100 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="font-stat text-3xl leading-none text-fg">{Math.round(pct * 100)}%</span>
        <span className="mt-1 text-[11px] text-fg-muted">{label}</span>
      </div>
    </div>
  );
}

/** A small 2px trend line for stat tiles. Decorative: the tile states the number. */
export function Sparkline({
  values,
  color = 'var(--accent)',
  className = '',
}: {
  values: number[];
  color?: string;
  className?: string;
}) {
  const w = 100;
  const h = 28;
  const max = Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => `${n <= 1 ? w / 2 : (i / (n - 1)) * w},${h - 2 - (v / max) * (h - 4)}`);
  const fillId = useId();
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`spark-reveal block w-full h-7 overflow-visible ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M${pts.join(' L')} L${w},${h} L0,${h} Z`} fill={`url(#${fillId})`} />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

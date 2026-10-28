'use client';

// The Console's queue band: a segmented donut and a bar of the same three
// parts — resolved, still waiting, and high-severity still waiting.
//
// Styled after Gab's reference (Downloads/loke.jpg): thick rounded segments
// with clear gaps, the headline share in the centre in its segment's colour,
// and a dot + label + bold value legend. Colours are --q-resolved / --q-waiting
// / --q-high on .queue-band (globals.css, "Queue hero"); sky + neutral grey were
// run through the dataviz validator against the dark card, and the red is the
// validated --sev-high, never re-picked.
//
// Motion: the donut turns in while each segment draws after the one before,
// the centre counts up, the bar's segments grow in order and the resolved one
// catches a passing glint. Reduced motion jumps to the end state.

import CountUp from '@/components/dashboard/CountUp';

type Key = 'resolved' | 'waiting' | 'high';
type Part = { key: Key; label: string; value: number };

const COLOR: Record<Key, string> = {
  resolved: 'var(--q-resolved)',
  waiting: 'var(--q-waiting)',
  high: 'var(--q-high)',
};

function partsOf(resolved: number, waiting: number, high: number): Part[] {
  return [
    { key: 'resolved', label: 'Resolved', value: resolved },
    { key: 'waiting', label: 'Waiting', value: Math.max(0, waiting - high) },
    { key: 'high', label: 'High severity', value: high },
  ];
}

export function QueueDial({
  resolved,
  waiting,
  high,
  size = 176,
}: {
  resolved: number;
  waiting: number;
  high: number;
  size?: number;
}) {
  const parts = partsOf(resolved, waiting, high).filter((p) => p.value > 0);
  const sum = parts.reduce((a, p) => a + p.value, 0);
  const pct = sum ? resolved / sum : 0;

  const stroke = 16;
  const c = size / 2;
  const r = c - stroke / 2 - 2;
  const circ = 2 * Math.PI * r;
  // In pathLength units (100 = full turn): round caps reach stroke/2 past each
  // end, so trim that off both ends and leave a visible 6px gap between.
  const cap = (stroke / 2 / circ) * 100;
  const gap = parts.length > 1 ? (6 / circ) * 100 : 0;

  const shares = parts.map((p) => (p.value / sum) * 100);
  const arcs = parts.map((p, i) => {
    const start = shares.slice(0, i).reduce((a, s) => a + s, 0);
    const len = parts.length > 1 ? Math.max(0.01, shares[i] - gap - 2 * cap) : 100;
    const offset = parts.length > 1 ? start + gap / 2 + cap : 0;
    return { ...p, len, offset, delay: 250 + i * 380 };
  });

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="queue-donut -rotate-90">
        {sum === 0 && <circle cx={c} cy={c} r={r} fill="none" stroke="var(--q-track)" strokeWidth={stroke} />}
        {arcs.map((a) => (
          <circle
            key={a.key}
            className="queue-seg"
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={COLOR[a.key]}
            strokeWidth={stroke}
            strokeLinecap={parts.length > 1 ? 'round' : 'butt'}
            pathLength={100}
            strokeDasharray={`${a.len} 100`}
            strokeDashoffset={-a.offset}
            style={{ animationDelay: `${a.delay}ms` }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="font-stat text-[2.75rem] leading-none" style={{ color: 'var(--q-resolved)' }}>
          <CountUp value={Math.round(pct * 100)} duration={1500} />%
        </span>
        <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">resolved</span>
      </div>
    </div>
  );
}

/** The same three parts end to end, each its own rounded piece. */
export function QueueBar({ resolved, waiting, high }: { resolved: number; waiting: number; high: number }) {
  const parts = partsOf(resolved, waiting, high);
  const sum = parts.reduce((a, p) => a + p.value, 0);

  return (
    <div>
      <div
        className="flex h-3.5 gap-1.5"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}
      >
        {sum === 0 ? (
          <div className="grow rounded-full" style={{ background: 'var(--q-track)' }} />
        ) : (
          parts
            .filter((p) => p.value > 0)
            .map((p, i) => (
              <div
                key={p.key}
                title={`${p.label}: ${p.value} (${Math.round((p.value / sum) * 100)}%)`}
                className="bar-grow relative h-full min-w-3.5 rounded-full overflow-hidden"
                style={{
                  width: `${(p.value / sum) * 100}%`,
                  background: COLOR[p.key],
                  animationDelay: `${300 + i * 260}ms`,
                }}
              >
                {p.key === 'resolved' && <span aria-hidden="true" className="queue-glint" />}
              </div>
            ))
        )}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-7 gap-y-2 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR[p.key] }} />
            <span className="text-fg-muted">{p.label}</span>
            <span className="font-semibold text-fg tabular-nums">{p.value}</span>
            {sum > 0 && <span className="text-fg-muted tabular-nums">{Math.round((p.value / sum) * 100)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

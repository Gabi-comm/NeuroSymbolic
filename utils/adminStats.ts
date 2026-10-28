// Numbers the admin Console and Dashboard derive from the shared report
// summary (utils/adminData). Pure functions, so both pages count the same way.
//
// "Severity" here is the effective one: an admin's correction when there is
// one, the system's grade otherwise -- the same rule the report cards use.

import { isResolvedState, toSeverity, type Severity } from '@/components/Severity';
import type { ReportSummary } from '@/utils/adminData';

export const severityOf = (r: ReportSummary): Severity | null => toSeverity(r.corrected_severity ?? r.severity);
export const isResolved = (r: ReportSummary) => isResolvedState(r.state);

export const RANGES = {
  '7d': { label: '7 days', days: 7, bucket: 'day' as const },
  '30d': { label: '30 days', days: 30, bucket: 'day' as const },
  '12m': { label: '12 months', days: 365, bucket: 'month' as const },
};
export type RangeKey = keyof typeof RANGES;

const DAY = 86_400_000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Bucket labels for a range, oldest first, plus a function mapping a date to its bucket index (-1 if outside). */
export function buckets(range: RangeKey, now = new Date()) {
  const { days, bucket } = RANGES[range];
  if (bucket === 'month') {
    const labels: string[] = [];
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      labels.push(d.toLocaleDateString('en-GB', { month: 'short' }));
    }
    const indexOf = (d: Date) => {
      const i = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
      return i >= 0 && i < 12 ? i : -1;
    };
    return { labels, indexOf };
  }
  const first = startOfDay(new Date(now.getTime() - (days - 1) * DAY));
  const labels = Array.from({ length: days }, (_, i) =>
    new Date(first.getTime() + i * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  );
  const indexOf = (d: Date) => {
    const i = Math.floor((startOfDay(d).getTime() - first.getTime()) / DAY);
    return i >= 0 && i < days ? i : -1;
  };
  return { labels, indexOf };
}

/** Reports per bucket, in total and per effective severity. Gaps are zero, never skipped. */
export function submissions(reports: ReportSummary[], range: RangeKey, now = new Date()) {
  const { labels, indexOf } = buckets(range, now);
  const zero = () => labels.map(() => 0);
  const total = zero();
  const bySeverity: Record<Severity, number[]> = { High: zero(), Medium: zero(), Low: zero() };
  const corrected = zero();
  for (const r of reports) {
    if (r.uploadtime) {
      const i = indexOf(new Date(r.uploadtime));
      if (i >= 0) {
        total[i] += 1;
        const s = severityOf(r);
        if (s) bySeverity[s][i] += 1;
      }
    }
    if (r.corrected_at) {
      const i = indexOf(new Date(r.corrected_at));
      if (i >= 0) corrected[i] += 1;
    }
  }
  return { labels, total, bySeverity, corrected };
}

/** Reports filed in the window ending now, and in the window of the same length before it. */
export function periodCounts(reports: ReportSummary[], days: number, now = Date.now()) {
  let current = 0;
  let previous = 0;
  for (const r of reports) {
    if (!r.uploadtime) continue;
    const age = now - new Date(r.uploadtime).getTime();
    if (age < days * DAY) current += 1;
    else if (age < 2 * days * DAY) previous += 1;
  }
  return { current, previous };
}

/** Daily filings for the last `days` days, oldest first: the stat-tile sparklines. */
export function dailySeries(reports: ReportSummary[], days = 14, pick: (r: ReportSummary) => boolean = () => true) {
  const first = startOfDay(new Date(Date.now() - (days - 1) * DAY)).getTime();
  const out = Array.from({ length: days }, () => 0);
  for (const r of reports) {
    if (!r.uploadtime || !pick(r)) continue;
    const i = Math.floor((startOfDay(new Date(r.uploadtime)).getTime() - first) / DAY);
    if (i >= 0 && i < days) out[i] += 1;
  }
  return out;
}

/** How long the open queue has been waiting. */
export function waitingAge(reports: ReportSummary[], now = Date.now()) {
  const bands = [
    { label: 'Under a day', max: 1 },
    { label: '1–7 days', max: 7 },
    { label: '1–4 weeks', max: 30 },
    { label: 'Over a month', max: Infinity },
  ];
  const counts = bands.map(() => 0);
  for (const r of reports) {
    if (isResolved(r) || !r.uploadtime) continue;
    const days = (now - new Date(r.uploadtime).getTime()) / DAY;
    counts[bands.findIndex((b) => days < b.max)] += 1;
  }
  return bands.map((b, i) => ({ label: b.label, value: counts[i] }));
}

export function severityCounts(reports: ReportSummary[], pick: (r: ReportSummary) => boolean = () => true) {
  const out: Record<Severity, number> = { High: 0, Medium: 0, Low: 0 };
  for (const r of reports) {
    const s = severityOf(r);
    if (s && pick(r)) out[s] += 1;
  }
  return out;
}

export function typeCounts(reports: ReportSummary[]) {
  const counts = new Map<string, number>();
  for (const r of reports) {
    const key = r.damage_type?.trim() || 'Unclassified';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function averageDensity(reports: ReportSummary[]) {
  const values = reports.map((r) => r.crack_density_pct).filter((v): v is number => v != null && Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';

/** "3h", "2d", "5w" since a timestamp. */
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return '—';
  const mins = Math.max(0, (now - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  if (mins < 60 * 24 * 14) return `${Math.round(mins / 1440)}d`;
  return `${Math.round(mins / 10080)}w`;
}

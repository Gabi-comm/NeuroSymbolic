'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAdminSummary, type ReportSummary } from '@/utils/adminData';
import { SeverityBadge } from '@/components/Severity';
import { BarTally, TrendLine, type TrendPoint } from '@/components/Charts';

type Report = ReportSummary;

const RANGES = {
  '7d': { label: 'Last 7 days', days: 7, bucket: 'day' as const },
  '30d': { label: 'Last 30 days', days: 30, bucket: 'day' as const },
  '12m': { label: 'Last 12 months', days: 365, bucket: 'month' as const },
};
type RangeKey = keyof typeof RANGES;

const RESOLVED_STATES = ['resolved', 'done'];

export default function AdminDashboard() {
  // Shared with the Console and usually already loaded by the admin layout;
  // see utils/adminData. Charts and CSV are computed from it here.
  const { data, error: loadError } = useAdminSummary();
  const reports = useMemo(() => data?.reports ?? [], [data]);
  const isLoading = !data && !loadError;
  const [range, setRange] = useState<RangeKey>('7d');

  const stats = useMemo(() => {
    const isResolved = (r: Report) =>
      RESOLVED_STATES.includes((r.state ?? '').toLowerCase());

    return {
      total: reports.length,
      pending: reports.filter((r) => !isResolved(r)).length,
      severe: reports.filter((r) => (r.severity ?? '').toLowerCase() === 'high').length,
      resolved: reports.filter(isResolved).length,
    };
  }, [reports]);

  /** Counts per damage type, highest first. Real data, unlike the previous placeholder. */
  const damageTally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const report of reports) {
      const key = report.damage_type?.trim() || 'Unclassified';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [reports]);

  /** Submissions bucketed across the selected window. */
  const trend = useMemo<TrendPoint[]>(() => {
    const { days, bucket } = RANGES[range];
    const now = new Date();
    const buckets = new Map<string, number>();

    const keyFor = (date: Date) =>
      bucket === 'month'
        ? date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
        : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    // Seed every bucket so gaps render as zero rather than being skipped, which
    // would compress the x-axis and misrepresent the shape.
    const steps = bucket === 'month' ? 12 : days;
    for (let i = steps - 1; i >= 0; i--) {
      const date = new Date(now);
      if (bucket === 'month') date.setMonth(date.getMonth() - i);
      else date.setDate(date.getDate() - i);
      buckets.set(keyFor(date), 0);
    }

    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);

    for (const report of reports) {
      if (!report.uploadtime) continue;
      const date = new Date(report.uploadtime);
      if (Number.isNaN(date.getTime()) || date < cutoff) continue;

      const key = keyFor(date);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return [...buckets.entries()].map(([label, value]) => ({ label, value }));
  }, [reports, range]);

  const recent = reports.slice(0, 5);

  /** Export the full table as CSV. Previously this button did nothing. */
  const exportCsv = () => {
    const headers = [
      'id',
      'damage_type',
      'severity',
      'state',
      'uploadtime',
      'address',
      'crack_density_pct',
    ];
    const escape = (value: unknown) => {
      const text = value == null ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const csv = [
      headers.join(','),
      ...reports.map((r) => headers.map((h) => escape(r[h as keyof Report])).join(',')),
    ].join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `oasys-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const statCard = 'rounded-panel p-5 sm:p-6 shadow-xl flex flex-col min-h-[9rem]';

  return (
    <div className="min-h-screen">
      <header className="bg-header-gradient text-white rounded-b-[50px] px-4 sm:px-10 pt-8 md:pt-12 pb-20 shadow-[0_24px_70px_-24px_rgba(59,130,246,0.30)]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold mb-2 tracking-tight">
              Admin console
            </h1>
            <p className="text-oasys-blue text-sm font-bold uppercase tracking-widest">
              Analytics overview
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={exportCsv}
              disabled={isLoading || reports.length === 0}
              className="bg-white text-[#14295a] px-5 py-2.5 rounded-full font-semibold text-xs hover:bg-[#e6edff] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-10 -mt-10 relative z-10 pb-20">
        {loadError && (
          <div
            role="alert"
            className="bg-danger/10 border border-danger/40 text-danger rounded-panel p-5 mb-6"
          >
            <p className="font-bold mb-1">Could not load reports</p>
            <p className="text-sm">{loadError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-5">
          <div className={`${statCard} bg-brand-gradient text-white border border-line`}>
            <span className="font-bold text-sm text-fg-muted">Total reports</span>
            <span className="mt-auto text-5xl font-semibold tabular-nums">
              {isLoading ? '—' : stats.total}
            </span>
          </div>

          <div className={`${statCard} bg-panel-gradient text-fg border border-line`}>
            <span className="font-bold text-sm text-fg-muted">Pending review</span>
            <span className="mt-auto text-5xl font-semibold tabular-nums">
              {isLoading ? '—' : stats.pending}
            </span>
          </div>

          <div className={`${statCard} bg-panel-gradient text-fg border border-line`}>
            <span className="font-bold text-sm text-fg-muted">High severity</span>
            <span className="mt-auto text-5xl font-semibold tabular-nums text-sev-high">
              {isLoading ? '—' : stats.severe}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <section className="bg-panel-gradient rounded-panel p-6 sm:p-8 shadow-xl text-fg border border-line">
            <h2 className="font-bold text-sm text-fg-muted mb-6">Resolution status</h2>
            <div className="mt-auto">
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-ok">Resolved ({stats.resolved})</span>
                <span className="text-warn">Unresolved ({stats.pending})</span>
              </div>
              <div
                className="w-full h-4 bg-inset rounded-full overflow-hidden flex gap-[2px] ring-1 ring-inset ring-line"
                role="img"
                aria-label={`${stats.resolved} resolved, ${stats.pending} unresolved of ${stats.total}`}
              >
                <div
                  className="bg-sev-low h-full transition-all duration-700 rounded-l-full"
                  style={{ width: stats.total ? `${(stats.resolved / stats.total) * 100}%` : '0%' }}
                />
                <div
                  className="bg-sev-medium h-full transition-all duration-700 rounded-r-full"
                  style={{ width: stats.total ? `${(stats.pending / stats.total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          </section>

          <section className="bg-panel-gradient rounded-panel p-6 sm:p-8 shadow-xl text-fg border border-line">
            <div className="flex justify-between items-center gap-4 mb-4">
              <h2 className="font-bold text-sm text-fg-muted">Submissions over time</h2>
              <label className="sr-only" htmlFor="range">
                Time range
              </label>
              <select
                id="range"
                value={range}
                onChange={(e) => setRange(e.target.value as RangeKey)}
                className="bg-oasys-blue/10 text-oasys-blue text-xs font-bold px-3 py-1.5 rounded-md border border-oasys-blue/20 cursor-pointer hover:bg-oasys-blue/20 transition-colors"
              >
                {Object.entries(RANGES).map(([key, value]) => (
                  <option key={key} value={key} className="bg-surface text-fg">
                    {value.label}
                  </option>
                ))}
              </select>
            </div>
            {isLoading ? (
              <p className="text-sm text-fg-muted font-bold py-10 text-center">Loading…</p>
            ) : (
              <TrendLine data={trend} />
            )}
          </section>
        </div>

        <section className="bg-panel-gradient rounded-panel p-6 sm:p-8 shadow-xl text-fg border border-line mb-5">
          <h2 className="font-bold text-sm text-fg-muted mb-6">Distress type breakdown</h2>
          {isLoading ? (
            <p className="text-sm text-fg-muted font-bold py-8 text-center">Loading…</p>
          ) : (
            <BarTally data={damageTally} emptyMessage="No reports submitted yet." />
          )}
        </section>

        <section className="bg-panel-gradient rounded-panel p-6 sm:p-8 shadow-xl text-fg border border-line">
          <div className="flex justify-between items-center gap-4 mb-5">
            <h2 className="text-lg font-semibold tracking-wide">Recent submissions</h2>
            <Link
              href="/admin/reports"
              className="text-sm text-oasys-blue hover:text-accent-hover font-bold transition-colors shrink-0"
            >
              View all &rarr;
            </Link>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-fg-muted font-bold">Loading latest reports…</p>
          ) : recent.length === 0 ? (
            <p className="py-8 text-center text-fg-muted font-bold">
              No reports found in the database.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {recent.map((report) => (
                <li
                  key={report.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3"
                >
                  <span className="font-mono text-xs text-fg-muted sm:w-24 shrink-0">
                    RPT-{String(report.id).slice(0, 8)}
                  </span>
                  <span className="font-bold grow min-w-0 truncate">
                    {report.damage_type || 'Unclassified'}
                  </span>
                  <SeverityBadge severity={report.severity} />
                  <span className="text-xs text-fg-muted sm:w-28 shrink-0">
                    {report.uploadtime
                      ? new Date(report.uploadtime).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Unknown date'}
                  </span>
                  <Link
                    href={`/admin/reports?report=${report.id}`}
                    className="text-oasys-blue hover:text-fg text-xs font-bold transition-colors shrink-0"
                  >
                    Review &rarr;
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminSummary, type ReportSummary } from '@/utils/adminData';
import { SEVERITY, SeverityBadge, type Severity } from '@/components/Severity';
import { LineChart, ProgressList, RingProgress, StackedBar, type Series } from '@/components/Charts';
import { AdminHeader, ErrorNote, PAGE, Panel, StatTile, UnderlineTabs, deltaOf } from '@/components/admin/ui';
import {
  RANGES,
  averageDensity,
  inLastDays,
  isResolved,
  periodCounts,
  severityCounts,
  severityOf,
  shortDate,
  submissions,
  typeCounts,
  waitingAge,
  type RangeKey,
} from '@/utils/adminStats';
import { IconArrow } from '@/components/shell/icons';

type ChartView = 'total' | 'severity' | 'corrected';

const SEVERITIES: Severity[] = ['High', 'Medium', 'Low'];
const SEV_COLOR: Record<Severity, string> = { High: 'var(--sev-high)', Medium: 'var(--sev-medium)', Low: 'var(--sev-low)' };

export default function AdminDashboard() {
  // Shared with the Console and usually already loaded by the admin layout;
  // see utils/adminData. Charts and CSV are computed from it here.
  const { data, error: loadError } = useAdminSummary();
  const reports = useMemo(() => data?.reports ?? [], [data]);
  const loading = !data && !loadError;
  const [range, setRange] = useState<RangeKey>('30d');
  const [chart, setChart] = useState<ChartView>('total');

  const v = useMemo(() => {
    const { days, label } = RANGES[range];
    const inRange = inLastDays(reports, days);
    const filed = periodCounts(reports, days);
    const high = periodCounts(
      reports.filter((r) => severityOf(r) === 'High'),
      days,
    );
    const waiting = reports.filter((r) => !isResolved(r)).length;
    return {
      period: `previous ${label}`,
      inRange,
      filed,
      high,
      waiting,
      resolved: reports.length - waiting,
      density: averageDensity(inRange),
      series: submissions(reports, range),
      sev: severityCounts(inRange),
      types: typeCounts(inRange),
      age: waitingAge(reports),
    };
  }, [reports, range]);

  const lineSeries: Series[] =
    chart === 'severity'
      ? SEVERITIES.map((s) => ({
          key: s,
          label: s,
          color: SEV_COLOR[s],
          values: v.series.bySeverity[s],
          glyph: SEVERITY[s].icon,
        }))
      : chart === 'corrected'
        ? [{ key: 'corrected', label: 'Corrected', color: 'var(--accent)', values: v.series.corrected }]
        : [{ key: 'total', label: 'Reports filed', color: 'var(--accent)', values: v.series.total }];

  /** Export every report as CSV. */
  const exportCsv = () => {
    const headers: (keyof ReportSummary)[] = [
      'id',
      'damage_type',
      'severity',
      'corrected_severity',
      'state',
      'uploadtime',
      'address',
      'crack_density_pct',
    ];
    const escape = (value: unknown) => {
      const text = value == null ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [headers.join(','), ...reports.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `oasys-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const rangeLabel = RANGES[range].label;

  return (
    <main className={PAGE}>
      <AdminHeader eyebrow="Analytics" title="Dashboard">
        <button
          onClick={exportCsv}
          disabled={loading || reports.length === 0}
          className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-line bg-surface text-sm font-semibold text-fg hover:border-line-strong disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
          </svg>
          Export CSV
        </button>
      </AdminHeader>

      {loadError && <ErrorNote title="Could not load reports" message={loadError} />}

      <div className="page-enter mb-4 flex items-center justify-between gap-4">
        <UnderlineTabs
          label="Time range"
          value={range}
          onChange={setRange}
          tabs={(Object.keys(RANGES) as RangeKey[]).map((k) => ({ key: k, label: RANGES[k].label }))}
        />
      </div>

      <div className="stagger grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          label={`Filed · ${rangeLabel}`}
          value={v.filed.current}
          loading={loading}
          delta={deltaOf(v.filed.current, v.filed.previous, v.period)}
          spark={v.series.total}
        />
        <StatTile
          label={`High severity · ${rangeLabel}`}
          value={v.high.current}
          loading={loading}
          tone="text-sev-high"
          delta={deltaOf(v.high.current, v.high.previous, v.period, false)}
          spark={v.series.bySeverity.High}
          sparkColor="var(--sev-high)"
        />
        <StatTile label="Needs action" value={v.waiting} loading={loading} href="/admin/reports" />
        <div className="lift flex flex-col rounded-2xl bg-surface border border-line p-4 sm:p-5 min-h-[8.5rem]">
          <span className="text-sm font-medium text-fg-muted">Avg crack density</span>
          <span className="mt-3 font-stat text-4xl sm:text-5xl leading-none text-fg">
            {loading ? (
              <span className="skeleton inline-block h-10 w-20 rounded-lg align-middle" />
            ) : v.density === null ? (
              '—'
            ) : (
              <>
                {v.density.toFixed(2)}
                <span className="text-2xl text-fg-muted">%</span>
              </>
            )}
          </span>
          <span className="mt-2 text-xs text-fg-muted">of road surface · {rangeLabel}</span>
        </div>
      </div>

      <Panel
        className="mt-4"
        title="Submissions over time"
        action={
          <UnderlineTabs
            label="Series"
            value={chart}
            onChange={setChart}
            tabs={[
              { key: 'total', label: 'Total' },
              { key: 'severity', label: 'By severity' },
              { key: 'corrected', label: 'Corrections' },
            ]}
          />
        }
      >
        {loading ? (
          <div className="skeleton h-[260px] rounded-xl" />
        ) : (
          // Keyed so the lines draw in again on every switch.
          <LineChart key={`${range}-${chart}`} labels={v.series.labels} series={lineSeries} height={260} />
        )}
      </Panel>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={`Severity · ${rangeLabel}`}>
          {loading ? (
            <div className="skeleton h-40 rounded-xl" />
          ) : (
            <ProgressList
              key={range}
              items={SEVERITIES.map((s) => ({
                name: s,
                label: <SeverityBadge severity={s} size="md" />,
                value: v.sev[s],
                color: SEV_COLOR[s],
              }))}
              emptyMessage={`No graded reports in the last ${rangeLabel}.`}
            />
          )}
        </Panel>
        <Panel title={`Distress types · ${rangeLabel}`}>
          {loading ? (
            <div className="skeleton h-40 rounded-xl" />
          ) : (
            <ProgressList key={range} items={v.types.slice(0, 6)} emptyMessage={`No reports in the last ${rangeLabel}.`} />
          )}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Resolution">
          {loading ? (
            <div className="skeleton h-48 rounded-xl" />
          ) : (
            <div className="flex flex-col items-center gap-5">
              <RingProgress value={v.resolved} total={reports.length} label="resolved" color="var(--ok)" />
              <div className="w-full">
                <StackedBar
                  parts={[
                    { label: 'Resolved', value: v.resolved, color: 'var(--ok)' },
                    { label: 'Needs action', value: v.waiting, color: 'var(--warn)' },
                  ]}
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Waiting time">
          {loading ? (
            <div className="skeleton h-48 rounded-xl" />
          ) : (
            <ProgressList
              items={v.age.map((b, i) => ({ ...b, color: i >= 2 ? 'var(--warn)' : 'var(--accent)' }))}
              total={v.waiting}
              emptyMessage="Nothing is waiting."
            />
          )}
        </Panel>

        <Panel
          title="Latest"
          action={
            <Link
              href="/admin/reports"
              className="group inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-hover"
            >
              All
              <IconArrow className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          }
        >
          {loading ? (
            <div className="skeleton h-48 rounded-xl" />
          ) : reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-muted">No reports yet.</p>
          ) : (
            <ul className="stagger -my-2 divide-y divide-line">
              {reports.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/reports?report=${r.id}`}
                    className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-xl hover:bg-fg/[0.04] transition-colors"
                  >
                    <span className="min-w-0 grow">
                      <span className="block text-sm font-semibold text-fg truncate">{r.damage_type || 'Unclassified'}</span>
                      <span className="block text-xs text-fg-muted">{shortDate(r.uploadtime)}</span>
                    </span>
                    <SeverityBadge severity={r.corrected_severity ?? r.severity} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { SeverityBadge } from '@/components/Severity';
import { useAdminSession, useAdminSummary } from '@/utils/adminData';

/**
 * Front door for the admin side.
 *
 * Sits inside app/admin/layout.tsx, which enforces the role check and hands down
 * the username, so this page carries no auth logic of its own. Its numbers come
 * from the summary the layout already started loading (utils/adminData).
 *
 * Leads with what needs doing rather than with totals: an administrator opening
 * this wants to know whether anything is waiting, not how many reports have ever
 * been filed.
 */
interface Stats {
  total: number;
  pending: number;
  high: number;
  resolved: number;
  users: number;
  corrected: number;
}

const SECTIONS = [
  {
    href: '/admin/dashboard',
    title: 'Dashboard',
    detail: 'Submission trends, distress-type breakdown and resolution status.',
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </>
    ),
  },
  {
    href: '/admin/reports',
    title: 'Reports',
    detail: 'Every submitted assessment, with a map, corrections and resolution.',
    icon: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8M8 17h5" />
      </>
    ),
  },
  {
    href: '/admin/users',
    title: 'Users',
    detail: 'View accounts, assign reporter types and grant admin access.',
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
  },
];

export default function AdminHome() {
  const username = useAdminSession()?.username ?? null;
  const { data, error: loadError } = useAdminSummary();

  // Derived from the one summary instead of six count queries. A report with
  // no state counts as waiting, as it does on the Reports page.
  const { stats, recent } = useMemo(() => {
    if (!data) return { stats: null as Stats | null, recent: [] };
    const { reports } = data;
    const waiting = reports.filter((r) => r.state !== 'Resolved');
    return {
      stats: {
        total: reports.length,
        pending: waiting.length,
        high: reports.filter((r) => (r.severity ?? '').toLowerCase() === 'high').length,
        resolved: reports.length - waiting.length,
        users: data.userCount,
        corrected: reports.filter((r) => r.corrected_at != null).length,
      },
      recent: waiting.slice(0, 4),
    };
  }, [data]);

  const nothingWaiting = stats !== null && stats.pending === 0;

  return (
    <div className="min-h-screen">
      <header className="bg-header-gradient text-white rounded-b-[50px] px-4 sm:px-10 pt-28 sm:pt-32 pb-20 shadow-[0_24px_70px_-24px_rgba(59,130,246,0.30)]">
        <div className="max-w-5xl mx-auto">
          <p className="text-oasys-blue text-sm font-bold uppercase tracking-widest mb-2">
            Admin console
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-3">
            {username ? `Welcome back, ${username}` : 'Welcome back'}
          </h1>

          {/* Lead with the state of the queue, not a total. */}
          <p className="text-lg text-gray-300 max-w-2xl">
            {stats === null ? (
              <span className="text-gray-500">Loading the queue…</span>
            ) : nothingWaiting ? (
              <>
                Nothing is waiting for review.{' '}
                <span className="text-gray-500">
                  {stats.total} report{stats.total === 1 ? '' : 's'} filed in total.
                </span>
              </>
            ) : (
              <>
                <strong className="text-white">
                  {stats.pending} report{stats.pending === 1 ? '' : 's'}
                </strong>{' '}
                {stats.pending === 1 ? 'needs' : 'need'} review
                {stats.high > 0 && (
                  <>
                    , <strong className="text-[#f87171]">{stats.high} high severity</strong>
                  </>
                )}
                .
              </>
            )}
          </p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-10 -mt-12 relative z-10 pb-20">
        {loadError && (
          <div
            role="alert"
            className="bg-red-950/80 border border-red-500/40 text-red-200 rounded-panel p-5 mb-6"
          >
            <p className="font-bold mb-1">Could not load the overview</p>
            <p className="text-sm">{loadError}</p>
          </div>
        )}

        {/* Sections first: this page exists to get you somewhere. */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="bg-panel-gradient border border-white/10 rounded-panel p-6 shadow-xl hover:border-oasys-blue/50 hover:-translate-y-1 transition-all group"
            >
              <span
                aria-hidden="true"
                className="w-11 h-11 rounded-xl bg-oasys-blue/15 text-oasys-blue flex items-center justify-center mb-4 group-hover:bg-oasys-blue group-hover:text-white transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {section.icon}
                </svg>
              </span>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <h2 className="font-black text-white text-lg">{section.title}</h2>
                <span
                  aria-hidden="true"
                  className="text-oasys-blue group-hover:translate-x-1 transition-transform font-black"
                >
                  &rarr;
                </span>
              </div>
              <p className="text-sm text-gray-400 leading-snug">{section.detail}</p>
            </Link>
          ))}
        </section>

        {/* Waiting work, with a route straight into it. */}
        <section className="bg-panel-gradient border border-white/10 rounded-panel p-6 sm:p-7 shadow-xl mb-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-black text-white">Waiting for review</h2>
            {stats !== null && stats.pending > 0 && (
              <Link
                href="/admin/reports"
                className="text-sm text-oasys-blue hover:text-blue-400 font-bold shrink-0"
              >
                Open reports &rarr;
              </Link>
            )}
          </div>

          {stats === null ? (
            <p className="text-sm text-gray-500 font-bold py-6 text-center">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              The queue is empty. Submitted reports appear here.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/5">
              {recent.map((report) => (
                <li key={report.id} className="flex flex-wrap items-center gap-3 py-3">
                  <SeverityBadge severity={report.corrected_severity ?? report.severity} />
                  <span className="font-bold text-white grow min-w-0 truncate">
                    {report.corrected_severity ? (
                      <>
                        {report.damage_type || 'Unclassified'}{' '}
                        <span className="text-xs font-bold text-oasys-blue">· corrected</span>
                      </>
                    ) : (
                      report.damage_type || 'Unclassified'
                    )}
                  </span>
                  <span className="text-xs text-gray-500 truncate max-w-[16rem]">
                    {report.address || 'No address'}
                  </span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {report.uploadtime
                      ? new Date(report.uploadtime).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Totals last: context, not the headline. */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total reports', value: stats?.total },
            { label: 'Resolved', value: stats?.resolved, accent: 'text-[#4ade80]' },
            { label: 'Corrected', value: stats?.corrected, accent: 'text-oasys-blue' },
            { label: 'Users', value: stats?.users },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-black/30 border border-white/10 rounded-2xl p-5"
            >
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">
                {item.label}
              </p>
              <p className={`text-3xl font-black tabular-nums ${item.accent ?? 'text-white'}`}>
                {item.value === undefined ? '—' : item.value}
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { SEVERITY, SeverityBadge } from '@/components/Severity';
import { useAdminSession, useAdminSummary } from '@/utils/adminData';
import { ago, dailySeries, isResolved, severityOf, waitingAge } from '@/utils/adminStats';
import { ProgressList } from '@/components/Charts';
import { AdminHeader, ErrorNote, PAGE, Panel, StatTile } from '@/components/admin/ui';
import { QueueBar, QueueDial } from '@/components/admin/QueueHero';
import { IconArrow, IconList, IconUsers } from '@/components/shell/icons';

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

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const IconClock = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const IconCheck = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </svg>
);

export default function AdminHome() {
  const username = useAdminSession()?.username ?? null;
  const { data, error: loadError } = useAdminSummary();
  const loading = !data && !loadError;

  const view = useMemo(() => {
    const reports = data?.reports ?? [];
    const waiting = reports.filter((r) => !isResolved(r));
    const highWaiting = waiting.filter((r) => severityOf(r) === 'High');
    // Highest severity first, then oldest first: what to look at next.
    const rank = { High: 0, Medium: 1, Low: 2 } as const;
    const queue = [...waiting]
      .sort((a, b) => {
        const sa = severityOf(a);
        const sb = severityOf(b);
        const d = (sa ? rank[sa] : 3) - (sb ? rank[sb] : 3);
        return d || new Date(a.uploadtime ?? 0).getTime() - new Date(b.uploadtime ?? 0).getTime();
      })
      .slice(0, 6);
    return {
      total: reports.length,
      waiting: waiting.length,
      high: highWaiting.length,
      resolved: reports.length - waiting.length,
      corrected: reports.filter((r) => r.corrected_at != null).length,
      users: data?.userCount ?? 0,
      queue,
      age: waitingAge(reports),
      sparkWaiting: dailySeries(reports, 14, (r) => !isResolved(r)),
      sparkHigh: dailySeries(reports, 14, (r) => severityOf(r) === 'High'),
      sparkResolved: dailySeries(reports, 14, isResolved),
    };
  }, [data]);

  return (
    <main className={PAGE}>
      <AdminHeader eyebrow="Admin console" title={`${greeting()}${username ? `, ${username}` : ''}`}>
        <Link
          href="/admin/reports"
          className="btn-blue group inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold"
        >
          Review queue
          <IconArrow className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </AdminHeader>

      {loadError && <ErrorNote title="Could not load the overview" message={loadError} />}

      {/* The queue at a glance: how much is done, how much is left. */}
      <section
        data-tour="admin-queue"
        className="page-enter rounded-[24px] hero-theme queue-band p-5 sm:p-7 flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
        {loading ? (
          <div className="skeleton w-[176px] h-[176px] rounded-full shrink-0" />
        ) : (
          <QueueDial resolved={view.resolved} waiting={view.waiting} high={view.high} />
        )}
        <div className="grow min-w-0">
          <p className="text-xl sm:text-2xl font-semibold text-fg leading-snug">
            {loading ? (
              <span className="skeleton inline-block h-7 w-64 rounded-lg" />
            ) : view.waiting === 0 ? (
              'Nothing is waiting for review.'
            ) : (
              <>
                {view.waiting} report{view.waiting === 1 ? '' : 's'} {view.waiting === 1 ? 'needs' : 'need'} review
                {view.high > 0 && (
                  <>
                    , <span className="text-sev-high">{view.high} high severity</span>
                  </>
                )}
                .
              </>
            )}
          </p>
          <div className="mt-5 max-w-2xl">
            {!loading && <QueueBar resolved={view.resolved} waiting={view.waiting} high={view.high} />}
          </div>
        </div>
      </section>

      <div className="stagger mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          label="Needs action"
          value={view.waiting}
          loading={loading}
          icon={<IconClock />}
          tone="text-fg"
          spark={view.sparkWaiting}
          href="/admin/reports"
        />
        <StatTile
          label="High severity"
          value={view.high}
          loading={loading}
          icon={<span className="text-sev-high">{SEVERITY.High.icon}</span>}
          tone="text-sev-high"
          spark={view.sparkHigh}
          sparkColor="var(--sev-high)"
          href="/admin/reports"
        />
        <StatTile
          label="Resolved"
          value={view.resolved}
          loading={loading}
          icon={<IconCheck />}
          tone="text-ok"
          spark={view.sparkResolved}
          sparkColor="var(--ok)"
          href="/admin/dashboard"
        />
        <StatTile label="Accounts" value={view.users} loading={loading} icon={<IconUsers />} href="/admin/users" />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          className="lg:col-span-2"
          title="Next up"
          action={
            view.waiting > 0 && (
              <Link
                href="/admin/reports"
                className="group inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-hover"
              >
                All {view.waiting}
                <IconArrow className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )
          }
        >
          {loading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : view.queue.length === 0 ? (
            <div className="py-10 text-center">
              <IconCheck className="mx-auto w-8 h-8 text-ok" />
              <p className="mt-3 font-semibold text-fg">The queue is empty</p>
            </div>
          ) : (
            <ul className="stagger -my-2 divide-y divide-line">
              {view.queue.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/reports?report=${r.id}`}
                    className="group flex items-center gap-3 sm:gap-4 py-3 -mx-2 px-2 rounded-xl hover:bg-fg/[0.04] transition-colors"
                  >
                    <span className="w-24 shrink-0">
                      <SeverityBadge severity={r.corrected_severity ?? r.severity} />
                    </span>
                    <span className="min-w-0 grow">
                      <span className="block text-sm font-semibold text-fg truncate">
                        {r.damage_type || 'Unclassified'}
                        {r.corrected_severity && <span className="ml-2 text-xs font-medium text-accent">corrected</span>}
                      </span>
                      <span className="block text-xs text-fg-muted truncate">{r.address || 'No address'}</span>
                    </span>
                    <span className="text-xs text-fg-muted tabular-nums shrink-0" title="Waiting for">
                      {ago(r.uploadtime)}
                    </span>
                    <IconArrow className="w-4 h-4 text-fg-faint group-hover:text-accent group-hover:translate-x-0.5 transition shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Waiting time">
          {loading ? (
            <div className="skeleton h-40 rounded-xl" />
          ) : (
            <ProgressList
              items={view.age.map((b, i) => ({ ...b, color: i >= 2 ? 'var(--warn)' : 'var(--accent)' }))}
              total={view.waiting}
              emptyMessage="Nothing is waiting."
            />
          )}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Reports filed', value: view.total, href: '/admin/reports', icon: <IconList /> },
          { label: 'Corrected by admins', value: view.corrected, href: '/admin/reports', icon: <IconCheck /> },
          { label: 'Open the dashboard', value: null, href: '/admin/dashboard', icon: <IconArrow /> },
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="lift group flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4 hover:border-line-strong"
          >
            <span className="text-sm font-medium text-fg-muted group-hover:text-fg transition-colors">{item.label}</span>
            <span className="flex items-center gap-2 text-fg">
              {item.value !== null && <span className="font-stat text-2xl">{loading ? '—' : item.value}</span>}
              <span className="text-fg-faint group-hover:text-accent transition-colors">{item.icon}</span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}

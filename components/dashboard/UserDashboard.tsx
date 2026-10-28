'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useUserSummary, type UserReport } from '@/utils/userData';
import { SEVERITY, SeverityBadge, StatusLabel, isResolvedState, toSeverity, type Severity } from '@/components/Severity';
import type { MapReport } from '@/components/ReportsMap';
import HelpButton from '@/components/help/HelpButton';
import CountUp from './CountUp';
import Street from './Street';
import { IconArrow, IconCamera, IconCompass, IconList, IconPlus, IconReport } from '@/components/shell/icons';
import { SHELL_EVENTS } from '@/components/shell/nav';

// Leaflet touches `window`, so the map only renders in the browser.
const ReportsMap = dynamic(() => import('@/components/ReportsMap'), {
  ssr: false,
  loading: () => <div className="skeleton h-[20rem] lg:h-[26rem] rounded-2xl" />,
});

type Filter = 'all' | 'open' | 'resolved' | 'captures';

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Needs action' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'captures', label: 'Captures' },
];

const dateLong = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
const dateShort = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' });

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const typeOf = (r: UserReport) => r.corrected_damage_type ?? r.damage_type ?? 'Distress';
const severityOf = (r: UserReport) => r.corrected_severity ?? r.severity;

export default function UserDashboard({ userId, name }: { userId: string; name: string }) {
  const { data, error } = useUserSummary(userId);
  const [filter, setFilter] = useState<Filter>('all');

  const reports = useMemo(() => data?.reports ?? [], [data]);
  const captures = useMemo(() => data?.captures ?? [], [data]);

  const stats = useMemo(() => {
    const resolved = reports.filter((r) => isResolvedState(r.state)).length;
    return {
      filed: reports.length,
      open: reports.length - resolved,
      resolved,
      captures: data?.capturesWaiting ?? 0,
    };
  }, [reports, data]);

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { High: 0, Medium: 0, Low: 0 };
    for (const r of reports) {
      const key = toSeverity(severityOf(r));
      if (key) counts[key] += 1;
    }
    return counts;
  }, [reports]);

  const mapPoints = useMemo<MapReport[]>(() => {
    if (filter === 'captures') {
      return captures.map((c) => ({
        id: c.id,
        lat: c.lat,
        lng: c.lng,
        damage_type: null,
        severity: null,
        state: null,
        address: c.address,
        kind: 'capture' as const,
      }));
    }
    return reports
      .filter((r) =>
        filter === 'all' ? true : filter === 'resolved' ? isResolvedState(r.state) : !isResolvedState(r.state)
      )
      .map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        damage_type: typeOf(r),
        severity: severityOf(r),
        state: r.state,
        address: r.address,
      }));
  }, [reports, captures, filter]);

  const activity = useMemo(() => {
    const events: { at: string; label: string; detail: string; tone: 'accent' | 'ok' | 'warn' | 'muted' }[] = [];
    for (const r of reports) {
      if (r.uploadtime)
        events.push({
          at: r.uploadtime,
          label: `Filed ${typeOf(r).toLowerCase()}`,
          detail: r.barangay || r.address || 'Location saved',
          tone: isResolvedState(r.state) ? 'ok' : 'accent',
        });
      if (r.corrected_at)
        events.push({ at: r.corrected_at, label: 'Reviewed by an admin', detail: typeOf(r), tone: 'warn' });
    }
    for (const c of captures)
      events.push({ at: c.captured_at, label: 'Captured a photo', detail: c.address || 'Waiting to be reported', tone: 'muted' });
    return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [reports, captures]);

  const loading = !data && !error;
  const isEmpty = !!data && reports.length === 0 && captures.length === 0;
  const maxSeverity = Math.max(1, ...Object.values(severityCounts));

  const tiles: { key: Filter; label: string; value: number; icon: typeof IconList; tone: string }[] = [
    { key: 'all', label: 'Reports filed', value: stats.filed, icon: IconList, tone: 'text-accent' },
    { key: 'open', label: 'Needs action', value: stats.open, icon: IconReport, tone: 'text-warn' },
    { key: 'resolved', label: 'Resolved', value: stats.resolved, icon: IconCompass, tone: 'text-ok' },
    { key: 'captures', label: 'Captures waiting', value: stats.captures, icon: IconCamera, tone: 'text-fg-muted' },
  ];

  return (
    <main className="px-4 sm:px-8 lg:px-10 pt-5 md:pt-8 pb-12 max-w-[1240px] mx-auto">
      {/* Hero */}
      <section className="page-enter relative overflow-hidden rounded-[28px] hero-theme px-6 sm:px-9 pt-6 sm:pt-9 pb-[116px] flex flex-col lg:flex-row lg:items-end gap-6">
        <Street />
        <div className="relative grow">
          <p className="text-sm font-semibold text-fg-muted">{dateLong.format(new Date())}</p>
          <h1 className="mt-1 text-3xl sm:text-[44px] leading-tight font-semibold tracking-tight text-fg">
            {greeting()}, {name}
          </h1>
          <p className="mt-2 text-lg sm:text-xl font-semibold text-fg-soft">
            Report and analyze distresses around you
          </p>
        </div>
        <div className="relative flex flex-wrap gap-3">
          <Link
            href="/report-damage"
            className="hero-cta group inline-flex items-center gap-2 h-12 px-5 rounded-xl font-semibold transition-colors"
          >
            <IconPlus className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
            Report a distress
          </Link>
          <Link
            href="/captured-distress"
            className="inline-flex items-center gap-2 h-12 px-5 rounded-xl border border-line-strong text-fg font-semibold hover:bg-fg/10 transition-colors"
          >
            <IconCamera className="w-5 h-5" />
            Capture now
          </Link>
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-5 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          Could not load your reports: {error}
        </p>
      )}

      {/* Stat tiles: each one filters the map below. */}
      <section data-tour="stats" aria-label="Your numbers" className="stagger mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map((tile) => {
          const active = filter === tile.key;
          return (
            <button
              key={tile.key}
              onClick={() => setFilter(tile.key)}
              aria-pressed={active}
              className={`lift text-left rounded-2xl bg-surface border p-4 sm:p-5 ${
                active ? 'border-accent shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line'
              }`}
            >
              <span className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-semibold text-fg-muted">{tile.label}</span>
                <tile.icon className={`w-[18px] h-[18px] ${tile.tone}`} />
              </span>
              <span className="mt-3 block font-stat text-4xl sm:text-5xl leading-none text-fg">
                {loading ? <span className="skeleton inline-block w-12 h-10 rounded-md align-bottom" /> : <CountUp value={tile.value} />}
              </span>
            </button>
          );
        })}
      </section>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Live map */}
            <section data-tour="map" className="page-enter lg:col-span-2 rounded-2xl bg-surface border border-line p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
                  Your map
                  <HelpButton topic="map" />
                </h2>
                <div role="tablist" aria-label="Show" className="flex gap-4 text-sm">
                  {FILTER_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      role="tab"
                      aria-selected={filter === tab.key}
                      onClick={() => setFilter(tab.key)}
                      className={`relative pb-1 transition-colors ${
                        filter === tab.key ? 'font-semibold text-fg' : 'text-fg-muted hover:text-fg'
                      }`}
                    >
                      {tab.label}
                      <span
                        aria-hidden="true"
                        className={`absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-accent origin-left transition-transform duration-300 ${
                          filter === tab.key ? 'scale-x-100' : 'scale-x-0'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              {/* Keyed by filter so the pins drop in again on every switch. */}
              <ReportsMap key={filter} reports={mapPoints} heightClass="h-[20rem] lg:h-[26rem]" />
            </section>

            <div className="flex flex-col gap-4">
              {/* Severity breakdown */}
              <section className="page-enter rounded-2xl bg-surface border border-line p-5">
                <h2 className="text-lg font-semibold text-fg mb-4">Severity breakdown</h2>
                <ul className="flex flex-col gap-3.5">
                  {(['High', 'Medium', 'Low'] as Severity[]).map((key, i) => (
                    <li key={key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <SeverityBadge severity={key} size="md" />
                        <span className="font-stat text-xl text-fg">
                          <CountUp value={severityCounts[key]} />
                        </span>
                      </div>
                      {/* A cut scored along a dashed guide, ending at the count. */}
                      <div className={`cut-track ${SEVERITY[key].text}`}>
                        <div
                          className="cut-line"
                          style={{ ['--w' as string]: `${(severityCounts[key] / maxSeverity) * 100}%`, ['--i' as string]: i }}
                        >
                          {severityCounts[key] > 0 && <span className="cut-tip" />}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Activity */}
              <section className="page-enter rounded-2xl bg-surface border border-line p-5 grow">
                <h2 className="text-lg font-semibold text-fg mb-4">Activity</h2>
                {loading ? (
                  <div className="flex flex-col gap-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton h-10 rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <ol className="stagger relative flex flex-col gap-4 before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-px before:bg-line">
                    {activity.map((event, i) => (
                      <li key={`${event.at}-${i}`} className="relative pl-6">
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-surface ${
                            event.tone === 'ok'
                              ? 'bg-ok'
                              : event.tone === 'warn'
                                ? 'bg-warn'
                                : event.tone === 'accent'
                                  ? 'bg-accent'
                                  : 'bg-fg-faint'
                          } ${i === 0 ? 'ping text-accent' : ''}`}
                        />
                        <p className="text-sm font-semibold text-fg leading-snug">{event.label}</p>
                        <p className="text-xs text-fg-muted truncate">
                          {dateShort.format(new Date(event.at))} · {event.detail}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>

          {/* Recent reports + captures waiting */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="page-enter rounded-2xl bg-surface border border-line p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-fg">Recent reports</h2>
                <Link href="/my-reports" className="group inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-hover">
                  View all
                  <IconArrow className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <ul className="stagger grid grid-cols-1 sm:grid-cols-3 gap-3">
                {reports.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <Link href="/my-reports" className="lift block rounded-xl border border-line overflow-hidden bg-surface-2">
                      <span className="block aspect-[4/3] bg-inset overflow-hidden">
                        {data?.images[String(r.id)] ? (
                          // eslint-disable-next-line @next/next/no-img-element -- base64 data URL
                          <img src={data.images[String(r.id)]} alt="" className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
                        ) : (
                          <span className="grid place-items-center h-full text-fg-faint">
                            <IconReport className="w-6 h-6" />
                          </span>
                        )}
                      </span>
                      <span className="block p-3">
                        <span className="block text-sm font-semibold text-fg truncate">{typeOf(r)}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <SeverityBadge severity={severityOf(r)} />
                          <StatusLabel state={r.state} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
                {reports.length === 0 && (
                  <li className="sm:col-span-3 py-6 text-center text-sm text-fg-muted">No reports filed yet</li>
                )}
              </ul>
            </section>

            <section data-tour="captures" className="page-enter rounded-2xl bg-surface border border-line p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
                  Captures waiting
                  <HelpButton topic="capture" />
                </h2>
                <Link href="/captured-distress" className="group inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-hover">
                  Open
                  <IconArrow className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <ul className="stagger grid grid-cols-3 gap-3">
                {captures.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link
                      href="/captured-distress"
                      className="lift block aspect-square rounded-xl overflow-hidden border border-line bg-inset"
                    >
                      {data?.thumbs[c.image_path] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                        <img src={data.thumbs[c.image_path]} alt={c.address ?? 'Captured photo'} className="w-full h-full object-cover" />
                      ) : (
                        <span className="grid place-items-center h-full text-fg-faint">
                          <IconCamera className="w-6 h-6" />
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
                {captures.length === 0 && (
                  <li className="col-span-3 py-6 text-center text-sm text-fg-muted">Nothing waiting</li>
                )}
              </ul>
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <section className="page-enter mt-4 rounded-2xl border border-dashed border-line-strong bg-surface p-8 sm:p-12 text-center">
      <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-accent-soft text-accent">
        <IconReport className="w-6 h-6" />
      </span>
      <h2 className="mt-4 text-2xl font-semibold text-fg">File your first report</h2>
      <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
        <Link href="/report-damage" className="btn-blue inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl font-semibold">
          <IconPlus className="w-5 h-5" />
          Report a distress
        </Link>
        <button
          onClick={() => window.dispatchEvent(new Event(SHELL_EVENTS.tour))}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-line text-fg font-semibold hover:bg-fg/5"
        >
          <IconCompass className="w-5 h-5" />
          Take the tour
        </button>
      </div>
    </section>
  );
}

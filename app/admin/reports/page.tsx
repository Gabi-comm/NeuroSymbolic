'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase } from '@/utils/supabase';
import { SeverityBadge } from '@/components/Severity';
import type { MapReport } from '@/components/ReportsMap';
import FixReportModal, { type FixableReport } from '@/components/FixReportModal';
import Coordinates from '@/components/Coordinates';
import { invalidateAdminSummary } from '@/utils/adminData';
import Pagination, { PAGE_SIZE, lastPage } from '@/components/Pagination';

const ReportsMap = dynamic(() => import('@/components/ReportsMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[22rem] sm:h-[30rem] rounded-2xl bg-inset flex items-center justify-center font-bold text-fg-muted">
      Loading map…
    </div>
  ),
});

// Every report, without its photo or bulletin. A row is a few hundred bytes,
// so the map can still show every defect and search still covers everything.
// image_url is a base64 data URL; selecting it for every row was what made
// this page slow.
const INDEX_COLUMNS =
  'id, lat, lng, damage_type, severity, state, address, uploadtime, userid, corrected_damage_type, corrected_severity, correction_note';
// The rest of a card, fetched only for the cards on the current pages.
const DETAIL_COLUMNS =
  'id, file_name, confidence, detection_details, observation_details, crack_density_pct, corrected_at';

interface IndexRow extends MapReport {
  userid: string | null;
  uploadtime: string | null;
  corrected_damage_type: string | null;
  corrected_severity: string | null;
  correction_note: string | null;
}

interface Detail {
  file_name: string | null;
  confidence: number | null;
  detection_details: string | null;
  observation_details: unknown;
  crack_density_pct: number | null;
  corrected_at: string | null;
}

type Report = IndexRow & Partial<Detail>;

interface Filer {
  username: string | null;
  user_type: string | null;
}

export default function AdminReports() {
  const [reports, setReports] = useState<IndexRow[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  // Photos, fetched one at a time when a card is opened. undefined = not yet.
  const [images, setImages] = useState<Record<string, string | null>>({});
  // One queue on screen at a time; each keeps its own page.
  const [view, setView] = useState<'needs' | 'resolved'>('needs');
  const [needsPage, setNeedsPage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);
  // Who filed each report, keyed by auth uid (FileUpload.userid ->
  // UserDetail.userloginuuid). Admins can read every profile.
  const [filers, setFilers] = useState<Record<string, Filer>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMap, setShowMap] = useState(true);
  // "Track report": which report the map is following. The nonce lets the
  // same button fly back to the same report after the map was panned away.
  const [tracked, setTracked] = useState<{ id: string; nonce: number } | null>(null);
  const mapRef = useRef<HTMLElement>(null);

  const trackReport = (report: Report) => {
    setShowMap(true);
    setTracked((prev) => ({ id: String(report.id), nonce: (prev?.nonce ?? 0) + 1 }));
    // After the map section has rendered (it may have been hidden).
    requestAnimationFrame(() =>
      mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  const [pendingAction, setPendingAction] = useState<{
    id: string;
    to: 'Resolved' | 'Needs Action';
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fixing, setFixing] = useState<Report | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchReports = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('FileUpload')
          .select(INDEX_COLUMNS)
          .order('uploadtime', { ascending: false });

        if (error) throw error;
        const rows = (data ?? []) as IndexRow[];
        if (!isMounted) return;
        setReports(rows);

        // Deep link from the dashboard's Review button: /admin/reports?report=<id>.
        // Open the page of the column the report is in, so the card is on screen.
        const target = new URLSearchParams(window.location.search).get('report');
        if (target) {
          const hit = rows.find((r) => String(r.id) === target);
          if (hit) {
            const isResolved = hit.state === 'Resolved';
            const column = rows.filter((r) => (r.state === 'Resolved') === isResolved);
            const page = Math.floor(column.indexOf(hit) / PAGE_SIZE) + 1;
            if (isResolved) setResolvedPage(page);
            else setNeedsPage(page);
            setView(isResolved ? 'resolved' : 'needs');
          }
          setExpandedId(target);
        }
      } catch (err) {
        if (isMounted) {
          setLoadError(err instanceof Error ? err.message : 'Could not load reports.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchReports();

    return () => {
      isMounted = false;
    };
  }, []);

  const applyStateChange = async () => {
    if (!pendingAction) return;
    const { id, to } = pendingAction;
    setActionError(null);

    const { error } = await supabase.from('FileUpload').update({ state: to }).eq('id', id);

    if (error) {
      setActionError(`Could not update the report: ${error.message}`);
    } else {
      // The Console and Dashboard counts are cached; make them refetch.
      invalidateAdminSummary();
      setReports((prev) =>
        prev.map((r) => (String(r.id) === String(id) ? { ...r, state: to } : r))
      );
    }
    setPendingAction(null);
  };

  /**
   * Format a stored confidence, whichever scale it was written on.
   *
   * Legacy rows are inconsistent: one holds 0.751058 (a fraction), another
   * holds 92.1 (already a percentage). Multiplying blindly renders the second
   * as 9210%. Anything above 1 is therefore treated as already-scaled.
   *
   * New submissions always store the raw 0-1 detector score.
   */
  const formatConfidence = (value: number | null): string => {
    if (value == null || !Number.isFinite(value)) return 'N/A';
    const pct = value > 1 ? value : value * 100;
    return `${Math.min(pct, 100).toFixed(0)}%`;
  };

  const parseObservations = (value: unknown): string[] => {
    const toLine = (item: unknown): string => {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        if (o.label) {
          const metric =
            o.metric_value != null ? ` — ${Number(o.metric_value).toFixed(3)} ${o.unit ?? ''}` : '';
          const width = o.width_mm != null ? `, ${Number(o.width_mm).toFixed(1)} mm wide` : '';
          return `${o.label} (${o.severity ?? 'Unknown'})${metric}${width}`;
        }
        return JSON.stringify(item);
      }
      return String(item);
    };

    if (Array.isArray(value)) return value.map(toLine);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(toLine) : [value];
      } catch {
        return [value];
      }
    }
    return ['No detailed observations available.'];
  };

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return reports;

    return reports.filter((report) =>
      [report.id, report.address, report.severity, report.damage_type, report.state]
        .map((field) => String(field ?? '').toLowerCase())
        .some((field) => field.includes(query))
    );
  }, [reports, searchQuery]);

  const unresolved = useMemo(() => filtered.filter((r) => r.state !== 'Resolved'), [filtered]);
  const resolved = useMemo(() => filtered.filter((r) => r.state === 'Resolved'), [filtered]);

  // A resolve, reopen or search can shrink a column below the page it is on.
  const needsPageShown = Math.min(needsPage, lastPage(unresolved.length));
  const resolvedPageShown = Math.min(resolvedPage, lastPage(resolved.length));
  const needsVisible = unresolved.slice((needsPageShown - 1) * PAGE_SIZE, needsPageShown * PAGE_SIZE);
  const resolvedVisible = resolved.slice(
    (resolvedPageShown - 1) * PAGE_SIZE,
    resolvedPageShown * PAGE_SIZE
  );
  const isResolvedView = view === 'resolved';
  const shown = isResolvedView ? resolvedVisible : needsVisible;
  // A stable key, so the detail fetch runs when the cards change, not every render.
  const visibleKey = shown.map((r) => String(r.id)).join(',');

  // Details and filers for the cards on screen only, at most 5 rows.
  useEffect(() => {
    const ids = visibleKey ? visibleKey.split(',') : [];
    const missing = ids.filter((id) => !(id in details));
    const people = [
      ...new Set(
        reports
          .filter((r) => ids.includes(String(r.id)) && r.userid && !(r.userid in filers))
          .map((r) => r.userid as string)
      ),
    ];
    if (!missing.length && !people.length) return;
    let cancelled = false;
    (async () => {
      if (missing.length) {
        const { data } = await supabase.from('FileUpload').select(DETAIL_COLUMNS).in('id', missing);
        if (!cancelled && data) {
          setDetails((prev) => ({
            ...prev,
            ...Object.fromEntries(data.map(({ id, ...rest }) => [String(id), rest as Detail])),
          }));
        }
      }
      if (people.length) {
        const { data } = await supabase
          .from('UserDetail')
          .select('userloginuuid, username, user_type')
          .in('userloginuuid', people);
        if (!cancelled && data) {
          setFilers((prev) => ({
            ...prev,
            ...Object.fromEntries(
              data.map((p) => [p.userloginuuid, { username: p.username, user_type: p.user_type }])
            ),
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // details and filers are caches read only to skip what is already loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, reports]);

  // The photo of the open card, fetched once.
  useEffect(() => {
    if (!expandedId || expandedId in images) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('FileUpload')
        .select('image_url')
        .eq('id', expandedId)
        .maybeSingle();
      if (!cancelled) setImages((prev) => ({ ...prev, [expandedId]: data?.image_url ?? null }));
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedId, images]);

  const renderCard = (row: IndexRow, isResolvedColumn: boolean) => {
    const report: Report = { ...details[String(row.id)], ...row };
    const isOpen = expandedId === String(report.id);
    const image = images[String(report.id)];
    const observations = parseObservations(report.observation_details);

    return (
      <article
        key={report.id}
        className="bg-surface border border-line rounded-panel p-5 sm:p-6 shadow-xl text-fg"
      >
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg truncate">
                RPT-{String(report.id).slice(0, 8).toUpperCase()}
              </h3>
              {/* The admin's verdict leads where one exists; the system's
                  original is shown struck through beside it, never replaced. */}
              <SeverityBadge
                severity={report.corrected_severity ?? report.severity}
                tone="light"
              />
              {report.corrected_severity && (
                <span className="text-[10px] font-bold text-fg-muted uppercase tracking-wide">
                  corrected · was {report.severity}
                </span>
              )}
            </div>
            <p className="font-bold text-sm text-fg">
              {report.corrected_damage_type ?? report.damage_type ?? 'Unclassified'}
              {report.corrected_damage_type && (
                <span className="font-normal text-fg-muted">
                  {' '}
                  (system: {report.damage_type})
                </span>
              )}
            </p>
            <p className="text-fg-muted font-bold text-xs mt-0.5 break-words">
              {report.address || 'Location unknown'}
              {report.uploadtime && ` · ${new Date(report.uploadtime).toLocaleDateString('en-GB')}`}
            </p>
            <Coordinates lat={report.lat} lng={report.lng} tone="light" className="mt-0.5" />
            {report.userid && (
              <p className="text-fg-muted text-xs mt-0.5">
                Filed by{' '}
                <span className="font-bold text-fg">
                  {filers[report.userid]?.username ?? 'Unknown user'}
                </span>
                {filers[report.userid]?.user_type && ` · ${filers[report.userid]?.user_type}`}
              </p>
            )}
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => trackReport(report)}
              disabled={report.lat == null || report.lng == null}
              title={report.lat == null || report.lng == null ? 'This report has no coordinates' : undefined}
              className={`px-5 py-2 rounded-full font-bold text-xs transition-all border shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                tracked?.id === String(report.id)
                  ? 'bg-blue-50 border-oasys-blue text-blue-700'
                  : 'border-line text-fg hover:bg-inset'
              }`}
            >
              Track report
            </button>
            <button
              onClick={() => setExpandedId(isOpen ? null : String(report.id))}
              aria-expanded={isOpen}
              className={`px-6 py-2 rounded-full font-bold text-xs transition-all shadow shrink-0 ${
                isOpen
                  ? 'bg-inset text-fg hover:bg-inset'
                  : 'bg-oasys-blue text-accent-fg hover:bg-blue-600'
              }`}
            >
              {isOpen ? 'Close' : 'Review'}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="border-t border-line pt-5 mt-5 flex flex-col lg:flex-row gap-5">
            <div className="w-full lg:w-1/2 flex flex-col gap-2">
              <div className="w-full aspect-video bg-black rounded-xl overflow-hidden">
                {image === undefined ? (
                  <p className="w-full h-full flex items-center justify-center text-fg-muted text-sm font-bold animate-pulse">
                    Loading image…
                  </p>
                ) : image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- base64 data URL from the API
                  <img
                    src={image}
                    alt={`Analysed road image for report ${report.id}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <p className="w-full h-full flex items-center justify-center text-fg-muted text-sm font-bold">
                    No image
                  </p>
                )}
              </div>
              <div className="flex justify-between items-center text-xs gap-3">
                <span className="font-semibold text-fg truncate" title={report.file_name ?? ''}>
                  {report.file_name || 'unknown file'}
                </span>
                <span className="whitespace-nowrap shrink-0">
                  <span className="font-bold text-fg-muted">Confidence </span>
                  <span className="text-blue-700 font-semibold">
                    {formatConfidence(report.confidence ?? null)}
                  </span>
                </span>
              </div>
              {report.crack_density_pct != null && (
                <p className="text-xs font-bold text-fg-muted">
                  Distress density: {report.crack_density_pct.toFixed(2)}%
                </p>
              )}
            </div>

            <div className="w-full lg:w-1/2 flex flex-col">
              <h4 className="text-xs font-semibold mb-1 uppercase tracking-wider">
                Maintenance bulletin
              </h4>
              <p className="text-xs leading-relaxed mb-4 text-fg-muted whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                {report.detection_details || 'No bulletin recorded.'}
              </p>

              <div className="bg-inset p-3 rounded-xl border border-line mb-4">
                <h4 className="font-semibold text-[10px] mb-2 text-blue-700 uppercase tracking-widest">
                  Detected distresses
                </h4>
                <ul className="text-[11px] space-y-1 list-disc list-inside font-medium text-fg">
                  {observations.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto flex flex-wrap justify-between items-end gap-3 pt-2 border-t border-line">
                <div>
                  <p className="text-[10px] font-bold uppercase text-fg-muted mb-1">
                    Current state
                  </p>
                  <span
                    className={`text-[10px] px-2 py-1 rounded font-semibold uppercase tracking-wider ${
                      isResolvedColumn
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {report.state || 'Needs Action'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Resolving says the report was right and the work is done.
                      Fixing says something in it is wrong. They are different
                      judgements, so they are different buttons -- and the fix
                      is the quieter of the two, because most reports need it. */}
                  <button
                    onClick={() => setFixing(report)}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs transition-colors border border-line text-fg hover:bg-inset hover:border-line"
                  >
                    Fix report
                  </button>

                  <button
                    onClick={() =>
                      setPendingAction({
                        id: String(report.id),
                        to: isResolvedColumn ? 'Needs Action' : 'Resolved',
                      })
                    }
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow ${
                      isResolvedColumn
                        ? 'bg-fg text-bg hover:bg-fg-soft'
                        : 'bg-[#15803d] text-white hover:bg-[#166534]'
                    }`}
                  >
                    {isResolvedColumn ? 'Reopen report' : 'Mark resolved'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="min-h-screen">
      <header className="bg-header-gradient text-white rounded-b-[50px] px-4 sm:px-12 pt-8 md:pt-12 pb-12 shadow-[0_24px_70px_-24px_rgba(59,130,246,0.30)]">
        <div className="max-w-7xl mx-auto flex justify-between items-end gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold mb-2">Reports</h1>
            <p className="text-oasys-blue text-sm font-bold uppercase tracking-widest">
              Master database
            </p>
          </div>
          <Link
            href="/admin/dashboard"
            className="text-fg-muted hover:text-fg font-bold text-sm transition-colors shrink-0"
          >
            &larr; Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-12 mt-8 pb-20">
        {loadError && (
          <div
            role="alert"
            className="bg-danger/10 border border-danger/40 text-danger rounded-panel p-5 mb-6"
          >
            <p className="font-bold mb-1">Could not load reports</p>
            <p className="text-sm">{loadError}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <label className="sr-only" htmlFor="search">
            Search reports
          </label>
          <input
            id="search"
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setNeedsPage(1);
              setResolvedPage(1);
            }}
            placeholder="Search by location, severity, distress type or ID…"
            className="off-brand grow bg-surface rounded-full px-6 py-3.5 text-fg font-semibold shadow-lg focus:outline-none focus:ring-4 focus:ring-oasys-blue/50 placeholder:text-fg-faint"
          />
          <button
            onClick={() => setShowMap((open) => !open)}
            aria-expanded={showMap}
            className="bg-fg/5 hover:bg-fg/10 text-fg border border-line-strong px-6 py-3.5 rounded-full font-bold text-sm transition-colors shrink-0"
          >
            {showMap ? 'Hide map' : 'Show map'}
          </button>
        </div>

        {showMap && (
          <section
            ref={mapRef}
            className="bg-panel-gradient rounded-panel p-4 sm:p-6 border border-line mb-6 scroll-mt-28"
          >
            <h2 className="font-bold text-sm text-fg-muted mb-4">
              Defect locations{' '}
              <span className="text-fg-muted">
                ({filtered.filter((r) => r.lat != null).length} mapped)
              </span>
            </h2>
            {!isLoading && (
              <ReportsMap
                reports={filtered}
                trackedId={tracked?.id ?? null}
                trackNonce={tracked?.nonce ?? 0}
              />
            )}
          </section>
        )}

        {isLoading && (
          <p className="text-center text-fg font-bold py-10 text-lg">
            Loading database records…
          </p>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="bg-fg/10 rounded-panel p-10 text-center border border-line-strong">
            <h2 className="text-fg text-xl font-semibold mb-2">No reports found</h2>
            <p className="text-fg-muted font-bold">
              {reports.length === 0
                ? 'Nothing has been submitted yet.'
                : 'Try adjusting your search terms.'}
            </p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <section className="flex flex-col gap-5">
            <div
              role="group"
              aria-label="Report queue"
              className="flex w-full sm:w-max gap-6 border-b border-line"
            >
              {(
                [
                  { key: 'needs', label: 'Needs action', count: unresolved.length, dot: 'bg-sev-medium' },
                  { key: 'resolved', label: 'Resolved', count: resolved.length, dot: 'bg-sev-low' },
                ] as const
              ).map((tab) => {
                const active = view === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setView(tab.key)}
                    className={`relative flex-1 sm:flex-none flex items-center justify-center gap-2.5 pb-3 text-sm uppercase tracking-widest transition-colors after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent after:origin-left after:transition-transform after:duration-300 ${
                      active ? 'font-bold text-fg after:scale-x-100' : 'font-semibold text-fg-muted hover:text-fg after:scale-x-0'
                    }`}
                  >
                    <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${tab.dot}`} />
                    {tab.label}
                    <span className="tabular-nums text-fg-muted">
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {shown.length === 0 ? (
              <p className="text-fg-soft font-medium px-1 italic">
                {isResolvedView ? 'No resolved reports.' : 'All caught up — nothing pending.'}
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                {shown.map((report) => renderCard(report, isResolvedView))}
              </div>
            )}
            <Pagination
              key={view}
              page={isResolvedView ? resolvedPageShown : needsPageShown}
              total={isResolvedView ? resolved.length : unresolved.length}
              onChange={isResolvedView ? setResolvedPage : setNeedsPage}
              label={isResolvedView ? 'Resolved' : 'Needs action'}
            />
          </section>
        )}
      </div>

      {pendingAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div className="bg-surface rounded-panel p-7 max-w-sm w-full shadow-2xl">
            <h2 id="confirm-title" className="text-xl font-semibold text-fg mb-2">
              {pendingAction.to === 'Resolved' ? 'Resolve report?' : 'Reopen report?'}
            </h2>
            <p className="text-fg-muted font-medium text-sm mb-7">
              {pendingAction.to === 'Resolved'
                ? 'This moves the report to the resolved queue.'
                : 'This moves the report back to the Needs Action queue.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingAction(null)}
                className="flex-1 bg-inset text-fg py-3 rounded-xl font-bold text-sm hover:bg-inset transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyStateChange}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors ${
                  pendingAction.to === 'Resolved'
                    ? 'bg-[#15803d] text-white hover:bg-[#166534]'
                    : 'bg-fg text-bg hover:bg-fg-soft'
                }`}
              >
                {pendingAction.to === 'Resolved' ? 'Resolve' : 'Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {fixing && (
        <FixReportModal
          report={fixing as FixableReport}
          onClose={() => setFixing(null)}
          onSaved={(patch) => {
            invalidateAdminSummary();
            setReports((prev) =>
              prev.map((r) => (String(r.id) === String(fixing.id) ? { ...r, ...patch } : r))
            );
          }}
        />
      )}

      {actionError && (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-danger/10 border border-danger/40 text-danger px-5 py-3 rounded-xl shadow-2xl max-w-md"
        >
          <p className="text-sm font-bold">{actionError}</p>
          <button
            onClick={() => setActionError(null)}
            className="text-xs underline mt-1 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

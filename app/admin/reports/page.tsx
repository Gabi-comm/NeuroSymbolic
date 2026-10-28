'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/utils/supabase';
import { SEVERITY, SeverityBadge, StatusLabel, toSeverity, type Severity } from '@/components/Severity';
import type { MapReport } from '@/components/ReportsMap';
import FixReportModal, { type FixableReport } from '@/components/FixReportModal';
import Coordinates from '@/components/Coordinates';
import { invalidateAdminSummary } from '@/utils/adminData';
import Pagination, { PAGE_SIZE, lastPage } from '@/components/Pagination';
import { AdminHeader, ConfirmDialog, ErrorNote, PAGE, Toast, UnderlineTabs } from '@/components/admin/ui';
import { IconSearch } from '@/components/shell/icons';

const ReportsMap = dynamic(() => import('@/components/ReportsMap'), {
  ssr: false,
  loading: () => <div className="skeleton w-full h-[24rem] sm:h-[32rem] rounded-2xl" />,
});

// Every report, without its photo or bulletin. A row is a few hundred bytes,
// so the map can still show every defect and search still covers everything.
// image_url is a base64 data URL; selecting it for every row was what made
// this page slow.
const INDEX_COLUMNS =
  'id, lat, lng, damage_type, severity, state, address, uploadtime, userid, corrected_damage_type, corrected_severity, correction_note';
// The rest of a card, fetched only for the cards on the current pages.
const DETAIL_COLUMNS = 'id, file_name, confidence, detection_details, observation_details, crack_density_pct, corrected_at';

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
    requestAnimationFrame(() => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
        const { data, error } = await supabase.from('FileUpload').select(INDEX_COLUMNS).order('uploadtime', { ascending: false });

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
      setReports((prev) => prev.map((r) => (String(r.id) === String(id) ? { ...r, state: to } : r)));
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
          const metric = o.metric_value != null ? ` — ${Number(o.metric_value).toFixed(3)} ${o.unit ?? ''}` : '';
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
        .some((field) => field.includes(query)),
    );
  }, [reports, searchQuery]);

  const unresolved = useMemo(() => filtered.filter((r) => r.state !== 'Resolved'), [filtered]);
  const resolved = useMemo(() => filtered.filter((r) => r.state === 'Resolved'), [filtered]);

  // A resolve, reopen or search can shrink a column below the page it is on.
  const needsPageShown = Math.min(needsPage, lastPage(unresolved.length));
  const resolvedPageShown = Math.min(resolvedPage, lastPage(resolved.length));
  const needsVisible = unresolved.slice((needsPageShown - 1) * PAGE_SIZE, needsPageShown * PAGE_SIZE);
  const resolvedVisible = resolved.slice((resolvedPageShown - 1) * PAGE_SIZE, resolvedPageShown * PAGE_SIZE);
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
        reports.filter((r) => ids.includes(String(r.id)) && r.userid && !(r.userid in filers)).map((r) => r.userid as string),
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
            ...Object.fromEntries(data.map((p) => [p.userloginuuid, { username: p.username, user_type: p.user_type }])),
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
      const { data } = await supabase.from('FileUpload').select('image_url').eq('id', expandedId).maybeSingle();
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
    const sev = toSeverity(report.corrected_severity ?? report.severity);
    const isTracked = tracked?.id === String(report.id);
    const noCoords = report.lat == null || report.lng == null;
    const confidencePct =
      report.confidence == null || !Number.isFinite(report.confidence)
        ? null
        : Math.min(report.confidence > 1 ? report.confidence : report.confidence * 100, 100);

    return (
      <article
        key={report.id}
        className={`relative overflow-hidden rounded-2xl border bg-surface transition-colors ${
          isOpen ? 'border-line-strong shadow-lg' : 'border-line hover:border-line-strong'
        }`}
      >
        {/* Severity edge: colour beside the badge's shape and word, never colour alone. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: sev ? SEV_COLOR[sev] : 'var(--line-strong)' }}
        />

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 pl-5 sm:p-5 sm:pl-6">
          <div className="min-w-0 grow">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold text-fg">
                {report.corrected_damage_type ?? report.damage_type ?? 'Unclassified'}
              </h3>
              {/* The admin's verdict leads where one exists; the system's
                  original is shown beside it, never replaced. */}
              <SeverityBadge severity={report.corrected_severity ?? report.severity} />
              {report.corrected_severity && (
                <span className="text-[11px] font-medium text-accent">corrected · was {report.severity}</span>
              )}
              {report.corrected_damage_type && (
                <span className="text-[11px] font-medium text-fg-muted">system: {report.damage_type}</span>
              )}
            </div>
            <p className="mt-1 text-sm text-fg-muted break-words">{report.address || 'Location unknown'}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-faint">
              <span className="font-mono">RPT-{String(report.id).slice(0, 8).toUpperCase()}</span>
              {report.uploadtime && (
                <span>
                  {new Date(report.uploadtime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
              {report.userid && (
                <span>
                  by <span className="font-semibold text-fg-muted">{filers[report.userid]?.username ?? 'Unknown user'}</span>
                  {filers[report.userid]?.user_type && ` · ${filers[report.userid]?.user_type}`}
                </span>
              )}
              <Coordinates lat={report.lat} lng={report.lng} />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => trackReport(report)}
              disabled={noCoords}
              title={noCoords ? 'This report has no coordinates' : 'Show on the map'}
              aria-pressed={isTracked}
              className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isTracked ? 'border-accent text-accent' : 'border-line text-fg hover:border-line-strong'
              }`}
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
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
              </svg>
              Track
            </button>
            <button
              onClick={() => setExpandedId(isOpen ? null : String(report.id))}
              aria-expanded={isOpen}
              className={`h-10 px-5 rounded-xl text-sm font-semibold transition-colors ${
                isOpen ? 'border border-line text-fg hover:border-line-strong' : 'btn-blue'
              }`}
            >
              {isOpen ? 'Close' : 'Review'}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="pop-in border-t border-line p-4 pl-5 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col gap-4">
              <div className="w-full aspect-video rounded-xl overflow-hidden bg-inset border border-line">
                {image === undefined ? (
                  <div className="skeleton w-full h-full" />
                ) : image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- base64 data URL from the API
                  <img src={image} alt={`Analysed road image for report ${report.id}`} className="w-full h-full object-contain" />
                ) : (
                  <p className="w-full h-full grid place-items-center text-sm text-fg-muted">No image</p>
                )}
              </div>
              <p className="text-xs text-fg-faint truncate" title={report.file_name ?? ''}>
                {report.file_name || 'unknown file'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Meter label="Detector confidence" value={confidencePct} text={formatConfidence(report.confidence ?? null)} />
                <Meter
                  label="Crack density"
                  // Densities run a few percent, so 10 % fills the bar.
                  value={report.crack_density_pct == null ? null : Math.min(report.crack_density_pct * 10, 100)}
                  text={report.crack_density_pct == null ? 'N/A' : `${report.crack_density_pct.toFixed(2)}%`}
                  color={sev ? SEV_COLOR[sev] : undefined}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 min-w-0">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted mb-2">Detected distresses</h4>
                <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
                  {observations.map((line, idx) => (
                    <li key={idx} className="px-3 py-2 text-sm text-fg">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted mb-2">Maintenance bulletin</h4>
                <p className="rounded-xl bg-inset border border-line p-3 text-[13px] leading-relaxed text-fg-soft whitespace-pre-wrap max-h-56 overflow-y-auto custom-scrollbar">
                  {report.detection_details || 'No bulletin recorded.'}
                </p>
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line">
                <StatusLabel state={report.state} />
                <div className="flex flex-wrap gap-2">
                  {/* Resolving says the report was right and the work is done.
                      Fixing says something in it is wrong. They are different
                      judgements, so they are different buttons -- and the fix
                      is the quieter of the two. */}
                  <button
                    onClick={() => setFixing(report)}
                    className="h-10 px-4 rounded-xl border border-line text-sm font-semibold text-fg hover:border-line-strong"
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
                    className={`h-10 px-4 rounded-xl text-sm font-semibold transition ${
                      isResolvedColumn ? 'bg-fg text-bg hover:opacity-90' : 'bg-ok text-white hover:brightness-110'
                    }`}
                  >
                    {isResolvedColumn ? 'Reopen' : 'Mark resolved'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </article>
    );
  };

  const queueSev: Record<Severity, number> = { High: 0, Medium: 0, Low: 0 };
  for (const r of isResolvedView ? resolved : unresolved) {
    const s = toSeverity(r.corrected_severity ?? r.severity);
    if (s) queueSev[s] += 1;
  }
  const mapped = filtered.filter((r) => r.lat != null).length;

  return (
    <main className={PAGE}>
      <AdminHeader eyebrow="Admin" title="Reports">
        <button
          onClick={() => setShowMap((open) => !open)}
          aria-expanded={showMap}
          className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-line bg-surface text-sm font-semibold text-fg hover:border-line-strong"
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
            <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
            <path d="M9 3v15m6-12v15" />
          </svg>
          {showMap ? 'Hide map' : 'Show map'}
        </button>
      </AdminHeader>

      {loadError && <ErrorNote title="Could not load reports" message={loadError} />}

      <div className="page-enter relative mb-4">
        <label className="sr-only" htmlFor="search">
          Search reports
        </label>
        <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-fg-faint" />
        <input
          id="search"
          type="search"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setNeedsPage(1);
            setResolvedPage(1);
          }}
          placeholder="Search location, severity, distress type or ID"
          className="w-full h-12 rounded-xl border border-line bg-surface pl-11 pr-4 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
      </div>

      {showMap && (
        <section ref={mapRef} className="page-enter mb-4 scroll-mt-24 rounded-2xl bg-surface border border-line p-3 sm:p-4">
          <h2 className="px-1 mb-3 text-base font-semibold text-fg">
            Map <span className="ml-1 text-sm font-normal text-fg-muted">{mapped} mapped</span>
          </h2>
          {!isLoading && (
            <ReportsMap
              reports={filtered}
              trackedId={tracked?.id ?? null}
              trackNonce={tracked?.nonce ?? 0}
              heightClass="h-[24rem] sm:h-[32rem]"
            />
          )}
        </section>
      )}

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center">
          <IconSearch className="mx-auto w-8 h-8 text-fg-faint" />
          <h2 className="mt-3 text-lg font-semibold text-fg">No reports found</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {reports.length === 0 ? 'Nothing has been submitted yet.' : 'Try another search.'}
          </p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <UnderlineTabs
              label="Report queue"
              value={view}
              onChange={setView}
              tabs={[
                { key: 'needs', label: 'Needs action', count: unresolved.length },
                { key: 'resolved', label: 'Resolved', count: resolved.length },
              ]}
            />
            <ul className="flex gap-4 text-xs text-fg-muted" aria-label="Severity in this queue">
              {(['High', 'Medium', 'Low'] as Severity[]).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className={SEVERITY[s].text}>{SEVERITY[s].icon}</span>
                  {s}
                  <span className="font-stat text-sm text-fg">{queueSev[s]}</span>
                </li>
              ))}
            </ul>
          </div>

          {shown.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-fg-muted">
              {isResolvedView ? 'No resolved reports.' : 'All caught up, nothing pending.'}
            </p>
          ) : (
            <div className="stagger flex flex-col gap-3">{shown.map((report) => renderCard(report, isResolvedView))}</div>
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

      {pendingAction && (
        <ConfirmDialog
          title={pendingAction.to === 'Resolved' ? 'Resolve report?' : 'Reopen report?'}
          body={
            pendingAction.to === 'Resolved'
              ? 'This moves the report to the resolved queue.'
              : 'This moves the report back to the Needs action queue.'
          }
          confirm={pendingAction.to === 'Resolved' ? 'Resolve' : 'Reopen'}
          tone={pendingAction.to === 'Resolved' ? 'ok' : 'neutral'}
          onCancel={() => setPendingAction(null)}
          onConfirm={applyStateChange}
        />
      )}

      {fixing && (
        <FixReportModal
          report={fixing as FixableReport}
          onClose={() => setFixing(null)}
          onSaved={(patch) => {
            invalidateAdminSummary();
            setReports((prev) => prev.map((r) => (String(r.id) === String(fixing.id) ? { ...r, ...patch } : r)));
          }}
        />
      )}

      {actionError && <Toast message={actionError} onDismiss={() => setActionError(null)} />}
    </main>
  );
}

const SEV_COLOR: Record<Severity, string> = {
  High: 'var(--sev-high)',
  Medium: 'var(--sev-medium)',
  Low: 'var(--sev-low)',
};

/** A labelled 0-100 bar for one measurement. */
function Meter({
  label,
  value,
  text,
  color = 'var(--accent)',
}: {
  label: string;
  value: number | null;
  text: string;
  color?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-fg-muted">{label}</span>
        <span className="font-stat text-lg leading-none text-fg">{text}</span>
      </div>
      <div className="h-2 rounded-full bg-fg/[0.07] overflow-hidden">
        {value != null && (
          <div className="bar-grow h-full rounded-full" style={{ width: `${Math.max(value, 2)}%`, background: color }} />
        )}
      </div>
    </div>
  );
}

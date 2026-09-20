'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase } from '@/utils/supabase';
import { SeverityBadge } from '@/components/Severity';
import type { MapReport } from '@/components/ReportsMap';

const ReportsMap = dynamic(() => import('@/components/ReportsMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[22rem] sm:h-[30rem] rounded-2xl bg-zinc-800 flex items-center justify-center font-bold text-gray-400">
      Loading map…
    </div>
  ),
});

interface Report extends MapReport {
  uploadtime: string | null;
  image_url: string | null;
  file_name: string | null;
  confidence: number | null;
  detection_details: string | null;
  observation_details: unknown;
  crack_density_pct: number | null;
}

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMap, setShowMap] = useState(true);

  const [pendingAction, setPendingAction] = useState<{
    id: string;
    to: 'Resolved' | 'Needs Action';
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchReports = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('FileUpload')
          .select('*')
          .order('uploadtime', { ascending: false });

        if (error) throw error;
        if (isMounted) setReports(data ?? []);
      } catch (err) {
        if (isMounted) {
          setLoadError(err instanceof Error ? err.message : 'Could not load reports.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchReports();

    // Deep link from the dashboard's Review button: /admin/reports?report=<id>
    const target = new URLSearchParams(window.location.search).get('report');
    if (target) setExpandedId(target);

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

  const unresolved = filtered.filter((r) => r.state !== 'Resolved');
  const resolved = filtered.filter((r) => r.state === 'Resolved');

  const renderCard = (report: Report, isResolvedColumn: boolean) => {
    const isOpen = expandedId === String(report.id);
    const observations = parseObservations(report.observation_details);

    return (
      <article
        key={report.id}
        className="bg-white rounded-panel p-5 sm:p-6 shadow-xl text-black"
      >
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="font-black text-lg truncate">
                RPT-{String(report.id).slice(0, 8).toUpperCase()}
              </h3>
              <SeverityBadge severity={report.severity} tone="light" />
            </div>
            <p className="font-bold text-sm text-zinc-700">
              {report.damage_type || 'Unclassified'}
            </p>
            <p className="text-zinc-500 font-bold text-xs mt-0.5 break-words">
              {report.address || 'Location unknown'}
              {report.uploadtime && ` · ${new Date(report.uploadtime).toLocaleDateString('en-GB')}`}
            </p>
          </div>

          <button
            onClick={() => setExpandedId(isOpen ? null : String(report.id))}
            aria-expanded={isOpen}
            className={`px-6 py-2 rounded-full font-bold text-xs transition-all shadow shrink-0 ${
              isOpen
                ? 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                : 'bg-oasys-blue text-white hover:bg-blue-600'
            }`}
          >
            {isOpen ? 'Close' : 'Review'}
          </button>
        </div>

        {isOpen && (
          <div className="border-t border-gray-200 pt-5 mt-5 flex flex-col lg:flex-row gap-5">
            <div className="w-full lg:w-1/2 flex flex-col gap-2">
              <div className="w-full aspect-video bg-black rounded-xl overflow-hidden">
                {report.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- base64 data URL from the API
                  <img
                    src={report.image_url}
                    alt={`Analysed road image for report ${report.id}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <p className="w-full h-full flex items-center justify-center text-gray-500 text-sm font-bold">
                    No image
                  </p>
                )}
              </div>
              <div className="flex justify-between items-center text-xs gap-3">
                <span className="font-black text-zinc-800 truncate" title={report.file_name ?? ''}>
                  {report.file_name || 'unknown file'}
                </span>
                <span className="whitespace-nowrap shrink-0">
                  <span className="font-bold text-zinc-500">Confidence </span>
                  <span className="text-blue-700 font-black">
                    {formatConfidence(report.confidence)}
                  </span>
                </span>
              </div>
              {report.crack_density_pct != null && (
                <p className="text-xs font-bold text-zinc-600">
                  Crack density: {report.crack_density_pct.toFixed(2)}%
                </p>
              )}
            </div>

            <div className="w-full lg:w-1/2 flex flex-col">
              <h4 className="text-xs font-black mb-1 uppercase tracking-wider">
                Maintenance bulletin
              </h4>
              <p className="text-xs leading-relaxed mb-4 text-zinc-600 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                {report.detection_details || 'No bulletin recorded.'}
              </p>

              <div className="bg-zinc-100 p-3 rounded-xl border border-zinc-200 mb-4">
                <h4 className="font-black text-[10px] mb-2 text-blue-700 uppercase tracking-widest">
                  Detected distresses
                </h4>
                <ul className="text-[11px] space-y-1 list-disc list-inside font-medium text-zinc-700">
                  {observations.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto flex flex-wrap justify-between items-end gap-3 pt-2 border-t border-zinc-100">
                <div>
                  <p className="text-[10px] font-bold uppercase text-zinc-400 mb-1">
                    Current state
                  </p>
                  <span
                    className={`text-[10px] px-2 py-1 rounded font-black uppercase tracking-wider ${
                      isResolvedColumn
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {report.state || 'Needs Action'}
                  </span>
                </div>

                <button
                  onClick={() =>
                    setPendingAction({
                      id: String(report.id),
                      to: isResolvedColumn ? 'Needs Action' : 'Resolved',
                    })
                  }
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow ${
                    isResolvedColumn
                      ? 'bg-zinc-900 text-white hover:bg-black'
                      : 'bg-[#16a34a] text-white hover:bg-green-700'
                  }`}
                >
                  {isResolvedColumn ? 'Reopen report' : 'Mark resolved'}
                </button>
              </div>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-admin-bg">
      <header className="bg-header-gradient text-white rounded-b-[50px] px-4 sm:px-12 pt-28 sm:pt-32 pb-12 shadow-2xl">
        <div className="max-w-7xl mx-auto flex justify-between items-end gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2">Reports</h1>
            <p className="text-oasys-blue text-sm font-bold uppercase tracking-widest">
              Master database
            </p>
          </div>
          <Link
            href="/admin/dashboard"
            className="text-zinc-400 hover:text-white font-bold text-sm transition-colors shrink-0"
          >
            &larr; Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-12 mt-8 pb-20">
        {loadError && (
          <div
            role="alert"
            className="bg-red-950/80 border border-red-500/40 text-red-200 rounded-panel p-5 mb-6"
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
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by location, severity, damage type or ID…"
            className="grow bg-white rounded-full px-6 py-3.5 text-black font-bold shadow-lg focus:outline-none focus:ring-4 focus:ring-oasys-blue/50 placeholder-gray-400"
          />
          <button
            onClick={() => setShowMap((open) => !open)}
            aria-expanded={showMap}
            className="bg-zinc-900 text-white border border-white/15 px-6 py-3.5 rounded-full font-bold text-sm hover:bg-black transition-colors shrink-0"
          >
            {showMap ? 'Hide map' : 'Show map'}
          </button>
        </div>

        {showMap && (
          <section className="bg-zinc-900 rounded-panel p-4 sm:p-6 border border-white/10 mb-6">
            <h2 className="font-bold text-sm text-gray-400 mb-4">
              Defect locations{' '}
              <span className="text-gray-600">
                ({filtered.filter((r) => r.lat != null).length} mapped)
              </span>
            </h2>
            {!isLoading && <ReportsMap reports={filtered} />}
          </section>
        )}

        {isLoading && (
          <p className="text-center text-white font-bold py-10 text-lg">
            Loading database records…
          </p>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="bg-white/10 rounded-panel p-10 text-center border border-white/20">
            <h2 className="text-white text-xl font-black mb-2">No reports found</h2>
            <p className="text-gray-400 font-bold">
              {reports.length === 0
                ? 'Nothing has been submitted yet.'
                : 'Try adjusting your search terms.'}
            </p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <section className="flex flex-col gap-5">
              <h2 className="flex items-center gap-3 px-1 text-lg font-black text-white uppercase tracking-widest">
                <span aria-hidden="true" className="w-3 h-3 rounded-full bg-[#fbbf24]" />
                Needs action ({unresolved.length})
              </h2>
              {unresolved.length === 0 ? (
                <p className="text-zinc-300 font-medium px-1 italic">
                  All caught up — nothing pending.
                </p>
              ) : (
                unresolved.map((report) => renderCard(report, false))
              )}
            </section>

            <section className="flex flex-col gap-5">
              <h2 className="flex items-center gap-3 px-1 text-lg font-black text-white uppercase tracking-widest">
                <span aria-hidden="true" className="w-3 h-3 rounded-full bg-[#16a34a]" />
                Resolved ({resolved.length})
              </h2>
              {resolved.length === 0 ? (
                <p className="text-zinc-300 font-medium px-1 italic">No resolved reports.</p>
              ) : (
                resolved.map((report) => renderCard(report, true))
              )}
            </section>
          </div>
        )}
      </div>

      {pendingAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div className="bg-white rounded-panel p-7 max-w-sm w-full shadow-2xl">
            <h2 id="confirm-title" className="text-xl font-black text-black mb-2">
              {pendingAction.to === 'Resolved' ? 'Resolve report?' : 'Reopen report?'}
            </h2>
            <p className="text-zinc-600 font-medium text-sm mb-7">
              {pendingAction.to === 'Resolved'
                ? 'This moves the report to the resolved queue.'
                : 'This moves the report back to the Needs Action queue.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingAction(null)}
                className="flex-1 bg-zinc-200 text-black py-3 rounded-xl font-bold text-sm hover:bg-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyStateChange}
                className={`flex-1 text-white py-3 rounded-xl font-bold text-sm transition-colors ${
                  pendingAction.to === 'Resolved'
                    ? 'bg-[#16a34a] hover:bg-green-700'
                    : 'bg-zinc-900 hover:bg-black'
                }`}
              >
                {pendingAction.to === 'Resolved' ? 'Resolve' : 'Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-red-950 border border-red-500/50 text-red-100 px-5 py-3 rounded-xl shadow-2xl max-w-md"
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

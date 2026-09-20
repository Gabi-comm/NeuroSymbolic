'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import LoginModal from './LoginModal';
import { readPendingScan, clearPendingScan } from '@/utils/pendingScan';
import { getAcknowledgedGsd } from '@/utils/captureSettings';
import { SEVERITY, SEVERITY_RANK, toSeverity, type Severity } from './Severity';
import DistressCarousel from './DistressCarousel';

export interface Distress {
  label: string;
  type?: string;
  confidence: number;
  measurement_type: string;
  metric_value: number;
  unit: string;
  width_mm: number;
  /** Headline grade shown in the UI; carries the fuzzy result. */
  severity: Severity;
  // Symbolic component outputs. The parallel severities are the RQ3 dataset.
  severity_fuzzy?: Severity;
  severity_crisp?: Severity;
  severity_confidence?: Severity;
  /** The study's original 3/6 mm thresholds, kept for reproducing prior results. */
  severity_legacy_crisp?: Severity;
  /** The literal DPWH two-band verdict: Narrow / Wide (D.O. 120 s.2019). */
  severity_dpwh_nw?: 'Narrow' | 'Wide' | 'Not rated';
  severity_score?: number | null;
  rule_base?: 'linear' | 'area' | 'pothole-unstratified';
  crack_density_pct?: number;
  membership_trace?: Record<string, unknown>;
}

export interface AnalysisData {
  filename: string;
  fileUrl: string;
  overall_severity: Severity;
  gemini_bulletin: string;
  distresses: Distress[];
  gsd_mm_px?: number;
  crack_density_pct?: number;
  ipm_applied?: boolean;
  privacy_blur_applied?: boolean;
}

interface UploadResultUiProps {
  backLinkHref: string;
  analysisData?: AnalysisData;
}

export default function UploadResultUi({ backLinkHref, analysisData }: UploadResultUiProps) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [location, setLocation] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });
  const [address, setAddress] = useState<string>('Loading…');

  const [data, setData] = useState<AnalysisData | null>(analysisData || null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchReason, setFetchReason] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'done' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlAddress = params.get('address');
      const urlLat = params.get('lat');
      const urlLng = params.get('lng');

      setAddress(urlAddress ?? 'Location not provided (quick scan)');
      if (urlLat && urlLng) {
        setLocation({ lat: parseFloat(urlLat), lng: parseFloat(urlLng) });
      }
    }

    const checkAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) throw error;
        setIsSignedIn(!!session);
      } catch {
        setIsSignedIn(false);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();

    // Run the analysis via the Next.js route handler. Never call the Python host
    // directly from the browser: a hardcoded localhost only works in dev.
    const fetchAiData = async () => {
      if (analysisData) return;

      const pending = readPendingScan();
      if (!pending) {
        setFetchError('No image found to analyze. Please upload one again.');
        return;
      }

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: pending.image,
            // Scale the inspector set on the capture-guidelines screen.
            gsd_mm_px: getAcknowledgedGsd(),
          }),
        });

        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          setFetchReason(detail.reason ?? null);
          throw new Error(detail.error || 'Failed to process image.');
        }

        const result = await response.json();

        setData({
          filename: pending.filename,
          fileUrl: result.fileUrl,
          overall_severity: result.overall_severity,
          gemini_bulletin: result.gemini_bulletin,
          distresses: result.distresses,
          gsd_mm_px: result.gsd_mm_px,
          crack_density_pct: result.crack_density_pct,
          ipm_applied: result.ipm_applied,
          privacy_blur_applied: result.privacy_blur_applied,
        });
        clearPendingScan();
      } catch (error) {
        setFetchError(
          error instanceof Error ? error.message : 'Could not analyze this image.'
        );
      }
    };

    fetchAiData();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(!!session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [analysisData]);

  /** The detection that drives the overall grade: worst severity, then confidence. */
  const primaryDistress = (distresses: Distress[]): Distress | null => {
    if (!distresses.length) return null;
    return [...distresses].sort(
      (a, b) =>
        (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0) ||
        b.confidence - a.confidence
    )[0];
  };

  // Writes to "FileUpload" -- the table named in the ERD and the only one the
  // admin screens read. This previously inserted into "damage_reports", which
  // nothing reads, so submitted reports never reached an administrator.
  const handleSubmitReport = async () => {
    if (!isSignedIn || !data) return;
    setIsSubmitting(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        throw new Error('You are not signed in. Please sign in again.');
      }

      const primary = primaryDistress(data.distresses);

      const { error: insertError } = await supabase.from('FileUpload').insert([
        {
          userid: userData.user.id,
          damage_type: primary?.label ?? 'No damage detected',
          severity: data.overall_severity,
          state: 'Needs Action',
          uploadtime: new Date().toISOString(),
          address: address.startsWith('Location not provided') ? null : address,
          // The columns are lat/lng, not latitude/longitude.
          lat: location.lat,
          lng: location.lng,
          image_url: data.fileUrl,
          file_name: data.filename,
          // confidence is a real (float4), not text. Stored as the raw 0-1
          // detector score so it can be aggregated; the UI formats it.
          confidence: primary?.confidence ?? null,
          detection_details: data.gemini_bulletin,
          observation_details: data.distresses,
          gsd_mm_px: data.gsd_mm_px ?? null,
          crack_density_pct: data.crack_density_pct ?? null,
          severity_fuzzy: primary?.severity_fuzzy ?? null,
          severity_crisp: primary?.severity_crisp ?? null,
          severity_confidence: primary?.severity_confidence ?? null,
          severity_dpwh_nw: primary?.severity_dpwh_nw ?? null,
          membership_trace: primary?.membership_trace ?? null,
        },
      ]);

      if (insertError) throw new Error(insertError.message);
      setSubmitState('done');
    } catch (error) {
      setSubmitState('error');
      setSubmitMessage(error instanceof Error ? error.message : 'Unknown error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (fetchError) {
    const noRoad = fetchReason === 'no_road_detected';

    return (
      <div className="pt-28 sm:pt-32 px-4 min-h-screen bg-panel-bg flex flex-col items-center justify-center text-center gap-7">
        <div
          aria-hidden="true"
          className={`w-16 h-16 rounded-full flex items-center justify-center ${
            noRoad ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
          }`}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            {noRoad ? (
              <>
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </>
            )}
          </svg>
        </div>

        <div className="max-w-md">
          <h1 className="text-2xl font-bold text-white mb-3">
            {noRoad ? 'No road surface detected' : 'Analysis failed'}
          </h1>
          <p className="text-gray-400 leading-relaxed">{fetchError}</p>
        </div>

        {noRoad && (
          <ul className="text-sm text-gray-400 text-left bg-black/25 border border-white/5 rounded-2xl p-5 max-w-md flex flex-col gap-2">
            <li>• Point the camera down at the pavement, not along the street</li>
            <li>• Stand about 2 m back, at chest height</li>
            <li>• Keep vehicles, people and deep shadow out of the frame</li>
            <li>• Shoot in daylight, on a clear, unobstructed surface</li>
          </ul>
        )}

        <Link href={backLinkHref} className="btn-blue px-8 py-3.5">
          Try another image
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="pt-28 sm:pt-32 px-4 min-h-screen bg-panel-bg flex items-center justify-center"
        aria-live="polite"
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 border-4 border-oasys-blue border-t-transparent rounded-full animate-spin mb-6" />
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Analyzing road damage
          </h1>
          <p className="text-gray-400">This usually takes 20–30 seconds.</p>
        </div>
      </div>
    );
  }

  const primary = primaryDistress(data.distresses);
  const severityKey = toSeverity(data.overall_severity);
  const accent = severityKey ? SEVERITY[severityKey] : null;

  return (
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen bg-dark-bg text-white">
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      <div className="max-w-6xl mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-oasys-blue font-bold text-sm uppercase tracking-wider mb-1">
              Analysis complete
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight">
              Road damage report
            </h1>
          </div>
          <Link
            href={backLinkHref}
            aria-label="Back"
            className="p-2 rounded-full hover:bg-white/10 transition-all group shrink-0"
          >
            <svg className="h-6 w-6 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
        </div>

        {/* Verdict strip — the first thing an inspector needs: how bad is it. */}
        <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-7">
          <div className="flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8">
            <div className="flex items-center gap-4 min-w-0">
              <span
                aria-hidden="true"
                className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                  accent ? accent.solid : 'bg-white/10'
                }`}
              >
                <span className="scale-[1.9]">{accent?.icon}</span>
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-0.5">
                  Overall severity
                </p>
                <p className="text-3xl sm:text-4xl font-black leading-none">
                  {data.overall_severity}
                </p>
              </div>
            </div>

            <div className="hidden lg:block w-px self-stretch bg-white/10" />

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3 grow text-sm">
              <div>
                <dt className="text-xs text-gray-500 font-bold uppercase tracking-wide">Detections</dt>
                <dd className="font-black tabular-nums">{data.distresses.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 font-bold uppercase tracking-wide">Main defect</dt>
                <dd className="font-bold truncate" title={primary?.label}>
                  {primary?.label ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 font-bold uppercase tracking-wide">Crack extent</dt>
                <dd className="font-black tabular-nums">
                  {data.crack_density_pct?.toFixed(2) ?? '—'}%
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 font-bold uppercase tracking-wide">Scale</dt>
                <dd className="font-black tabular-nums">
                  {data.gsd_mm_px?.toFixed(3) ?? '—'} mm/px
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Evidence + detections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Annotated image gets two thirds: it is the evidence. */}
          <section className="lg:col-span-2 bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-black">Detected damage</h2>
              <p className="text-xs text-gray-500 font-bold truncate max-w-[14rem]" title={data.filename}>
                {data.filename}
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden bg-black border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.fileUrl}
                alt="Road image with detected damage outlined and crack centrelines traced"
                className="w-full h-auto max-h-[30rem] object-contain"
              />
            </div>

            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-500">
              <li><span className="inline-block w-3 h-0.5 bg-[#22c55e] align-middle mr-1.5" />Detection box</li>
              <li><span className="inline-block w-3 h-0.5 bg-[#ef4444] align-middle mr-1.5" />Traced centreline</li>
              <li>Perspective corrected: {data.ipm_applied ? 'yes' : 'no'}</li>
              <li>Privacy blur: {data.privacy_blur_applied ? 'applied' : 'off'}</li>
            </ul>
          </section>

          <div className="flex flex-col gap-5">
            <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-6">
              <h2 className="font-black mb-3">
                Findings{' '}
                <span className="text-xs font-bold text-gray-500">
                  ({data.distresses.length})
                </span>
              </h2>
              <DistressCarousel distresses={data.distresses} />
            </section>

            <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-6">
              <h2 className="font-black mb-2">Location</h2>
              <p className="text-sm text-gray-300 leading-snug break-words">
                <span aria-hidden="true">📍 </span>
                {address}
              </p>
            </section>
          </div>
        </div>

        {/* Bulletin */}
        <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-7">
          <h2 className="font-black mb-1">Maintenance bulletin</h2>
          <p className="text-xs text-gray-500 mb-4">
            Interventions and priority are resolved from engineering rules; the summary
            is written locally on this machine.
          </p>
          <div className="bg-black/30 border border-white/10 rounded-2xl p-5 whitespace-pre-wrap text-sm text-gray-200 leading-relaxed max-h-[26rem] overflow-y-auto custom-scrollbar">
            {data.gemini_bulletin}
          </div>
        </section>

        {/* Submit */}
        <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-black mb-0.5">Submit this report</h2>
            <p className="text-sm text-gray-400">
              {isSignedIn
                ? 'Sends the assessment to the admin review queue.'
                : 'Sign in to send this to the review queue.'}
            </p>
            <p aria-live="polite" className="text-xs font-bold mt-1.5">
              {submitState === 'error' && <span className="text-red-400">{submitMessage}</span>}
              {submitState === 'done' && (
                <span className="text-[#4ade80]">Sent to the admin review queue.</span>
              )}
            </p>
          </div>

          {isLoading ? (
            <p className="px-8 py-3.5 rounded-full bg-white/5 text-gray-500 font-bold text-sm animate-pulse text-center">
              Checking sign-in…
            </p>
          ) : isSignedIn ? (
            <button
              onClick={handleSubmitReport}
              disabled={isSubmitting || submitState === 'done'}
              className="btn-blue px-10 py-3.5 w-full sm:w-auto"
            >
              {submitState === 'done'
                ? 'Submitted ✓'
                : isSubmitting
                  ? 'Submitting…'
                  : 'Submit report'}
            </button>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="px-10 py-3.5 rounded-full font-bold bg-white/10 hover:bg-white/20 border border-white/15 transition-colors w-full sm:w-auto"
            >
              Sign in to submit
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

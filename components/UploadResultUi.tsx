'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import LoginModal from './LoginModal';
import { readPendingScan, clearPendingScan } from '@/utils/pendingScan';
import { getAcknowledgedGsd } from '@/utils/captureSettings';
import { SeverityBadge, SeverityMeter, SEVERITY_RANK, type Severity } from './Severity';

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

const panel = 'bg-surface-light rounded-2xl p-5 sm:p-6 text-black flex flex-col';

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
          latitude: location.lat,
          longitude: location.lng,
          image_url: data.fileUrl,
          file_name: data.filename,
          confidence: primary ? `${(primary.confidence * 100).toFixed(1)}%` : 'N/A',
          detection_details: data.gemini_bulletin,
          observation_details: data.distresses,
          gsd_mm_px: data.gsd_mm_px ?? null,
          crack_density_pct: data.crack_density_pct ?? null,
          severity_fuzzy: primary?.severity_fuzzy ?? null,
          severity_crisp: primary?.severity_crisp ?? null,
          severity_confidence: primary?.severity_confidence ?? null,
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
    return (
      <div className="pt-28 sm:pt-32 px-4 min-h-screen bg-panel-bg flex flex-col items-center justify-center text-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Analysis failed</h1>
          <p className="text-gray-400 max-w-md">{fetchError}</p>
        </div>
        <Link href={backLinkHref} className="btn-blue px-8 py-3">
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

  return (
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen bg-panel-bg text-white">
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-start gap-4 mb-6">
          <div>
            <p className="text-oasys-blue font-bold text-sm uppercase tracking-wider mb-1">
              Analysis results
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold">
              Road damage report
            </h1>
          </div>
          <Link
            href={backLinkHref}
            className="text-white hover:text-gray-300 transition shrink-0 p-2"
            aria-label="Back"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
        </div>

        {/* Ethics commitment, section 3.5: the assessment is advisory only. */}
        <div
          role="note"
          className="flex gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6"
        >
          <span aria-hidden="true" className="text-amber-400 font-black text-lg leading-none">
            !
          </span>
          <p className="text-sm text-amber-100/90 leading-snug">
            <strong className="font-bold">Preliminary assessment.</strong> This result is
            produced automatically from a single 2D image and must be validated by a
            licensed Civil Engineer or DPWH official before repair resources are
            dispatched.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Image, location, detections */}
          <div className={panel}>
            <div className="flex items-center gap-2 mb-2">
              <span aria-hidden="true" className="text-sm">
                📄
              </span>
              <p className="text-sm font-bold text-zinc-600 truncate" title={data.filename}>
                {data.filename}
              </p>
            </div>

            <div className="bg-zinc-800 rounded-xl w-full aspect-video mb-4 overflow-hidden border border-gray-400">
              {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL from the API */}
              <img
                src={data.fileUrl}
                alt="Road image with detected damage outlined and crack centrelines traced"
                className="w-full h-full object-contain"
              />
            </div>

            <h2 className="text-base font-black uppercase mb-2">Location</h2>
            <p className="text-sm font-bold leading-snug text-zinc-800 bg-white/60 p-3 rounded-xl border border-white/40 mb-4 break-words">
              <span aria-hidden="true">📍 </span>
              {address}
            </p>

            <h2 className="text-base font-black uppercase mb-2 flex items-center gap-2">
              Detected damage
              <span className="text-xs bg-zinc-800 text-white px-2 py-0.5 rounded-full">
                {data.distresses.length}
              </span>
            </h2>

            <div className="grow overflow-y-auto custom-scrollbar max-h-72 lg:max-h-none">
              <ul className="flex flex-col gap-2">
                {data.distresses.map((distress, index) => (
                  <li
                    key={index}
                    className="flex justify-between items-center gap-3 bg-white/60 p-3 rounded-xl border border-white/40"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-zinc-900 truncate">
                        {distress.label}
                      </p>
                      <p className="text-xs text-zinc-600">
                        {distress.measurement_type}: {distress.metric_value?.toFixed(3)}{' '}
                        {distress.unit} · {distress.width_mm?.toFixed(1)} mm wide
                      </p>
                      <SeverityBadge severity={distress.severity} tone="light" className="mt-1.5" />
                    </div>
                    <span className="bg-zinc-800 text-white text-xs font-black px-2.5 py-1.5 rounded-lg shrink-0">
                      {(distress.confidence * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}

                {data.distresses.length === 0 && (
                  <li className="text-center p-4 text-zinc-500 font-bold italic">
                    No damage detected.
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Bulletin */}
          <div className={panel}>
            <h2 className="text-xl font-black mb-3">Maintenance bulletin</h2>
            <div className="bg-white/50 p-4 sm:p-5 rounded-xl grow overflow-y-auto custom-scrollbar whitespace-pre-wrap text-sm font-medium border border-white/20 max-h-[32rem] leading-relaxed">
              {data.gemini_bulletin}
            </div>
          </div>

          {/* Severity and submission */}
          <div className="flex flex-col gap-5">
            <div className={panel}>
              <h2 className="text-xl font-black mb-4">Overall severity</h2>

              <div className="flex flex-col items-center gap-4">
                <SeverityMeter severity={data.overall_severity} />

                <dl className="w-full text-xs font-bold text-zinc-700 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-zinc-300 pt-4">
                  <dt>Crack density</dt>
                  <dd className="text-right">
                    {data.crack_density_pct?.toFixed(2) ?? '—'}%
                  </dd>
                  <dt>Scale</dt>
                  <dd className="text-right">{data.gsd_mm_px?.toFixed(3) ?? '—'} mm/px</dd>
                  <dt>Perspective corrected</dt>
                  <dd className="text-right">{data.ipm_applied ? 'Yes' : 'No'}</dd>
                  <dt>Privacy blur</dt>
                  <dd className="text-right">
                    {data.privacy_blur_applied ? 'Applied' : 'Off'}
                  </dd>
                </dl>
              </div>
            </div>

            <div className={panel}>
              {isLoading ? (
                <p className="w-full bg-zinc-800 text-zinc-400 font-black rounded-full px-6 py-4 uppercase tracking-widest text-center text-sm animate-pulse">
                  Checking sign-in…
                </p>
              ) : isSignedIn ? (
                <>
                  <button
                    onClick={handleSubmitReport}
                    disabled={isSubmitting || submitState === 'done'}
                    className="btn-blue w-full px-6 py-4 uppercase tracking-widest text-sm"
                  >
                    {submitState === 'done'
                      ? 'Report submitted ✓'
                      : isSubmitting
                        ? 'Submitting…'
                        : 'Submit report'}
                  </button>
                  <p aria-live="polite" className="mt-2 text-center text-xs font-bold">
                    {submitState === 'error' && (
                      <span className="text-red-700">{submitMessage}</span>
                    )}
                    {submitState === 'done' && (
                      <span className="text-green-800">Sent to the admin review queue.</span>
                    )}
                  </p>
                </>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  className="w-full bg-zinc-800 text-white font-black rounded-full px-6 py-4 uppercase tracking-widest text-sm hover:bg-black transition-all border border-white/10"
                >
                  Sign in to submit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

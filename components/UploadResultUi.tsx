'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';
import LoginModal from './LoginModal';
import { readPendingScan, clearPendingScan } from '@/utils/pendingScan';
import {
  savePendingAnalysis,
  readPendingAnalysis,
  clearPendingAnalysis,
  saveLastResult,
  readLastResult,
  type AnalysisData,
  type Distress,
  type Severity,
} from '@/utils/pendingAnalysis';

export type { AnalysisData, Distress, Severity };
import { savePipelineStages, useHasPipelineStages } from '@/utils/pipelineStages';
import { getAcknowledgedGsd } from '@/utils/captureSettings';
import { SEVERITY, SEVERITY_RANK, toSeverity } from './Severity';
import DistressCarousel from './DistressCarousel';

interface UploadResultUiProps {
  backLinkHref: string;
  analysisData?: AnalysisData;
  /**
   * 'scan'   — informational only. Figure 7.5 of the paper states a report
   *            "would not proceed without an attached image or an address",
   *            and a scan has no address, so it offers a route into the report
   *            flow instead of a submit button.
   * 'report' — came from /report-damage, so a location exists and the result
   *            can be submitted to the admin queue.
   */
  mode?: 'scan' | 'report';
}

export default function UploadResultUi({
  backLinkHref,
  analysisData,
  mode = 'report',
}: UploadResultUiProps) {
  const router = useRouter();
  const [isSignedIn, setIsSignedIn] = useState(false);
  // Captured from the session we already hold, so submitting never has to make
  // another auth call -- see the note in handleSubmitReport.
  const [userId, setUserId] = useState<string | null>(null);
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
  const hasStages = useHasPipelineStages();
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

    // No getSession() call here.
    //
    // supabase-js serialises auth operations through the Web Locks API, and
    // awaiting one in an effect that also registers onAuthStateChange can leave
    // the promise unsettled — which pinned this screen on "Checking sign-in…"
    // forever, with no way to submit.
    //
    // onAuthStateChange fires INITIAL_SESSION as soon as it subscribes, so the
    // subscription alone tells us everything, with no await to get stuck on.

    // Run the analysis via the Next.js route handler. Never call the Python host
    // directly from the browser: a hardcoded localhost only works in dev.
    const fetchAiData = async () => {
      if (analysisData) return;

      // Arriving from a scan: the analysis is already done. Re-running it would
      // cost another road pass, SAM segmentation and bulletin for a result we
      // already have.
      const carried = readPendingAnalysis();
      if (carried) {
        setData(carried);
        saveLastResult(window.location.pathname, carried);
        clearPendingAnalysis();
        clearPendingScan();
        return;
      }

      const pending = readPendingScan();
      if (!pending) {
        // Nothing new to analyse. Before giving up, check whether this screen
        // already produced a result -- that is what coming back from /process,
        // or the browser's back button, looks like from here.
        const previous = readLastResult(window.location.pathname);
        if (previous) {
          setData(previous.data);
          // Without this, leaving and returning would show the submit
          // button again and let the same report be filed twice.
          if (previous.submitted) setSubmitState('done');
          return;
        }
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

        const analysis: AnalysisData = {
          filename: pending.filename,
          fileUrl: result.fileUrl,
          overall_severity: result.overall_severity,
          gemini_bulletin: result.gemini_bulletin,
          distresses: result.distresses,
          gsd_mm_px: result.gsd_mm_px,
          crack_density_pct: result.crack_density_pct,
          ipm_applied: result.ipm_applied,
          privacy_blur_applied: result.privacy_blur_applied,
        };
        setData(analysis);
        // Kept so this screen can be returned to; the scan itself is cleared
        // below, so without this a revisit has nothing to render.
        saveLastResult(window.location.pathname, analysis);
        // Stored separately, and never blocking: /process is an explanation of
        // the result, not part of producing it. The current URL goes with it so
        // the walkthrough can return here exactly -- for a report that means
        // keeping the query string, which carries the pinned location.
        savePipelineStages(
          result.stages,
          window.location.pathname + window.location.search
        );
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
      setUserId(session?.user?.id ?? null);
      setIsLoading(false);
    });

    // Belt and braces: if the subscription never reports (a broken or blocked
    // storage adapter), fall back to signed-out rather than spinning.
    const authTimeout = setTimeout(() => setIsLoading(false), 5000);

    return () => {
      clearTimeout(authTimeout);
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

  /**
   * Discard this result and go back for a different image.
   *
   * The only way off this screen used to be the back arrow, which left the
   * stored scan in place; the next analysis could then pick up the previous
   * image. Clearing both stores makes "scan another" mean exactly that.
   */
  const handleScanAnother = () => {
    clearPendingAnalysis();
    clearPendingScan();
    router.push('/upload-media');
  };

  /**
   * Hand this analysis to the report flow so the user only has to drop a pin.
   *
   * If sessionStorage refuses the payload the report flow simply re-analyses,
   * which is slower but still correct — so the hop is never blocked.
   */
  const handleAddLocation = () => {
    if (data) savePendingAnalysis(data);
    router.push('/report-damage');
  };

  // Writes to "FileUpload" -- the table named in the ERD and the only one the
  // admin screens read. This previously inserted into "damage_reports", which
  // nothing reads, so submitted reports never reached an administrator.
  const handleSubmitReport = async () => {
    if (!isSignedIn || !data) return;
    setIsSubmitting(true);

    try {
      // Deliberately NOT calling supabase.auth.getUser() here.
      //
      // supabase-js serialises auth operations through the Web Locks API. This
      // component also holds an onAuthStateChange subscription, and calling an
      // auth method from a click handler while that subscription is active can
      // deadlock: the await never settles, the finally never runs, and the
      // button sits on "Submitting..." forever. That was the bug.
      //
      // The session was already read on mount and is kept current by the
      // subscription, so the id is right here for the taking.
      if (!userId) {
        throw new Error('You are not signed in. Please sign in again.');
      }

      const primary = primaryDistress(data.distresses);

      // A network request with no upper bound can hang indefinitely; a report
      // that fails loudly is far better than a button that spins forever.
      const insertPromise = supabase.from('FileUpload').insert([
        {
          userid: userId,
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

      const { error: insertError } = await Promise.race([
        insertPromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('The server did not respond. Please try again.')),
            30_000
          )
        ),
      ]);

      if (insertError) throw new Error(insertError.message);
      setSubmitState('done');
      saveLastResult(window.location.pathname, data, true);
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
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen text-white">
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

            {/* Fills the gap this column left under Location, and answers the
                question the annotated image provokes: a reader who is asked to
                trust a severity grade should be able to see how it was reached.

                Hidden when the frames are not in storage -- a quota failure, or
                a reload that lost them -- rather than offering a button that
                opens an empty page. */}
            {hasStages && (
              <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-6 flex flex-col grow">
                <h2 className="font-black mb-2">How does the detection work?</h2>
                <p className="text-sm text-gray-400 leading-snug mb-5">
                  This image passed through six steps, from finding the road surface
                  to tracing each crack. See what every stage did to your photo.
                </p>
                <Link
                  href="/process"
                  className="btn-blue mt-auto w-full px-6 py-3 gap-2"
                >
                  Show Process
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
              </section>
            )}
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

        {/* Action: report it, or submit it */}
        {mode === 'scan' ? (
          /* A scan has no address, and Figure 7.5 of the paper states a report
             "would not proceed without an attached image or an address". So
             this offers the route into the report flow rather than a submit
             button that would file an undispatchable report — one the admin
             map could never show, because it filters on coordinates. */
          <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <h2 className="font-black mb-0.5">Needs fixing?</h2>
              <p className="text-sm text-gray-400 max-w-lg leading-snug">
                Add the location to file this with road maintenance. Your
                analysis is kept, so you only need to drop a pin.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full sm:w-auto">
              <button
                onClick={handleScanAnother}
                className="px-6 py-3.5 rounded-full font-bold bg-white/10 hover:bg-white/20 border border-white/15 transition-colors w-full sm:w-auto"
              >
                Scan another image
              </button>
              <button
                onClick={handleAddLocation}
                className="btn-blue px-8 py-3.5 w-full sm:w-auto"
              >
                Add location and report
              </button>
            </div>
          </section>
        ) : submitState === 'done' ? (
          /* A whole-panel confirmation, not a line of small green text. The
             submission is the end of the task; it should be unmistakable that
             it worked. */
          <section
            role="status"
            className="bg-[#16a34a]/10 border border-[#16a34a]/40 rounded-oasys shadow-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5"
          >
            <span
              aria-hidden="true"
              className="w-14 h-14 rounded-full bg-[#16a34a] text-white flex items-center justify-center text-2xl font-black shrink-0"
            >
              ✓
            </span>
            <div className="grow">
              <h2 className="text-xl font-black text-white mb-1">
                Report has been submitted
              </h2>
              <p className="text-sm text-gray-300 leading-snug">
                It is now in the admin review queue with a status of{' '}
                <strong className="text-white">Needs Action</strong>. An
                administrator will assess it and mark it resolved.
              </p>
            </div>
            <Link href="/" className="btn-blue px-8 py-3.5 w-full sm:w-auto shrink-0">
              Done
            </Link>
          </section>
        ) : (
          <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-black mb-0.5">Submit this report</h2>
              <p className="text-sm text-gray-400">
                {isSignedIn
                  ? 'Sends the assessment to the admin review queue.'
                  : 'Sign in to send this to the review queue.'}
              </p>
              <p aria-live="assertive" className="text-xs font-bold mt-1.5">
                {submitState === 'error' && (
                  <span className="text-red-400">{submitMessage}</span>
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
                disabled={isSubmitting}
                className="btn-blue px-10 py-3.5 w-full sm:w-auto"
              >
                {isSubmitting ? 'Submitting…' : 'Submit report'}
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
        )}
      </div>
    </div>
  );
}

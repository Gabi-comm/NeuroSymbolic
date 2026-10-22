'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/utils/supabase';
import { SeverityBadge } from '@/components/Severity';
import LoginModal from '@/components/LoginModal';
import Coordinates from '@/components/Coordinates';

// The reporter's own reports and where each one stands. RLS on FileUpload
// ("edit or delete own upload") already limits a user to their own rows; the
// userid filter only says so explicitly.

interface MyReport {
  id: string | number;
  uploadtime: string | null;
  damage_type: string | null;
  severity: string | null;
  corrected_damage_type: string | null;
  corrected_severity: string | null;
  state: string | null;
  address: string | null;
  barangay: string | null;
  lat: number | null;
  lng: number | null;
  image_url: string | null;
  recommendation: { activity?: string; response?: string } | null;
}

const dateFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

export default function MyReportsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  const [reports, setReports] = useState<MyReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // No awaited auth call: the subscription reports the session on subscribe.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setIsLoadingAuth(false);
    });
    const timeout = setTimeout(() => setIsLoadingAuth(false), 5000);
    return () => {
      clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let isMounted = true;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from('FileUpload')
        .select(
          'id, uploadtime, damage_type, severity, corrected_damage_type, corrected_severity, state, address, barangay, lat, lng, image_url, recommendation'
        )
        .eq('userid', userId)
        .order('uploadtime', { ascending: false });
      if (!isMounted) return;
      if (error) setLoadError(error.message);
      else setReports((data ?? []) as MyReport[]);
      setIsLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const open = reports.filter((r) => r.state !== 'Resolved').length;

  return (
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
              My reports
            </h1>
            {userId && reports.length > 0 && (
              <p className="text-gray-400 mt-2">
                {reports.length} filed · {open} awaiting action
              </p>
            )}
          </div>
          {userId && (
            <Link href="/report-damage" className="btn-blue px-8 py-3 w-full sm:w-auto text-center">
              Report distress
            </Link>
          )}
        </div>

        {isLoadingAuth ? (
          <p className="text-gray-500 font-bold animate-pulse">Checking sign-in…</p>
        ) : !userId ? (
          <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-black text-white mb-0.5">Sign in to see your reports</h2>
              <p className="text-sm text-gray-400">Every report you file is tracked here until it is resolved.</p>
            </div>
            <button onClick={() => setShowLogin(true)} className="btn-blue px-10 py-3.5 w-full sm:w-auto">
              Sign in
            </button>
          </section>
        ) : loadError ? (
          <p role="alert" className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold rounded-xl px-4 py-3">
            Could not load your reports: {loadError}
          </p>
        ) : isLoading ? (
          <p className="text-gray-500 font-bold animate-pulse">Loading your reports…</p>
        ) : reports.length === 0 ? (
          <section className="bg-panel-gradient rounded-oasys border border-white/10 p-6 sm:p-8">
            <p className="text-gray-400">
              You have not filed any reports yet.{' '}
              <Link href="/report-damage" className="text-oasys-blue font-bold hover:underline">
                Report distress
              </Link>{' '}
              or{' '}
              <Link href="/captured-distress" className="text-oasys-blue font-bold hover:underline">
                report a captured photo
              </Link>
              .
            </p>
          </section>
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.map((r) => {
              const resolved = r.state === 'Resolved';
              const severity = r.corrected_severity ?? r.severity;
              return (
                <li
                  key={r.id}
                  className="bg-panel-gradient rounded-2xl border border-white/10 p-4 flex flex-col sm:flex-row gap-4"
                >
                  <div className="sm:w-40 aspect-video sm:aspect-[4/3] shrink-0 rounded-xl overflow-hidden bg-black">
                    {r.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image_url} alt={`Reported ${r.damage_type ?? 'distress'}`} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 grow flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-white">
                        {r.corrected_damage_type ?? r.damage_type ?? 'Distress'}
                      </p>
                      <SeverityBadge severity={severity} />
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          resolved
                            ? 'bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {r.state ?? 'Needs Action'}
                      </span>
                      {r.corrected_severity && (
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                          Reviewed by an admin
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 leading-snug">
                      <span className="font-bold text-white">Full Address: </span>
                      {r.address ?? 'Not recorded'}
                    </p>
                    <Coordinates lat={r.lat} lng={r.lng} />
                    {r.recommendation?.activity && (
                      <p className="text-xs text-gray-400">
                        {r.recommendation.activity}
                        {r.recommendation.response && ` · ${r.recommendation.response}`}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 font-bold mt-auto">
                      {r.uploadtime ? `Filed ${dateFormat.format(new Date(r.uploadtime))}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}

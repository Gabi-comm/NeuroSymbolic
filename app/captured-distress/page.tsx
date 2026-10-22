'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase } from '@/utils/supabase';
import {
  readExifLocation,
  readDeviceLocation,
  SOURCE_LABEL,
  type LocationFix,
} from '@/utils/reportLocation';
import {
  saveCapture,
  listCaptures,
  signedUrls,
  deleteCapture,
  type CapturedDistress,
} from '@/utils/captures';
import LoginModal from '@/components/LoginModal';
import Coordinates from '@/components/Coordinates';
import type { Position } from '../report-damage/Map';

const MapComponent = dynamic(() => import('../report-damage/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-black/40 text-gray-400 font-bold">
      Loading map…
    </div>
  ),
});

interface Draft {
  file: File;
  preview: string;
}

const dateFormat = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default function CapturedDistressPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  const [captures, setCaptures] = useState<CapturedDistress[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Same reasoning as UploadResultUi: the subscription reports the session on
  // subscribe, so there is no awaited auth call to get stuck on.
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

  const refresh = useCallback(async (uid: string) => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const rows = await listCaptures(uid);
      setCaptures(rows);
      setThumbs(await signedUrls(rows.map((r) => r.image_path)));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load your captures.');
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (userId) refresh(userId);
  }, [userId, refresh]);

  const locateDevice = useCallback(async () => {
    setIsLocating(true);
    setLocationNote(null);
    try {
      setFix(await readDeviceLocation());
    } catch (err) {
      setLocationNote(err instanceof Error ? err.message : 'Could not read your location.');
    } finally {
      setIsLocating(false);
    }
  }, []);

  const acceptFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setSaveError('That is not an image. Take or choose a JPG or PNG photo.');
      return;
    }
    setSaveError(null);
    if (draft) URL.revokeObjectURL(draft.preview);
    setDraft({ file, preview: URL.createObjectURL(file) });
    setFix(null);

    // EXIF describes where the photo was taken; the device is the fallback,
    // and it is right here because a capture is taken on the spot.
    const exif = await readExifLocation(file);
    if (exif) {
      setLocationNote(null);
      setFix(exif);
    } else {
      locateDevice();
    }
  };

  const discardDraft = () => {
    if (draft) URL.revokeObjectURL(draft.preview);
    setDraft(null);
    setFix(null);
    setLocationNote(null);
    setSaveError(null);
  };

  const onPick = useCallback((pos: Position) => {
    setLocationNote(null);
    setFix({ lat: pos.lat, lng: pos.lng, accuracy_m: null, source: 'manual_pin' });
  }, []);

  const save = async () => {
    if (!draft || !fix || !userId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveCapture(draft.file, fix, userId);
      discardDraft();
      await refresh(userId);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the capture.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (capture: CapturedDistress) => {
    if (confirmingDelete !== capture.id) {
      setConfirmingDelete(capture.id);
      return;
    }
    setConfirmingDelete(null);
    try {
      await deleteCapture(capture);
      setCaptures((prev) => prev.filter((c) => c.id !== capture.id));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not delete the capture.');
    }
  };

  const pending = captures.filter((c) => !c.reported_at);
  const reported = captures.filter((c) => c.reported_at);

  return (
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
            Captured Distress
          </h1>
        </div>

        {isLoadingAuth ? (
          <p className="text-gray-500 font-bold animate-pulse">Checking sign-in…</p>
        ) : !userId ? (
          <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-black text-white mb-0.5">Sign in to capture</h2>
              <p className="text-sm text-gray-400">
                Captures are saved to your account so only you can see and report them.
              </p>
            </div>
            <button onClick={() => setShowLogin(true)} className="btn-blue px-10 py-3.5 w-full sm:w-auto">
              Sign in
            </button>
          </section>
        ) : (
          <div className="flex flex-col gap-6">
            {/* New capture */}
            <section className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-8">
              <input
                ref={inputRef}
                type="file"
                accept="image/png, image/jpeg"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) acceptFile(f);
                  e.target.value = '';
                }}
              />

              {!draft ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="font-black text-white">New capture</h2>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="btn-blue px-10 py-3.5 w-full sm:w-auto"
                  >
                    Take a photo
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                  <div className="lg:col-span-2 flex flex-col gap-3">
                    <h2 className="font-black text-white">Photo</h2>
                    <div className="aspect-video rounded-xl overflow-hidden bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={draft.preview} alt="The distress you just captured" className="w-full h-full object-contain" />
                    </div>
                    <p className="text-xs text-gray-400 truncate" title={draft.file.name}>
                      {draft.file.name}
                    </p>
                  </div>

                  <div className="lg:col-span-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-black text-white">Location</h2>
                      <button
                        type="button"
                        onClick={locateDevice}
                        disabled={isLocating}
                        className="px-3 py-1.5 rounded-full text-xs font-bold text-white bg-white/10 hover:bg-white/20 transition-colors disabled:cursor-wait disabled:opacity-60"
                      >
                        {isLocating ? 'Locating…' : 'Use my location'}
                      </button>
                    </div>
                    <div className="rounded-2xl h-[16rem] sm:h-[20rem] relative overflow-hidden border border-white/10">
                      <MapComponent
                        position={fix ? { lat: fix.lat, lng: fix.lng } : null}
                        accuracyM={fix?.accuracy_m ?? null}
                        onPick={onPick}
                      />
                    </div>
                    <p className="text-sm text-gray-300 tabular-nums" aria-live="polite">
                      {fix
                        ? `${fix.lat.toFixed(6)}, ${fix.lng.toFixed(6)} · ${SOURCE_LABEL[fix.source]}${
                            fix.accuracy_m != null ? ` ±${fix.accuracy_m} m` : ''
                          }`
                        : isLocating
                          ? 'Reading your location…'
                          : 'Tap the map to pin where the distress is.'}
                    </p>
                    {locationNote && (
                      <p role="status" className="bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm font-bold rounded-xl px-4 py-3">
                        {locationNote}
                      </p>
                    )}
                  </div>

                  <div className="lg:col-span-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-white/10">
                    <p aria-live="assertive" className="text-sm font-bold text-red-400">
                      {saveError}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={discardDraft}
                        disabled={isSaving}
                        className="px-6 py-3.5 rounded-full font-bold bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={save}
                        disabled={!fix || isSaving}
                        className="btn-blue px-10 py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? 'Saving…' : !fix ? 'Set the location first' : 'Save capture'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {listError && (
              <p role="alert" className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold rounded-xl px-4 py-3">
                {listError}
              </p>
            )}

            <CaptureList
              title="Waiting to be reported"
              empty={isLoadingList ? 'Loading…' : 'Nothing captured yet.'}
              captures={pending}
              thumbs={thumbs}
              confirmingDelete={confirmingDelete}
              onDelete={remove}
            />
            {reported.length > 0 && (
              <CaptureList
                title="Already reported"
                empty=""
                captures={reported}
                thumbs={thumbs}
                confirmingDelete={confirmingDelete}
                onDelete={remove}
              />
            )}
          </div>
        )}
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}

function CaptureList({
  title,
  empty,
  captures,
  thumbs,
  confirmingDelete,
  onDelete,
}: {
  title: string;
  empty: string;
  captures: CapturedDistress[];
  thumbs: Record<string, string>;
  confirmingDelete: string | null;
  onDelete: (capture: CapturedDistress) => void;
}) {
  return (
    <section>
      <h2 className="font-black text-white mb-3">
        {title}
        {captures.length > 0 && <span className="text-gray-500"> ({captures.length})</span>}
      </h2>
      {captures.length === 0 ? (
        <p className="text-gray-500 italic">{empty}</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {captures.map((c) => (
            <li
              key={c.id}
              className="bg-panel-gradient rounded-2xl border border-white/10 overflow-hidden flex flex-col"
            >
              <div className="aspect-video bg-black">
                {thumbs[c.image_path] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbs[c.image_path]}
                    alt={`Captured distress at ${c.address ?? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`}`}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-4 flex flex-col gap-1 grow">
                <p className="text-xs text-gray-500 font-bold">
                  {dateFormat.format(new Date(c.captured_at))}
                </p>
                <p className="text-sm text-white leading-snug">
                  <span className="font-bold">Full Address: </span>
                  {c.address ?? 'Not found'}
                </p>
                <Coordinates lat={c.lat} lng={c.lng} />
                <p className="text-xs text-gray-400">
                  {[
                    SOURCE_LABEL[c.location_source],
                    c.location_accuracy_m != null && `±${c.location_accuracy_m} m`,
                    c.barangay,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {c.reported_at && (
                  <p className="text-xs font-bold text-[#4ade80]">
                    Reported {dateFormat.format(new Date(c.reported_at))}
                  </p>
                )}
                <div className="flex gap-2 mt-auto pt-3">
                  <Link
                    href={{ pathname: '/report-damage', query: { capture: c.id } }}
                    className="btn-blue px-5 py-2 text-sm grow text-center"
                  >
                    {c.reported_at ? 'Report again' : 'Report this'}
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDelete(c)}
                    className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                      confirmingDelete === c.id
                        ? 'bg-red-500/80 hover:bg-red-500 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    {confirmingDelete === c.id ? 'Confirm delete' : 'Delete'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

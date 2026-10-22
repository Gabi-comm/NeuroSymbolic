'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Position } from './Map';
import { savePendingScan } from '@/utils/pendingScan';
import { loadCapture, captureFix } from '@/utils/captures';
import { useHasAcknowledged, GSD_MM_PX } from '@/utils/captureSettings';
import {
  readExifLocation,
  readDeviceLocation,
  toQuery,
  DEFAULT_PAVEMENT,
  SOURCE_LABEL,
  type LocationFix,
  type PavementType,
  type ReportContext,
} from '@/utils/reportLocation';
import type { GeocodeResult } from '@/app/api/geocode/route';
import CaptureGuidelines from '@/components/CaptureGuidelines';

const MapComponent = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-black/40 text-gray-400 font-bold">
      Loading map…
    </div>
  ),
});

const EMPTY_PLACE: GeocodeResult = {
  address: null,
  barangay: null,
  road_name: null,
  road_class: null,
  surface: null,
};

export default function ReportDamagePage() {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [place, setPlace] = useState<GeocodeResult>(EMPTY_PLACE);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  const [pavement, setPavement] = useState<PavementType>(DEFAULT_PAVEMENT);

  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  // Set when the photo came from Captured Distress, so the capture can be
  // marked reported once this report is filed.
  const [captureId, setCaptureId] = useState<string | null>(null);

  const acknowledged = useHasAcknowledged();
  const inputRef = useRef<HTMLInputElement>(null);
  // Pins can be moved faster than the lookup answers; only the latest counts.
  const lookupSeq = useRef(0);
  // Once the reporter picks a pavement type, a moved pin no longer overrides it.
  // "Use my location" does: it asks for the road actually under the device.
  const pavementChosenRef = useRef(false);

  const lookUp = useCallback(async (lat: number, lng: number, preferOsm: boolean) => {
    const seq = ++lookupSeq.current;
    setIsFetchingAddress(true);
    try {
      const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      const data: GeocodeResult = res.ok ? await res.json() : EMPTY_PLACE;
      if (seq !== lookupSeq.current) return;
      setPlace(data);
      if (data.surface !== null && (preferOsm || !pavementChosenRef.current)) {
        pavementChosenRef.current = false;
        setPavement(data.surface);
      } else if (!pavementChosenRef.current) {
        setPavement(DEFAULT_PAVEMENT);
      }
    } catch {
      if (seq === lookupSeq.current) setPlace(EMPTY_PLACE);
    } finally {
      if (seq === lookupSeq.current) setIsFetchingAddress(false);
    }
  }, []);

  const applyFix = useCallback(
    (next: LocationFix, preferOsm = false) => {
      setFix(next);
      lookUp(next.lat, next.lng, preferOsm);
    },
    [lookUp]
  );

  // A tap or a drag is the reporter overruling GPS, so it becomes a manual pin.
  const onPick = useCallback(
    (pos: Position) => {
      setLocationNote(null);
      applyFix({ lat: pos.lat, lng: pos.lng, accuracy_m: null, source: 'manual_pin' });
    },
    [applyFix]
  );

  const locateDevice = useCallback(async () => {
    setIsLocating(true);
    setLocationNote(null);
    try {
      applyFix(await readDeviceLocation(), true);
    } catch (err) {
      setLocationNote(err instanceof Error ? err.message : 'Could not read your location.');
    } finally {
      setIsLocating(false);
    }
  }, [applyFix]);

  const acceptFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setUploadError('That is not an image. Upload a JPG or PNG photo of the damage.');
        return;
      }

      setUploadError(null);
      setIsPreparing(true);
      setCaptureId(null);
      try {
        // EXIF first, from the original file: the downscale strips metadata.
        const exif = await readExifLocation(file);
        setMediaPreview(await savePendingScan(file));
        setFileName(file.name);

        if (exif) {
          setLocationNote(null);
          applyFix(exif);
        } else if (!fix || fix.source !== 'manual_pin') {
          // No GPS in the photo: fall back to where the device is now. A pin
          // the reporter already placed by hand is kept.
          locateDevice();
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Could not read that image.');
      } finally {
        setIsPreparing(false);
      }
    },
    [applyFix, fix, locateDevice]
  );

  // /report-damage?capture=<id>: arriving from Captured Distress. The photo
  // and the location recorded when it was taken are loaded in; the location is
  // the capture's, not wherever the reporter is sitting now.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('capture');
    if (!id) return;
    let cancelled = false;
    (async () => {
      setIsPreparing(true);
      setUploadError(null);
      try {
        const { capture, file } = await loadCapture(id);
        const preview = await savePendingScan(file);
        if (cancelled) return;
        setMediaPreview(preview);
        setFileName(file.name);
        setCaptureId(capture.id);
        setLocationNote(null);
        applyFix(captureFix(capture), true);
      } catch (err) {
        if (!cancelled) {
          setUploadError(err instanceof Error ? err.message : 'Could not load that capture.');
        }
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyFix]);

  const choosePavement = (value: PavementType) => {
    pavementChosenRef.current = true;
    setPavement(value);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  const hasPhoto = mediaPreview !== null;
  const isReadyToSubmit = fix !== null && hasPhoto && !isFetchingAddress;

  const context: ReportContext | null = fix
    ? {
        ...fix,
        address: place.address,
        barangay: place.barangay,
        road_name: place.road_name,
        road_class: place.road_class,
        pavement_type: pavement,
        capture_id: captureId,
      }
    : null;

  if (!acknowledged) {
    return (
      <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen">
        <CaptureGuidelines onAcknowledge={() => {}} />
      </div>
    );
  }

  const segment = (active: boolean) =>
    `flex-1 px-4 py-2.5 rounded-full text-sm font-bold transition-colors ${
      active ? 'bg-oasys-blue text-white' : 'text-gray-300 hover:bg-white/10'
    }`;

  return (
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-oasys-blue font-bold text-sm uppercase tracking-wider mb-1">
              Report distress
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
              Where is the damage?
            </h1>
          </div>
          <Link
            href="/"
            aria-label="Back to home"
            className="p-2 rounded-full hover:bg-white/10 transition-all text-white group shrink-0"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="group-hover:-translate-x-1 transition-transform">
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
        </div>

        <div className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Map */}
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

              <div className="rounded-2xl h-[18rem] sm:h-[24rem] relative overflow-hidden border border-white/10">
                <MapComponent
                  position={fix ? { lat: fix.lat, lng: fix.lng } : null}
                  accuracyM={fix?.accuracy_m ?? null}
                  onPick={onPick}
                />
              </div>

              <div
                aria-live="polite"
                className={`rounded-xl px-4 py-3 text-sm border ${
                  fix ? 'bg-black/30 border-white/10 text-white' : 'bg-black/20 border-white/5 text-gray-500 italic'
                }`}
              >
                {fix && <span className="font-bold">Full Address: </span>}
                {!fix
                  ? 'Add a photo and the location fills in from GPS, or tap the map.'
                  : isFetchingAddress
                    ? 'Looking up address…'
                    : place.address ?? 'Address not found. The pin location is still recorded.'}
                {fix && (place.barangay || place.road_name) && !isFetchingAddress && (
                  <span className="block text-xs text-gray-400 mt-1">
                    {[place.road_name, place.road_class && `${place.road_class} road`, place.barangay]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </div>

              {locationNote && (
                <p role="status" className="bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm font-bold rounded-xl px-4 py-3">
                  {locationNote}
                </p>
              )}
            </div>

            {/* Photo + pavement */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-black text-white">Photo</h2>
                <Link
                  href="/captured-distress"
                  className="px-3 py-1.5 rounded-full text-xs font-bold text-white bg-white/10 hover:bg-white/20 transition-colors"
                >
                  Use a captured photo
                </Link>
              </div>

              <div
                onDragOver={onDragOver}
                onDragEnter={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`rounded-2xl border-2 border-dashed transition-all overflow-hidden ${
                  isDragging
                    ? 'border-oasys-blue bg-oasys-blue/10'
                    : hasPhoto
                      ? 'border-white/15 bg-black/40'
                      : 'border-white/20 bg-black/30 hover:border-oasys-blue/60'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png, image/jpeg"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) acceptFile(f);
                    // Reset so picking the SAME file again still fires onChange.
                    e.target.value = '';
                  }}
                />

                {mediaPreview ? (
                  <div className="p-3">
                    <div className="aspect-video rounded-xl overflow-hidden bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaPreview} alt="The damage photo you selected" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-3">
                      <p className="text-xs text-gray-400 truncate min-w-0" title={fileName ?? ''}>
                        {fileName}
                      </p>
                      <button
                        onClick={() => inputRef.current?.click()}
                        className="px-3 py-1.5 rounded-full text-xs font-bold text-white bg-white/10 hover:bg-white/20 transition-colors shrink-0"
                      >
                        Replace
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={isPreparing}
                    className="w-full h-[14rem] sm:h-[18rem] flex flex-col items-center justify-center gap-3 p-6 text-center disabled:cursor-wait"
                  >
                    <span
                      aria-hidden="true"
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform ${
                        isDragging ? 'bg-oasys-blue scale-110' : 'bg-white/10'
                      }`}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
                        <circle cx="12" cy="13" r="3" />
                      </svg>
                    </span>
                    <span>
                      <span className="block font-black text-white mb-0.5">
                        {isPreparing ? 'Preparing…' : isDragging ? 'Drop to add' : 'Take or add a photo'}
                      </span>
                      <span className="block text-xs text-gray-400">
                        Drag one in, or <span className="text-oasys-blue font-bold">browse</span>
                      </span>
                    </span>
                  </button>
                )}
              </div>

              {uploadError && (
                <p role="alert" className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold rounded-xl px-4 py-3">
                  {uploadError}
                </p>
              )}

              {/* Pavement decides the repair: reblocking is a concrete repair,
                  patching and overlay are asphalt ones. */}
              <fieldset className="flex flex-col gap-2 mt-1">
                <legend className="font-black text-white mb-2">Road surface</legend>
                <div role="radiogroup" aria-label="Road surface" className="flex gap-1 p-1 rounded-full bg-black/30 border border-white/10">
                  {(['concrete', 'asphalt'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={pavement === value}
                      onClick={() => choosePavement(value)}
                      className={segment(pavement === value)}
                    >
                      {value === 'concrete' ? 'Concrete' : 'Asphalt'}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-5 border-t border-white/10">
            <dl className="flex flex-wrap gap-x-7 gap-y-3 text-xs">
              <div>
                <dt className="text-gray-500 font-bold uppercase tracking-wide mb-0.5">Scale</dt>
                <dd className="text-white font-bold tabular-nums">{GSD_MM_PX.toFixed(3)} mm/px</dd>
              </div>

              <div>
                <dt className="text-gray-500 font-bold uppercase tracking-wide mb-0.5">Location</dt>
                <dd className={`font-bold tabular-nums flex items-center gap-1.5 ${fix ? 'text-white' : 'text-gray-500'}`}>
                  {fix && <span aria-hidden="true" className="text-[#4ade80]">✓</span>}
                  {fix
                    ? `${SOURCE_LABEL[fix.source]}${fix.accuracy_m != null ? ` ±${fix.accuracy_m} m` : ''}`
                    : 'Not set'}
                </dd>
              </div>

              <div className="min-w-0">
                <dt className="text-gray-500 font-bold uppercase tracking-wide mb-0.5">Photo</dt>
                <dd className={`font-bold flex items-center gap-1.5 ${hasPhoto ? 'text-white' : 'text-gray-500'}`}>
                  {hasPhoto && <span aria-hidden="true" className="text-[#4ade80]">✓</span>}
                  <span className="truncate max-w-[12rem]" title={fileName ?? undefined}>
                    {hasPhoto ? (fileName ?? 'Added') : 'Not added'}
                  </span>
                </dd>
              </div>
            </dl>

            {isReadyToSubmit && context ? (
              <Link
                href={{ pathname: '/report-damage/result', query: toQuery(context) }}
                className="btn-blue px-10 py-3.5 w-full sm:w-auto"
              >
                Analyze and review
              </Link>
            ) : (
              <button
                disabled
                className="bg-white/5 text-gray-500 px-10 py-3.5 rounded-full font-bold cursor-not-allowed border border-white/10 w-full sm:w-auto"
              >
                {!hasPhoto ? 'Add a photo first' : !fix ? 'Set the location first' : 'Looking up address…'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

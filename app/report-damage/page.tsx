'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Position } from './Map';
import { savePendingScan } from '@/utils/pendingScan';
import { useHasAcknowledged, useAcknowledgedGsd } from '@/utils/captureSettings';
import CaptureGuidelines from '@/components/CaptureGuidelines';

const MapComponent = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-gray-400 font-bold">
      Loading map…
    </div>
  ),
});

export default function ReportDamagePage() {
  const [position, setPosition] = useState<Position>({ lat: 14.6566, lng: 120.9796 });
  const [address, setAddress] = useState<string>('');
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hasPinned, setHasPinned] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  const acknowledged = useHasAcknowledged();
  const gsd = useAcknowledgedGsd();
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchAddress = async (lat: number, lng: number) => {
    setIsFetchingAddress(true);
    setHasPinned(true);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      setAddress(data?.display_name ?? 'Address not found for this location.');
    } catch {
      setAddress('Could not retrieve the address. The pin location is still recorded.');
    } finally {
      setIsFetchingAddress(false);
    }
  };

  const acceptFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('That is not an image. Upload a JPG or PNG photo of the damage.');
      return;
    }

    setUploadError(null);
    setIsPreparing(true);
    try {
      setMediaPreview(await savePendingScan(file));
      setFileName(file.name);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read that image.');
    } finally {
      setIsPreparing(false);
    }
  }, []);

  // Same missing-drop-handler gap the scan page had.
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

  const isReadyToSubmit = hasPinned && mediaPreview !== null;

  if (!acknowledged) {
    return (
      <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen">
        <CaptureGuidelines onAcknowledge={() => {}} />
      </div>
    );
  }

  return (
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen bg-dark-bg">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-oasys-blue font-bold text-sm uppercase tracking-wider mb-1">
              Report damage
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
                <span className="text-xs text-gray-500 font-bold">
                  {hasPinned ? 'Tap again to move the pin' : 'Tap the map to drop a pin'}
                </span>
              </div>

              <div className="rounded-2xl h-[18rem] sm:h-[24rem] relative overflow-hidden border border-white/10">
                <MapComponent position={position} setPosition={setPosition} fetchAddress={fetchAddress} />
              </div>

              <div
                aria-live="polite"
                className={`rounded-xl px-4 py-3 text-sm border ${
                  hasPinned
                    ? 'bg-black/30 border-white/10 text-white'
                    : 'bg-black/20 border-white/5 text-gray-500 italic'
                }`}
              >
                <span aria-hidden="true">📍 </span>
                {isFetchingAddress
                  ? 'Looking up address…'
                  : address || 'No location selected yet'}
              </div>
            </div>

            {/* Photo */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              <h2 className="font-black text-white">Photo</h2>

              <div
                onDragOver={onDragOver}
                onDragEnter={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`rounded-2xl border-2 border-dashed transition-all overflow-hidden ${
                  isDragging
                    ? 'border-oasys-blue bg-oasys-blue/10'
                    : mediaPreview
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
                  }}
                />

                {mediaPreview ? (
                  <div className="p-3">
                    <div className="aspect-video rounded-xl overflow-hidden bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mediaPreview}
                        alt="The damage photo you selected"
                        className="w-full h-full object-contain"
                      />
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
                    className="w-full h-[18rem] sm:h-[24rem] flex flex-col items-center justify-center gap-3 p-6 text-center disabled:cursor-wait"
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
                        {isPreparing ? 'Preparing…' : isDragging ? 'Drop to add' : 'Add a photo'}
                      </span>
                      <span className="block text-xs text-gray-400">
                        Drag one in, or{' '}
                        <span className="text-oasys-blue font-bold">browse</span>
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
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-5 border-t border-white/10">
            <dl className="flex flex-wrap gap-x-7 gap-y-3 text-xs">
              <div>
                <dt className="text-gray-500 font-bold uppercase tracking-wide mb-0.5">Scale</dt>
                <dd className="text-white font-bold tabular-nums">{gsd.toFixed(3)} mm/px</dd>
              </div>

              <div>
                <dt className="text-gray-500 font-bold uppercase tracking-wide mb-0.5">Pin</dt>
                <dd
                  className={`font-bold tabular-nums flex items-center gap-1.5 ${
                    hasPinned ? 'text-white' : 'text-gray-600'
                  }`}
                >
                  {hasPinned && (
                    <span aria-hidden="true" className="text-[#4ade80]">
                      ✓
                    </span>
                  )}
                  {hasPinned
                    ? `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`
                    : 'Not set'}
                </dd>
              </div>

              <div className="min-w-0">
                <dt className="text-gray-500 font-bold uppercase tracking-wide mb-0.5">Photo</dt>
                <dd
                  className={`font-bold flex items-center gap-1.5 ${
                    mediaPreview ? 'text-white' : 'text-gray-600'
                  }`}
                >
                  {mediaPreview && (
                    <span aria-hidden="true" className="text-[#4ade80]">
                      ✓
                    </span>
                  )}
                  <span className="truncate max-w-[12rem]" title={fileName ?? undefined}>
                    {mediaPreview ? (fileName ?? 'Added') : 'Not added'}
                  </span>
                </dd>
              </div>
            </dl>

            {isReadyToSubmit ? (
              <Link
                href={{
                  pathname: '/report-damage/result',
                  query: { lat: position.lat, lng: position.lng, address },
                }}
                className="btn-blue px-10 py-3.5 w-full sm:w-auto"
              >
                Analyze and review
              </Link>
            ) : (
              <button
                disabled
                className="bg-white/5 text-gray-500 px-10 py-3.5 rounded-full font-bold cursor-not-allowed border border-white/10 w-full sm:w-auto"
              >
                {!hasPinned ? 'Drop a pin first' : 'Add a photo first'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

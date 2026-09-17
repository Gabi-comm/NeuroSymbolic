'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Position } from './Map';
import { savePendingScan } from '@/utils/pendingScan';
import { useHasAcknowledged } from '@/utils/captureSettings';
import CaptureGuidelines from '@/components/CaptureGuidelines';

const MapComponent = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-300 text-black font-bold">
      Loading map…
    </div>
  ),
});

export default function ReportDamagePage() {
  const [position, setPosition] = useState<Position>({ lat: 14.6566, lng: 120.9796 });
  const [address, setAddress] = useState<string>('Drop a pin on the map to set the location');
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [hasPinned, setHasPinned] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const acknowledged = useHasAcknowledged();

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload a valid image file (JPG or PNG).');
      return;
    }

    setUploadError(null);
    try {
      setMediaPreview(await savePendingScan(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read that image.');
    }
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
      <div className="bg-card-bg rounded-oasys p-6 sm:p-12 border border-white/5 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6 mb-8">
          <div>
            <p className="text-oasys-blue font-bold text-sm uppercase tracking-wider mb-1">
              Pin the area
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
              Report road damage
            </h1>
          </div>

          {isReadyToSubmit ? (
            <Link
              href={{
                pathname: '/report-damage/result',
                query: { lat: position.lat, lng: position.lng, address },
              }}
              className="btn-blue px-8 py-3.5 w-full lg:w-auto"
            >
              Submit report
            </Link>
          ) : (
            <button
              disabled
              className="bg-white/5 text-gray-500 px-8 py-3.5 rounded-full font-bold cursor-not-allowed border border-white/10 w-full lg:w-auto"
            >
              {!hasPinned ? 'Drop a pin first' : 'Add an image first'}
            </button>
          )}
        </div>

        <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <span className="text-oasys-blue font-bold shrink-0">Location</span>
          <div
            aria-live="polite"
            className="bg-surface-light text-black px-5 py-2.5 rounded-xl font-medium grow min-w-0 break-words text-sm sm:text-base"
          >
            {isFetchingAddress ? 'Updating location…' : address}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-gray-300 rounded-2xl h-[20rem] sm:h-[28rem] relative overflow-hidden">
            <MapComponent
              position={position}
              setPosition={setPosition}
              fetchAddress={fetchAddress}
            />
          </div>

          <div className="bg-surface-light rounded-2xl p-5 sm:p-6 text-black flex flex-col">
            <h2 className="text-xl font-black mb-4">Upload image</h2>

            <label className="bg-zinc-500 hover:bg-zinc-600 focus-within:ring-4 focus-within:ring-oasys-blue/50 transition cursor-pointer rounded-xl aspect-video mb-4 overflow-hidden relative flex items-center justify-center border-2 border-dashed border-gray-400 shadow-inner">
              <input
                type="file"
                accept="image/png, image/jpeg"
                capture="environment"
                className="sr-only"
                onChange={handleFileUpload}
              />

              {mediaPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaPreview}
                  alt="Preview of the damage photo you selected"
                  className="w-full h-full object-contain absolute inset-0 bg-zinc-800/50"
                />
              ) : (
                <span className="text-white font-bold text-center px-4">
                  <span aria-hidden="true" className="text-3xl mb-2 block">
                    📸
                  </span>
                  Take a photo or upload
                </span>
              )}
            </label>

            {uploadError && (
              <p role="alert" className="text-red-700 text-sm font-bold mb-3">
                {uploadError}
              </p>
            )}

            <div className="mt-auto">
              <p className="font-bold mb-1">Address</p>
              <p className="text-sm leading-snug text-zinc-700 break-words">
                {isFetchingAddress ? 'Updating…' : address}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

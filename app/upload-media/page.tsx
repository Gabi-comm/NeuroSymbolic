'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { savePendingScan } from '@/utils/pendingScan';
import { useHasAcknowledged } from '@/utils/captureSettings';
import CaptureGuidelines from '@/components/CaptureGuidelines';

export default function UploadMediaPage() {
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acknowledged = useHasAcknowledged();
  const router = useRouter();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPG or PNG).');
      return;
    }

    setError(null);
    try {
      setMediaPreview(await savePendingScan(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image.');
    }
  };

  const handleAnalyze = () => {
    if (!mediaPreview) return;
    setIsProcessing(true);
    router.push('/upload-media/result');
  };

  if (!acknowledged) {
    return (
      <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen">
        {/* setAcknowledged() notifies the store, so no local state is needed. */}
        <CaptureGuidelines onAcknowledge={() => {}} />
      </div>
    );
  }

  return (
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen">
      <div className="bg-panel-bg p-6 sm:p-12 shadow-2xl rounded-oasys flex flex-col gap-8">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6">
          <div className="max-w-xl">
            <p className="text-oasys-blue font-bold mb-1">Upload media here</p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight">
              Upload road image
            </h1>
          </div>

          <div className="flex flex-col lg:items-end gap-3">
            <Link
              href="/"
              className="self-start lg:self-end p-2 rounded-full hover:bg-white/10 transition-all text-white group"
              aria-label="Back to home"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="group-hover:-translate-x-1 transition-transform"
              >
                <path d="M19 12H5" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </Link>

            <p className="text-oasys-blue font-bold text-sm uppercase tracking-wider">
              Supported formats: JPG, PNG
            </p>
            <p className="text-gray-400 text-sm max-w-xs lg:text-right">
              Crack type and severity are detected automatically.
            </p>

            {error && (
              <p role="alert" className="text-red-400 text-sm font-bold max-w-xs lg:text-right">
                {error}
              </p>
            )}

            <button
              onClick={handleAnalyze}
              disabled={!mediaPreview || isProcessing}
              className="btn-blue px-10 py-3 w-full lg:w-auto"
            >
              {isProcessing ? 'Processing…' : 'Analyze'}
            </button>
          </div>
        </div>

        <label className="w-full min-h-[18rem] sm:min-h-[26rem] bg-surface-light border-4 border-dashed border-oasys-blue/40 rounded-oasys flex flex-col items-center justify-center text-black group hover:border-oasys-blue focus-within:border-oasys-blue transition-all cursor-pointer relative overflow-hidden p-6">
          <input
            type="file"
            accept="image/png, image/jpeg"
            // Opens the camera directly on a phone. Without this an on-field
            // inspector gets a file browser, which is the wrong tool outdoors.
            capture="environment"
            className="sr-only"
            onChange={handleFileUpload}
          />

          {mediaPreview ? (
            /* next/image cannot optimise a client-side data URL. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaPreview}
              alt="Preview of the road image you selected"
              className="w-full h-full object-contain absolute inset-0 bg-zinc-800/50"
            />
          ) : (
            <>
              <div
                aria-hidden="true"
                className="w-20 h-20 bg-oasys-blue rounded-full mb-6 flex items-center justify-center text-white text-4xl font-light shadow-lg group-hover:scale-110 transition-transform"
              >
                +
              </div>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-2 text-center">
                Take a photo or upload
              </h2>
              <p className="text-gray-600 font-bold text-center">
                JPG and PNG, up to about 10 MB
              </p>
            </>
          )}
        </label>
      </div>
    </div>
  );
}

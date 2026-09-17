'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { savePendingScan } from '@/utils/pendingScan';
import { useHasAcknowledged, useAcknowledgedGsd } from '@/utils/captureSettings';
import CaptureGuidelines from '@/components/CaptureGuidelines';

export default function UploadMediaPage() {
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acknowledged = useHasAcknowledged();
  const gsd = useAcknowledgedGsd();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const acceptFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('That is not an image. Upload a JPG or PNG photo of a road.');
      return;
    }

    setError(null);
    setIsPreparing(true);
    try {
      setMediaPreview(await savePendingScan(file));
      setFileInfo({ name: file.name, size: file.size });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image.');
    } finally {
      setIsPreparing(false);
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
  };

  // The dropzone previously said "Drag or Upload Image Here" but had no drop
  // handler at all — dragging a file onto it made the browser navigate away from
  // the app and open the image. These four handlers are what that copy promised.
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

  const clearImage = () => {
    setMediaPreview(null);
    setFileInfo(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleAnalyze = () => {
    if (!mediaPreview) return;
    setIsProcessing(true);
    router.push('/upload-media/result');
  };

  if (!acknowledged) {
    return (
      <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen">
        <CaptureGuidelines onAcknowledge={() => {}} />
      </div>
    );
  }

  const formatSize = (bytes: number) =>
    bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;

  return (
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-16 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-oasys-blue font-bold text-sm uppercase tracking-wider mb-1">
              Step 2 of 2
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
              Upload road image
            </h1>
          </div>
          <Link
            href="/"
            aria-label="Back to home"
            className="p-2 rounded-full hover:bg-white/10 transition-all text-white group shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="group-hover:-translate-x-1 transition-transform">
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
        </div>

        <div className="bg-panel-gradient rounded-oasys border border-white/10 shadow-2xl p-5 sm:p-8 flex flex-col gap-5">
          {/* Dropzone */}
          <div
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative rounded-oasys border-2 border-dashed transition-all overflow-hidden ${
              isDragging
                ? 'border-oasys-blue bg-oasys-blue/10 scale-[1.01]'
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
              onChange={handleFileUpload}
            />

            {mediaPreview ? (
              <div className="p-4 sm:p-5">
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaPreview}
                    alt="The road image you selected"
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate" title={fileInfo?.name}>
                      {fileInfo?.name ?? 'Selected image'}
                    </p>
                    {fileInfo && (
                      <p className="text-xs text-gray-400">
                        {formatSize(fileInfo.size)} · resized for analysis
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => inputRef.current?.click()}
                      className="px-4 py-2 rounded-full text-sm font-bold text-white bg-white/10 hover:bg-white/20 transition-colors"
                    >
                      Replace
                    </button>
                    <button
                      onClick={clearImage}
                      className="px-4 py-2 rounded-full text-sm font-bold text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isPreparing}
                className="w-full min-h-[16rem] sm:min-h-[22rem] flex flex-col items-center justify-center gap-4 p-8 text-center cursor-pointer disabled:cursor-wait"
              >
                <span
                  aria-hidden="true"
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-transform ${
                    isDragging ? 'bg-oasys-blue scale-110' : 'bg-white/10'
                  }`}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <path d="M12 16V4" />
                    <path d="m7 9 5-5 5 5" />
                    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                  </svg>
                </span>

                <span>
                  <span className="block text-xl sm:text-2xl font-black text-white mb-1">
                    {isPreparing
                      ? 'Preparing image…'
                      : isDragging
                        ? 'Drop to upload'
                        : 'Drag an image here'}
                  </span>
                  <span className="block text-gray-400 text-sm">
                    or <span className="text-oasys-blue font-bold">browse your files</span> ·
                    JPG or PNG
                  </span>
                </span>

                <span className="text-xs text-gray-500 max-w-sm">
                  On a phone this opens the camera, so you can shoot the defect directly.
                </span>
              </button>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold rounded-xl px-4 py-3"
            >
              {error}
            </p>
          )}

          {/* Footer: scale readout + action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
            <dl className="flex gap-6 text-xs">
              <div>
                <dt className="text-gray-500 font-bold uppercase tracking-wide mb-0.5">Scale</dt>
                <dd className="text-white font-bold tabular-nums">
                  {gsd.toFixed(3)} mm/px
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 font-bold uppercase tracking-wide mb-0.5">
                  Detects
                </dt>
                <dd className="text-white font-bold">Potholes · 3 crack types</dd>
              </div>
            </dl>

            <button
              onClick={handleAnalyze}
              disabled={!mediaPreview || isProcessing || isPreparing}
              className="btn-blue px-10 py-3.5 w-full sm:w-auto"
            >
              {isProcessing ? 'Analyzing…' : 'Analyze image'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 mt-5">
          Images without a detectable road surface are rejected before analysis.{' '}
          <Link href="/about" className="text-oasys-blue hover:underline font-bold">
            How it works
          </Link>
        </p>
      </div>
    </div>
  );
}

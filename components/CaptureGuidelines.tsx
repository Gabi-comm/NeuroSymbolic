'use client';

import {
  CAPTURE_GUIDELINES,
  GSD_MM_PX,
  LANE_WIDTH_M,
  setAcknowledged,
} from '@/utils/captureSettings';

/**
 * The gate the study's wireframes call for, where users "acknowledge capture
 * guidelines" before uploading.
 *
 * It is not decoration. Inverse Perspective Mapping relies on the capture
 * geometry being roughly what the system assumes; if the inspector shoots from
 * the hip or at an angle, every measurement downstream is wrong while still
 * looking authoritative.
 *
 * The scale is locked: the capture rule frames roughly one 3.05 m lane, so every
 * photo is measured at 4.357 mm per pixel. Reporters no longer type a width.
 */
export default function CaptureGuidelines({ onAcknowledge }: { onAcknowledge: () => void }) {
  const accept = () => {
    setAcknowledged();
    onAcknowledge();
  };

  return (
    <div className="bg-panel-gradient rounded-oasys p-6 sm:p-10 border border-white/10 shadow-2xl max-w-3xl mx-auto">
      <p className="text-oasys-blue font-bold text-sm uppercase tracking-wider mb-2">
        Before you upload
      </p>
      <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-3">
        Image capture guidelines
      </h1>
      <p className="text-gray-400 mb-8 max-w-xl leading-relaxed">
        Measurements are derived from perspective correction, which assumes the photo
        was taken roughly as described below. Photos taken very differently will
        still produce a result, but the measurements will not be reliable.
      </p>

      <ol className="flex flex-col gap-3 mb-8">
        {CAPTURE_GUIDELINES.map((guideline, index) => (
          <li
            key={guideline.title}
            className="flex gap-4 bg-black/25 rounded-2xl p-4 border border-white/5"
          >
            <span
              aria-hidden="true"
              className="shrink-0 w-7 h-7 rounded-full bg-oasys-blue text-white font-black text-sm flex items-center justify-center"
            >
              {index + 1}
            </span>
            <div>
              <p className="font-bold text-white">{guideline.title}</p>
              <p className="text-sm text-gray-400 leading-snug">{guideline.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="bg-black/25 rounded-2xl p-5 border border-white/5 mb-8">
        <p className="font-bold text-white mb-1">One lane in frame</p>
        <p className="text-sm text-gray-400 mb-4 max-w-lg leading-snug">
          Following the capture rule above guarantees roughly one lane of road in
          the frame, about {LANE_WIDTH_M.toFixed(2)} m edge to edge. That sets the
          scale for every measurement, so it is fixed for all reports.
        </p>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-gray-500 font-bold uppercase tracking-wide">Road width in frame</dt>
            <dd className="font-black text-white tabular-nums">{LANE_WIDTH_M.toFixed(2)} m</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 font-bold uppercase tracking-wide">Scale</dt>
            <dd className="font-black text-white tabular-nums">{GSD_MM_PX.toFixed(3)} mm per pixel</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500 max-w-sm leading-snug">
          Measurements depend on following these guidelines. A photo taken very
          differently will still analyse, but the figures will not be reliable.
        </p>
        <button
          onClick={accept}
          className="btn-blue px-8 py-3.5 text-base whitespace-nowrap w-full sm:w-auto"
        >
          I understand — continue
        </button>
      </div>
    </div>
  );
}

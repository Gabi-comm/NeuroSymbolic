'use client';

import { useState } from 'react';
import {
  CAPTURE_GUIDELINES,
  DEFAULT_ROAD_WIDTH_M,
  MAX_ROAD_WIDTH_M,
  MIN_ROAD_WIDTH_M,
  gsdFromRoadWidth,
  isRoadWidthValid,
  setAcknowledged,
} from '@/utils/captureSettings';

/**
 * The gate the study's wireframes call for, where users "acknowledge capture
 * guidelines" before uploading.
 *
 * It is not decoration. Inverse Perspective Mapping relies on the capture
 * geometry being roughly what the system assumes; if the inspector shoots from
 * the hip or at an angle, every measurement downstream is wrong while still
 * looking authoritative. Acknowledging is also where the road width is captured,
 * which is what actually sets the Ground Sample Distance.
 */
export default function CaptureGuidelines({ onAcknowledge }: { onAcknowledge: () => void }) {
  const [roadWidth, setRoadWidth] = useState<string>(String(DEFAULT_ROAD_WIDTH_M));

  const parsed = Number(roadWidth);
  const valid = isRoadWidthValid(parsed);
  const gsd = valid ? gsdFromRoadWidth(parsed) : null;

  const accept = () => {
    if (!valid || gsd === null) return;
    setAcknowledged(gsd);
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
        <label htmlFor="road-width" className="block font-bold text-white mb-1">
          Width of road surface in frame
        </label>
        <p className="text-sm text-gray-400 mb-4 max-w-lg leading-snug">
          Roughly how wide is the road you photographed, edge to edge? One standard
          lane is about 3 m. This sets the scale used for every measurement.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              id="road-width"
              type="number"
              inputMode="decimal"
              step="0.05"
              min={MIN_ROAD_WIDTH_M}
              max={MAX_ROAD_WIDTH_M}
              value={roadWidth}
              onChange={(e) => setRoadWidth(e.target.value)}
              aria-describedby="road-width-help"
              aria-invalid={!valid}
              className="w-28 bg-white text-black font-bold px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-oasys-blue"
            />
            <span className="font-bold text-gray-300">metres</span>
          </div>

          <p id="road-width-help" className="text-sm font-bold">
            {valid ? (
              <span className="text-green-400">
                Scale: {gsd!.toFixed(3)} mm per pixel
              </span>
            ) : (
              <span className="text-red-400">
                Enter a width between {MIN_ROAD_WIDTH_M} and {MAX_ROAD_WIDTH_M} m
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500 max-w-sm leading-snug">
          Measurements depend on following these guidelines. A photo taken very
          differently will still analyse, but the figures will not be reliable.
        </p>
        <button
          onClick={accept}
          disabled={!valid}
          className="btn-blue px-8 py-3.5 text-base whitespace-nowrap w-full sm:w-auto"
        >
          I understand — continue
        </button>
      </div>
    </div>
  );
}

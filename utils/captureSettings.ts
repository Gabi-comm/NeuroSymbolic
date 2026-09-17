import { useSyncExternalStore } from 'react';

/**
 * Capture guidelines and Ground Sample Distance.
 *
 * The study's delimitation states that IPM accuracy "relies entirely on known
 * camera parameters" and that the system "strictly assumes users will adhere to
 * the prompted image capturing guidelines". Nothing in the UI had ever prompted
 * them, so every measurement rested on an unstated assumption.
 *
 * Where 4.357 mm/px comes from
 * ----------------------------
 * The backend warps the detected road surface onto a fixed 700x700 bird's-eye
 * view, so GSD is a property of that warp, not of the original photograph:
 *
 *     GSD (mm/px) = road width in frame (mm) / 700
 *
 * The paper's 4.357 mm/px implies 4.357 x 700 = 3050 mm, i.e. a 3.05 m road
 * width -- one standard lane. That is why a single constant works at all, and it
 * gives inspectors something physical to adjust rather than an opaque number.
 */

/** Must match `width`/`height` in get_birds_eye_view (backend/api.py). */
export const BEV_WIDTH_PX = 700;

/** Paper section 3.3.C. Equivalent to a 3.05 m road width across the frame. */
export const DEFAULT_GSD_MM_PX = 4.357;
export const DEFAULT_ROAD_WIDTH_M = 3.05;

/** Beyond this range the IPM warp is unlikely to be meaningful. */
export const MIN_ROAD_WIDTH_M = 1.5;
export const MAX_ROAD_WIDTH_M = 12;

export interface CaptureGuideline {
  title: string;
  detail: string;
}

export const CAPTURE_GUIDELINES: CaptureGuideline[] = [
  {
    title: 'Hold the camera at chest height',
    detail: 'Roughly 1.4 m from the ground, kept level — not tilted down.',
  },
  {
    title: 'Stand about 2 m from the defect',
    detail: 'The defect should sit in the middle of the frame, not at an edge.',
  },
  {
    title: 'Capture in daylight',
    detail: 'Clear, evenly lit conditions. Not at night, in heavy rain, or on flooded road.',
  },
  {
    title: 'Keep the road surface unobstructed',
    detail: 'Avoid vehicles, people and shadows across the defect where you can.',
  },
];

/** Convert a measured road width into the GSD the backend should use. */
export function gsdFromRoadWidth(roadWidthMetres: number): number {
  return (roadWidthMetres * 1000) / BEV_WIDTH_PX;
}

export function isRoadWidthValid(roadWidthMetres: number): boolean {
  return (
    Number.isFinite(roadWidthMetres) &&
    roadWidthMetres >= MIN_ROAD_WIDTH_M &&
    roadWidthMetres <= MAX_ROAD_WIDTH_M
  );
}

const ACK_KEY = 'oasys.capture.acknowledged';
const GSD_KEY = 'oasys.capture.gsd';

/**
 * Acknowledgement lives in sessionStorage, not localStorage: it should lapse when
 * the inspector closes the browser, so the guidelines are re-read each session
 * rather than acknowledged once and forgotten.
 */
export function hasAcknowledged(): boolean {
  try {
    return sessionStorage.getItem(ACK_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAcknowledged(gsdMmPx: number): void {
  try {
    sessionStorage.setItem(ACK_KEY, 'true');
    sessionStorage.setItem(GSD_KEY, String(gsdMmPx));
  } catch {
    // Private-mode browsers throw; the gate simply reappears next navigation.
  }
  emit();
}

// sessionStorage is an external store, so it is read with useSyncExternalStore
// rather than copied into state inside an effect. That avoids the extra render
// pass an effect costs, and keeps server and client snapshots explicit.
let listeners: Array<() => void> = [];

function subscribe(callback: () => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Server render has no sessionStorage, so it always shows the gate. */
const getServerSnapshot = () => false;

/** True once the inspector has acknowledged the guidelines this session. */
export function useHasAcknowledged(): boolean {
  return useSyncExternalStore(subscribe, hasAcknowledged, getServerSnapshot);
}

export function getAcknowledgedGsd(): number {
  try {
    const stored = sessionStorage.getItem(GSD_KEY);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GSD_MM_PX;
  } catch {
    return DEFAULT_GSD_MM_PX;
  }
}

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
 * width -- one standard lane.
 *
 * Locked for every user (City Engineer revision, 2026-10-22). Reporters used to
 * type the road width themselves, which made the scale depend on a guess no one
 * could check. The capture rule -- chest height, about 2 m from the defect,
 * camera level -- frames roughly one lane, so the scale is fixed instead and the
 * rule is what guarantees it. A reference card in frame will override it per
 * photo once the backend detects one.
 */

/** Must match `width`/`height` in get_birds_eye_view (backend/api.py). */
export const BEV_WIDTH_PX = 700;

/** Paper section 3.3.C: one 3.05 m lane across the 700 px warp. */
export const LANE_WIDTH_M = 3.05;
export const GSD_MM_PX = 4.357;

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

const ACK_KEY = 'oasys.capture.acknowledged';

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

export function setAcknowledged(): void {
  try {
    sessionStorage.setItem(ACK_KEY, 'true');
    // A scale typed in before the lock would otherwise linger in old sessions.
    sessionStorage.removeItem('oasys.capture.gsd');
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

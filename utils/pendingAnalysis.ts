import { useSyncExternalStore } from 'react';

// Carries a finished analysis from the Scan result into the Report flow.
//
// Per the paper (Figure 7.5) a report "would not proceed without an attached
// image or an address", so a scan — which has no address — cannot be submitted.
// What it can do is hand its result to the report flow, where the user only has
// to drop a pin.
//
// Without this, that hop would re-upload and re-analyse the same image: another
// road-detection pass, SAM segmentation and LLM bulletin, roughly 25 seconds of
// work to produce a result we already hold.
//
// sessionStorage rather than localStorage: an in-progress report should not
// survive closing the browser.

export type Severity = 'Low' | 'Medium' | 'High';

export interface Distress {
  label: string;
  type?: string;
  confidence: number;
  measurement_type: string;
  metric_value: number;
  unit: string;
  width_mm: number;
  /** Headline grade shown in the UI; carries the fuzzy result. */
  severity: Severity;
  // Symbolic component outputs. The parallel severities are the RQ3 dataset.
  severity_fuzzy?: Severity;
  severity_crisp?: Severity;
  severity_confidence?: Severity;
  /** The study's original 3/6 mm thresholds, kept for reproducing prior results. */
  severity_legacy_crisp?: Severity;
  /** The literal DPWH two-band verdict: Narrow / Wide (D.O. 120 s.2019). */
  severity_dpwh_nw?: 'Narrow' | 'Wide' | 'Not rated';
  severity_score?: number | null;
  rule_base?: 'linear' | 'area' | 'pothole-unstratified';
  crack_density_pct?: number;
  membership_trace?: Record<string, unknown>;
}

export interface AnalysisData {
  filename: string;
  fileUrl: string;
  overall_severity: Severity;
  gemini_bulletin: string;
  distresses: Distress[];
  gsd_mm_px?: number;
  crack_density_pct?: number;
  ipm_applied?: boolean;
  privacy_blur_applied?: boolean;
}

const KEY = 'oasys.pendingAnalysis';

// ---------------------------------------------------------------------------
// The last finished result, per result screen.
//
// A result screen analyses the pending scan and then clears it, so the scan
// cannot be re-analysed and re-charged 25 seconds on every revisit. That made
// the screen a dead end: leaving it and coming back -- via the browser's back
// button, or the arrow on /process -- re-mounted the page with nothing to show
// and reported "No image found to analyze."
//
// Keeping the finished result makes the screen returnable. It is keyed by path
// because /upload-media/result and /report-damage/result are different
// screens, and a scan's result must not surface on the report screen.
// ---------------------------------------------------------------------------

const LAST_KEY = 'oasys.lastResult';

interface LastResult {
  path: string;
  data: AnalysisData;
  /** Already filed. Restoring the screen must not offer to file it again. */
  submitted: boolean;
}

export function saveLastResult(
  path: string,
  data: AnalysisData,
  submitted = false
): void {
  try {
    sessionStorage.setItem(
      LAST_KEY,
      JSON.stringify({ path, data, submitted } as LastResult)
    );
  } catch {
    // Quota. Losing this only costs the back-navigation convenience.
  }
}

/** The finished result for this screen, or null if the last one was elsewhere. */
export function readLastResult(
  path: string
): { data: AnalysisData; submitted: boolean } | null {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastResult;
    if (parsed?.path !== path) return null;
    if (!Array.isArray(parsed.data?.distresses)) return null;
    return { data: parsed.data, submitted: parsed.submitted === true };
  } catch {
    return null;
  }
}

export function savePendingAnalysis(data: AnalysisData): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
    emit();
    return true;
  } catch {
    // The annotated image is a base64 data URL of a few hundred KB; a browser
    // with a tight quota can refuse it. The caller falls back to re-analysing.
    return false;
  }
}

export function readPendingAnalysis(): AnalysisData | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnalysisData;
    // A half-written or stale entry should not crash the result screen.
    return parsed && Array.isArray(parsed.distresses) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingAnalysis(): void {
  try {
    sessionStorage.removeItem(KEY);
    emit();
  } catch {
    // Private-mode browsers can throw; nothing to clean up if so.
  }
}

// sessionStorage is an external store, so it is read through
// useSyncExternalStore rather than copied into state inside an effect: no extra
// render pass, and server and client snapshots are explicit.
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

/** True when a scan handed its analysis to the report flow. */
function hasCarriedAnalysis(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** The server has no sessionStorage, so it always reports "nothing carried". */
const getServerSnapshot = () => false;

export function useHasCarriedAnalysis(): boolean {
  return useSyncExternalStore(subscribe, hasCarriedAnalysis, getServerSnapshot);
}

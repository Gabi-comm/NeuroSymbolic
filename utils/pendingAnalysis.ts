// Shapes of a finished analysis, and the last result per result screen.
//
// This file once also carried a Scan result into the Report flow. Scan was
// removed in the City Engineer revision (one flow: photo, location, analyse,
// submit), so only the types and the returnable-result store remain.
//
// sessionStorage rather than localStorage: an in-progress report should not
// survive closing the browser.

export type Severity = 'Low' | 'Medium' | 'High';

/** The symbolic layer's repair for one defect (fuzzy_engine.INTERVENTIONS). */
export interface Recommendation {
  /** DPWH activity, e.g. "Act. 122 Crack and Joints Sealing of Concrete Pavements". */
  activity: string;
  /** The method in one sentence. */
  method: string;
  /** DPWH response time, as text (D.O. 47 s.2024 Table 4.1). */
  response: string;
  /** The same in working days, when it is a fixed number. */
  response_days: number | null;
}

export interface Distress {
  label: string;
  type?: string;
  confidence: number;
  measurement_type: string;
  metric_value: number;
  unit: string;
  /** Predominant width along the centreline, the DPWH reading (measure.py). */
  width_mm: number;
  /** The previous area / length estimate, kept for comparison. */
  width_mm_area_ratio?: number;
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
  rule_base?: 'linear' | 'area' | 'pothole-area';
  crack_density_pct?: number;
  membership_trace?: Record<string, unknown>;
  recommendation?: Recommendation;
}

export interface AnalysisData {
  filename: string;
  fileUrl: string;
  overall_severity: Severity;
  gemini_bulletin: string;
  distresses: Distress[];
  gsd_mm_px?: number;
  /** reference_card when a marker in the photo set the scale. */
  scale_source?: 'assumed_height' | 'reference_card';
  pavement_type?: 'concrete' | 'asphalt';
  crack_density_pct?: number;
  ipm_applied?: boolean;
  privacy_blur_applied?: boolean;
}

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
// so a result can only ever surface on the screen that produced it.
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

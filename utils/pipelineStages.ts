import { useSyncExternalStore } from 'react';

// The six pipeline stages, carried from the result screen to /process.
//
// Kept under its own sessionStorage key rather than folded into
// [pendingAnalysis]. Six JPEG frames add roughly 270KB, and pendingAnalysis is
// what carries a finished scan into the report flow -- if the stages push that
// payload past the browser's quota, the user loses a 25-second analysis to a
// feature they may never open. Separate keys mean the stages can fail to save
// on their own, and everything else still works.

export interface PipelineStage {
  key: string;
  /** "Road Detection" */
  title: string;
  /** One line: what the step is for. */
  summary: string;
  /** What actually happened to this image, with the numbers. */
  detail: string;
  /** data:image/jpeg;base64,… */
  image: string;
}

interface StagePayload {
  stages: PipelineStage[];
  /**
   * The result screen these frames came from, path and query included.
   *
   * Stored rather than inferred, because there are two of them -- a scan ends
   * on /upload-media/result and a report on /report-damage/result -- and the
   * report's address, latitude and longitude live in its query string, so
   * returning to a bare path would drop the location the user just pinned.
   *
   * Recorded here instead of relying on history.back(), which follows whatever
   * the user did last rather than where this page came from, and which has
   * nowhere to go if /process is opened directly or reloaded.
   */
  returnTo: string;
}

const KEY = 'oasys.pipelineStages';

export function savePipelineStages(
  stages: PipelineStage[] | undefined,
  returnTo: string
): void {
  try {
    if (!stages?.length) {
      sessionStorage.removeItem(KEY);
    } else {
      const payload: StagePayload = { stages, returnTo };
      sessionStorage.setItem(KEY, JSON.stringify(payload));
    }
    emit();
  } catch {
    // Over quota, or private mode. The result screen hides the entry point
    // rather than offering a page that would open empty.
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* nothing left to do */
    }
    emit();
  }
}

/** Parse a raw snapshot. Returns null for anything malformed or empty. */
export function parseStagePayload(raw: string | null): StagePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StagePayload;
    if (!Array.isArray(parsed?.stages) || parsed.stages.length === 0) return null;
    return {
      stages: parsed.stages,
      // A stored value from an older shape, or a tampered one, must not become
      // an open redirect. Only same-site absolute paths are accepted.
      returnTo:
        typeof parsed.returnTo === 'string' &&
        parsed.returnTo.startsWith('/') &&
        !parsed.returnTo.startsWith('//')
          ? parsed.returnTo
          : '/',
    };
  } catch {
    return null;
  }
}

// Same external-store pattern as pendingAnalysis: read through
// useSyncExternalStore so there is no effect writing state on mount, and so the
// server snapshot is explicit rather than a hydration mismatch waiting to
// happen.
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

function hasStages(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** The server has no sessionStorage, so it always reports "nothing stored". */
const getServerSnapshot = () => false;

/** True when a finished analysis left its stage frames behind. */
export function useHasPipelineStages(): boolean {
  return useSyncExternalStore(subscribe, hasStages, getServerSnapshot);
}

// The RAW string, not the parsed object. getSnapshot must return a value that
// is referentially stable between calls or useSyncExternalStore re-renders
// forever; JSON.parse hands back a new object every time. Callers parse it
// themselves, memoised on this string.
function rawSnapshot(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const rawServerSnapshot = (): string | null => null;

export function usePipelineStagesRaw(): string | null {
  return useSyncExternalStore(subscribe, rawSnapshot, rawServerSnapshot);
}

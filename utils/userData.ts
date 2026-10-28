'use client';

// Data for the signed-in reporter's Home dashboard.
//
// Same shape as utils/adminData: one light query of the user's reports (no
// photos -- image_url is a base64 data URL and is what made My reports slow),
// photos only for the three newest, and the first page of captures still
// waiting to be reported. Kept in memory per user, so returning to Home shows
// the last copy at once and refreshes it in the background.

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { listCaptures, signedUrls, type CapturedDistress } from '@/utils/captures';

export interface UserReport {
  id: number | string;
  uploadtime: string | null;
  damage_type: string | null;
  severity: string | null;
  corrected_damage_type: string | null;
  corrected_severity: string | null;
  corrected_at: string | null;
  state: string | null;
  address: string | null;
  barangay: string | null;
  lat: number | null;
  lng: number | null;
}

export interface UserSummary {
  /** Every report the user filed, newest first. */
  reports: UserReport[];
  /** Photos of the newest few reports, keyed by report id. */
  images: Record<string, string>;
  /** First page of captures not yet reported, newest first. */
  captures: CapturedDistress[];
  capturesWaiting: number;
  /** Signed thumbnail URLs, keyed by storage path. */
  thumbs: Record<string, string>;
}

const COLUMNS =
  'id, uploadtime, damage_type, severity, corrected_damage_type, corrected_severity, corrected_at, state, address, barangay, lat, lng';
const RECENT_WITH_PHOTOS = 3;
const FRESH_MS = 30_000;

const cache = new Map<string, { data: UserSummary; at: number }>();
const inflight = new Map<string, Promise<UserSummary>>();

export function loadUserSummary(userId: string): Promise<UserSummary> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < FRESH_MS) return Promise.resolve(hit.data);
  const pending = inflight.get(userId);
  if (pending) return pending;

  const request = (async () => {
    const [reports, photos, captures] = await Promise.all([
      supabase.from('FileUpload').select(COLUMNS).eq('userid', userId).order('uploadtime', { ascending: false }),
      supabase
        .from('FileUpload')
        .select('id, image_url')
        .eq('userid', userId)
        .order('uploadtime', { ascending: false })
        .limit(RECENT_WITH_PHOTOS),
      listCaptures(userId, { reported: false, page: 1 }).catch(() => ({ rows: [], total: 0 })),
    ]);
    if (reports.error) throw new Error(reports.error.message);

    const images: Record<string, string> = {};
    for (const row of (photos.data ?? []) as { id: number | string; image_url: string | null }[]) {
      if (row.image_url) images[String(row.id)] = row.image_url;
    }

    const thumbs = await signedUrls(captures.rows.slice(0, 6).map((c) => c.image_path)).catch(() => ({}));

    const data: UserSummary = {
      reports: (reports.data ?? []) as UserReport[],
      images,
      captures: captures.rows,
      capturesWaiting: captures.total,
      thumbs,
    };
    cache.set(userId, { data, at: Date.now() });
    return data;
  })().finally(() => inflight.delete(userId));

  inflight.set(userId, request);
  return request;
}

/** The summary for `userId`: last known copy immediately, then the fresh one. */
export function useUserSummary(userId: string | null): {
  data: UserSummary | null;
  error: string | null;
} {
  const [state, setState] = useState<{ for: string | null; data: UserSummary | null; error: string | null }>(
    () => ({ for: userId, data: userId ? cache.get(userId)?.data ?? null : null, error: null })
  );

  useEffect(() => {
    if (!userId) return;
    let live = true;
    loadUserSummary(userId)
      .then((data) => live && setState({ for: userId, data, error: null }))
      .catch((e: Error) => live && setState((s) => ({ ...s, for: userId, error: e.message })));
    return () => {
      live = false;
    };
  }, [userId]);

  // A different user than the one the state was loaded for: show their cached
  // copy (or nothing) rather than the previous account's numbers.
  if (state.for !== userId) {
    return { data: userId ? cache.get(userId)?.data ?? null : null, error: null };
  }
  return { data: state.data, error: state.error };
}

// TEMP (tour screenshots) -- remove.
export function __primeUserSummary(userId: string, data: UserSummary) {
  cache.set(userId, { data, at: Date.now() + 1e9 });
}

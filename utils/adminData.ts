'use client';

// Data shared by the admin Console and Dashboard.
//
// Both pages used to fetch on their own, and only after app/admin/layout.tsx
// had finished its role check, which itself waited on an auth-server round
// trip. Opening the Console cost five requests in a row before any number
// showed. Now:
//   - one light query of every report (no photos, no bulletins) serves both
//     pages, plus a head-only count of accounts;
//   - the layout starts that query at the same time as its role check, so it
//     is usually done by the time the page mounts;
//   - the result is kept in memory, so moving between Console and Dashboard
//     shows the last data at once and refreshes it in the background.

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';

export interface ReportSummary {
  id: number | string;
  damage_type: string | null;
  severity: string | null;
  corrected_severity: string | null;
  state: string | null;
  uploadtime: string | null;
  address: string | null;
  crack_density_pct: number | null;
  corrected_at: string | null;
}

export interface AdminSummary {
  /** Every report, newest first. */
  reports: ReportSummary[];
  userCount: number;
}

const COLUMNS =
  'id, damage_type, severity, corrected_severity, state, uploadtime, address, crack_density_pct, corrected_at';
/** Younger than this is served from memory without asking again. */
const FRESH_MS = 30_000;

let cached: { data: AdminSummary; at: number } | null = null;
let inflight: Promise<AdminSummary> | null = null;

/** The summary, from memory when fresh; concurrent callers share one request. */
export function loadAdminSummary(): Promise<AdminSummary> {
  if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.data);
  if (inflight) return inflight;

  inflight = (async () => {
    const [reports, users] = await Promise.all([
      supabase.from('FileUpload').select(COLUMNS).order('uploadtime', { ascending: false }),
      supabase.from('UserDetail').select('id', { count: 'exact', head: true }),
    ]);
    if (reports.error) throw new Error(reports.error.message);
    const data: AdminSummary = {
      reports: (reports.data ?? []) as ReportSummary[],
      userCount: users.count ?? 0,
    };
    cached = { data, at: Date.now() };
    return data;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Drop the cached summary after a change, so the next view fetches it again. */
export function invalidateAdminSummary() {
  cached = null;
}

/**
 * The summary for a page: the last known copy immediately (even if stale),
 * then the fresh one once it arrives.
 */
export function useAdminSummary(): { data: AdminSummary | null; error: string | null } {
  const [data, setData] = useState<AdminSummary | null>(() => cached?.data ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadAdminSummary().then(
      (fresh) => alive && setData(fresh),
      (err) => alive && setError(err instanceof Error ? err.message : 'Could not load reports.')
    );
    return () => {
      alive = false;
    };
  }, []);

  return { data, error };
}

/** Who is signed in to the console, resolved once by the admin layout. */
export interface AdminSession {
  userId: string;
  username: string | null;
}

export const AdminSessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession | null {
  return useContext(AdminSessionContext);
}

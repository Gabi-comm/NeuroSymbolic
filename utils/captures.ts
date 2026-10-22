'use client';

// Captured Distress: photos taken on the road now and reported later.
//
// The photo is downscaled the same way a report's is (pendingScan) and stored
// in the private "captures" bucket under the reporter's own folder, which is
// what the storage policies in migration section G check. The row records
// where the photo was taken at the moment of capture, so a report filed hours
// later from a desk still carries the location of the damage, not of the desk.

import { supabase } from '@/utils/supabase';
import { downscaleToDataUrl } from '@/utils/pendingScan';
import type { LocationFix, LocationSource, PavementType } from '@/utils/reportLocation';
import type { GeocodeResult } from '@/app/api/geocode/route';

export const CAPTURE_BUCKET = 'captures';
const TABLE = 'captured_distress';
/** Signed thumbnail links outlive a browsing session but not much more. */
const SIGNED_URL_TTL_S = 60 * 60;

export interface CapturedDistress {
  id: string;
  user_id: string;
  image_path: string;
  file_name: string | null;
  lat: number;
  lng: number;
  location_accuracy_m: number | null;
  location_source: LocationSource;
  address: string | null;
  barangay: string | null;
  road_name: string | null;
  road_class: 'national' | 'city' | null;
  surface: PavementType | null;
  captured_at: string;
  reported_at: string | null;
}

async function geocode(lat: number, lng: number): Promise<Partial<GeocodeResult>> {
  try {
    const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
    return res.ok ? await res.json() : {};
  } catch {
    // The capture matters more than its address; it can be looked up again.
    return {};
  }
}

/** Upload the photo, then record it. A failed insert removes the upload. */
export async function saveCapture(
  file: File,
  fix: LocationFix,
  userId: string
): Promise<CapturedDistress> {
  const dataUrl = await downscaleToDataUrl(file);
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${userId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(CAPTURE_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (uploadError) throw new Error(uploadError.message);

  const place = await geocode(fix.lat, fix.lng);
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      image_path: path,
      file_name: file.name,
      lat: fix.lat,
      lng: fix.lng,
      location_accuracy_m: fix.accuracy_m,
      location_source: fix.source,
      address: place.address ?? null,
      barangay: place.barangay ?? null,
      road_name: place.road_name ?? null,
      road_class: place.road_class ?? null,
      surface: place.surface ?? null,
    })
    .select()
    .single();

  if (error) {
    await supabase.storage.from(CAPTURE_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return data as CapturedDistress;
}

/** The signed-in reporter's captures, newest first (RLS scopes the rows). */
export async function listCaptures(userId: string): Promise<CapturedDistress[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CapturedDistress[];
}

/** Short-lived links for the thumbnails, keyed by storage path. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage
    .from(CAPTURE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_S);
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}

export async function deleteCapture(capture: CapturedDistress): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', capture.id);
  if (error) throw new Error(error.message);
  // The row is what the list shows; an orphaned object is only storage.
  await supabase.storage.from(CAPTURE_BUCKET).remove([capture.image_path]);
}

/** One capture and its photo as a File, ready for the report flow. */
export async function loadCapture(id: string): Promise<{ capture: CapturedDistress; file: File }> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error || !data) throw new Error(error?.message ?? 'That capture was not found.');
  const capture = data as CapturedDistress;

  const { data: blob, error: downloadError } = await supabase.storage
    .from(CAPTURE_BUCKET)
    .download(capture.image_path);
  if (downloadError || !blob) {
    throw new Error(downloadError?.message ?? 'The captured photo could not be loaded.');
  }

  const file = new File([blob], capture.file_name ?? 'captured-distress.jpg', {
    type: blob.type || 'image/jpeg',
  });
  return { capture, file };
}

/** Called once the report filed from this capture has been submitted. */
export async function markCaptureReported(id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ reported_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export function captureFix(capture: CapturedDistress): LocationFix {
  return {
    lat: capture.lat,
    lng: capture.lng,
    accuracy_m: capture.location_accuracy_m,
    source: capture.location_source,
  };
}

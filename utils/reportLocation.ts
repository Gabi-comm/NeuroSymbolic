// Where a report is, how that was established, and what kind of road it is on.
//
// Location sources, most trusted first:
//   photo_exif  GPS the camera wrote into the photo at the moment of capture
//   device_gps  the browser's Geolocation API, read when the photo is added
//   manual_pin  the reporter placed or dragged the pin themselves
//
// EXIF wins over device GPS because it describes where the photo was taken,
// not where the reporter is when they upload it. It is a bonus rather than the
// main source: Messenger, Facebook and some Android pickers strip it.
//
// Geolocation needs a secure context. localhost is exempt, a LAN address over
// plain http is not -- the browser refuses without even asking.

import exifr from 'exifr';

export type LocationSource = 'device_gps' | 'photo_exif' | 'manual_pin';
export type PavementType = 'concrete' | 'asphalt';

export interface LocationFix {
  lat: number;
  lng: number;
  /** Radius of uncertainty in metres; null when unknown (EXIF, manual pin). */
  accuracy_m: number | null;
  source: LocationSource;
}

export interface ReportContext extends LocationFix {
  address: string | null;
  barangay: string | null;
  road_name: string | null;
  road_class: 'national' | 'city' | null;
  pavement_type: PavementType;
  /** The Captured Distress row this report was filed from, if any. */
  capture_id?: string | null;
}

/** The study area's main segment, Samson Road near UE Caloocan. */
export const DEFAULT_CENTER = { lat: 14.6566, lng: 120.9796 };

/**
 * Samson Road (N120) is a concrete national road, so concrete is the default
 * when OpenStreetMap has no surface tag.
 */
export const DEFAULT_PAVEMENT: PavementType = 'concrete';

/** GPS embedded in the photo, or null. Must run on the original file: the
 *  canvas downscale in pendingScan strips all metadata. */
export async function readExifLocation(file: File): Promise<LocationFix | null> {
  try {
    const gps = await exifr.gps(file);
    if (!gps || !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) return null;
    // (0, 0) is what some cameras write when they had no fix.
    if (gps.latitude === 0 && gps.longitude === 0) return null;
    return { lat: gps.latitude, lng: gps.longitude, accuracy_m: null, source: 'photo_exif' };
  } catch {
    return null;
  }
}

/** The device's current position, or a reason it could not be read. */
export function readDeviceLocation(): Promise<LocationFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This browser cannot read your location. Drop the pin on the map.'));
      return;
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(new Error('Location needs a secure (https) connection. Drop the pin on the map.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: Math.round(pos.coords.accuracy),
          source: 'device_gps',
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied. Drop the pin on the map.'
              : 'Could not get a GPS fix. Drop the pin on the map.'
          )
        ),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    );
  });
}

// ---------------------------------------------------------------------------
// The context travels to /report-damage/result in the query string. /process
// returns to that exact URL, so the query is what survives the round trip.
// ---------------------------------------------------------------------------

const KEYS = {
  lat: 'lat', lng: 'lng', accuracy_m: 'acc', source: 'src', address: 'address',
  barangay: 'brgy', road_name: 'road', road_class: 'cls', pavement_type: 'pav',
  capture_id: 'cap',
} as const;

export function toQuery(ctx: ReportContext): Record<string, string> {
  const q: Record<string, string> = {};
  for (const [field, key] of Object.entries(KEYS)) {
    const value = ctx[field as keyof ReportContext];
    if (value !== null && value !== undefined) q[key] = String(value);
  }
  return q;
}

export function fromQuery(params: URLSearchParams): ReportContext | null {
  const lat = Number(params.get(KEYS.lat));
  const lng = Number(params.get(KEYS.lng));
  if (!params.get(KEYS.lat) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const src = params.get(KEYS.source);
  const cls = params.get(KEYS.road_class);
  const pav = params.get(KEYS.pavement_type);
  const acc = params.get(KEYS.accuracy_m);

  return {
    lat,
    lng,
    accuracy_m: acc && Number.isFinite(Number(acc)) ? Number(acc) : null,
    source: src === 'device_gps' || src === 'photo_exif' ? src : 'manual_pin',
    address: params.get(KEYS.address),
    barangay: params.get(KEYS.barangay),
    road_name: params.get(KEYS.road_name),
    road_class: cls === 'national' || cls === 'city' ? cls : null,
    pavement_type: pav === 'asphalt' ? 'asphalt' : 'concrete',
    capture_id: params.get(KEYS.capture_id),
  };
}

export const SOURCE_LABEL: Record<LocationSource, string> = {
  photo_exif: 'From photo GPS',
  device_gps: 'From device GPS',
  manual_pin: 'Pinned by hand',
};

import { NextResponse } from 'next/server';

// Server-side reverse geocoding for a report location.
//
// Nominatim is free but fair-use: about one request per second and an
// identifying User-Agent, which a browser cannot set. Every browser used to call
// nominatim.openstreetmap.org directly on each tap. Routing through here sets
// the header once and caches by rounded coordinates, so re-dropping a pin on
// the same spot costs nothing.
//
// One call answers everything: at zoom 17 the reverse lookup snaps to the
// nearest street, and extratags=1 returns that street's own OSM tags -- its
// highway class and, where mapped, its surface. The surface pre-fills pavement
// type, which decides whether a concrete or an asphalt repair is recommended.
// OSM surface tags in Caloocan are incomplete, so the reporter can always
// override it. (Overpass was tried first; its public servers did not answer
// from the development network, and this needs no second service.)

const USER_AGENT = 'OASYS-road-defect-thesis/1.0 (UE Caloocan; contact via repo)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

// ~11 m at 4 decimal places: close enough to share an address and a road.
const CACHE_DECIMALS = 4;
const CACHE_MAX = 500;

export type PavementGuess = 'concrete' | 'asphalt' | null;

export interface GeocodeResult {
  address: string | null;
  barangay: string | null;
  road_name: string | null;
  /** 'national' or 'city'; null when the point did not snap to a road. */
  road_class: 'national' | 'city' | null;
  /** From the OSM surface tag; null when untagged or ambiguous ("paved"). */
  surface: PavementGuess;
}

const cache = new Map<string, GeocodeResult>();

function surfaceToPavement(surface: string | undefined): PavementGuess {
  if (!surface) return null;
  if (surface.startsWith('concrete')) return 'concrete';
  if (surface === 'asphalt') return 'asphalt';
  return null;
}

// DPWH national roads carry an N-route ref in OSM (Samson Road is N120);
// trunk and primary roads in Metro Manila are national as well.
function roadClass(highway: string, ref: string | undefined): 'national' | 'city' {
  if (/^N\d+/.test(ref ?? '')) return 'national';
  if (highway === 'trunk' || highway === 'primary') return 'national';
  return 'city';
}

// Philippine barangays land in different OSM keys depending on who mapped
// them, and "suburb" is often a district name (Grace Park West) rather than a
// barangay. Prefer a value that names itself a barangay.
function pickBarangay(a: Record<string, string>): string | null {
  const candidates = [a.quarter, a.neighbourhood, a.village, a.suburb].filter(Boolean);
  return candidates.find((v) => /^(barangay|brgy\.?)\s/i.test(v)) ?? candidates[0] ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));

  if (
    !searchParams.get('lat') || !searchParams.get('lng') ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    Math.abs(lat) > 90 || Math.abs(lng) > 180
  ) {
    return NextResponse.json({ error: 'lat and lng are required.' }, { status: 400 });
  }

  const key = `${lat.toFixed(CACHE_DECIMALS)},${lng.toFixed(CACHE_DECIMALS)}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json(hit);

  try {
    const url =
      `${NOMINATIM}?format=jsonv2&addressdetails=1&extratags=1&zoom=17` +
      `&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = await res.json();

    const a: Record<string, string> = data?.address ?? {};
    const tags: Record<string, string> = data?.extratags ?? {};
    const onRoad = data?.category === 'highway';

    const result: GeocodeResult = {
      address: data?.display_name ?? null,
      barangay: pickBarangay(a),
      road_name: (onRoad ? data?.name : null) || a.road || null,
      road_class: onRoad ? roadClass(data.type, tags.ref) : null,
      surface: onRoad ? surfaceToPavement(tags.surface) : null,
    };

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return NextResponse.json(result);
  } catch (error) {
    // Not cached, so a transient outage is retried on the next pin. The
    // report still works: the coordinates are what matter.
    console.error('Geocode error:', error);
    return NextResponse.json(
      { address: null, barangay: null, road_name: null, road_class: null, surface: null },
      { status: 200 }
    );
  }
}

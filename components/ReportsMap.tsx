'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { toSeverity } from './Severity';

export interface MapReport {
  id: number | string;
  lat: number | null;
  lng: number | null;
  damage_type: string | null;
  severity: string | null;
  state: string | null;
  address: string | null;
}

/** Caloocan City — the study area, used when no report has coordinates yet. */
const DEFAULT_CENTRE: [number, number] = [14.6566, 120.9796];

const PIN_COLOUR: Record<string, string> = {
  Low: '#16a34a',
  Medium: '#fbbf24',
  High: '#dc2626',
};

/**
 * Pins carry a glyph as well as a colour, matching the severity vocabulary used
 * everywhere else: a map read at a glance is exactly where colour-only encoding
 * fails hardest.
 */
const PIN_GLYPH: Record<string, string> = {
  Low: '&#9679;', // circle
  Medium: '&#9650;', // triangle
  High: '&#9632;', // square
};

function pinFor(severity: string | null, tracked = false) {
  const key = toSeverity(severity) ?? 'Low';
  const colour = PIN_COLOUR[key];
  const glyph = PIN_GLYPH[key];
  const ink = key === 'Medium' ? '#000' : '#fff';
  // The tracked report is bigger and ringed in OASYS blue, so it stands out
  // from neighbours of the same severity.
  const size = tracked ? 36 : 26;
  const ring = tracked
    ? 'box-shadow:0 0 0 4px #3b82f6,0 0 0 9px rgba(59,130,246,.35),0 2px 6px rgba(0,0,0,.5);'
    : 'box-shadow:0 2px 6px rgba(0,0,0,.5);';

  return L.divIcon({
    className: 'oasys-pin',
    html:
      `<div style="background:${colour};color:${ink};width:${size}px;height:${size}px;` +
      `border-radius:999px;border:3px solid #fff;${ring}` +
      `display:flex;align-items:center;justify-content:center;font-size:${tracked ? 14 : 11}px;` +
      `line-height:1;font-weight:700">${glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const hasCoords = (r: MapReport) =>
  typeof r.lat === 'number' &&
  typeof r.lng === 'number' &&
  Number.isFinite(r.lat) &&
  Number.isFinite(r.lng);

/** Fly to the tracked report and open its popup. `nonce` re-runs it for the same report. */
function FollowTracked({
  report,
  nonce,
  markers,
}: {
  report: MapReport | null;
  nonce: number;
  markers: React.RefObject<Record<string, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!report || !hasCoords(report)) return;
    // Street level, kept below where tile coverage thins out and the map
    // turns grey.
    map.flyTo([report.lat as number, report.lng as number], 17, { duration: 0.8 });
    map.once('moveend', () => markers.current[String(report.id)]?.openPopup());
  }, [map, report, nonce, markers]);
  return null;
}

export default function ReportsMap({
  reports,
  trackedId = null,
  trackNonce = 0,
}: {
  reports: MapReport[];
  /** The report the "Track report" button pointed at, if any. */
  trackedId?: string | null;
  trackNonce?: number;
}) {
  const located = reports.filter(hasCoords);
  const markers = useRef<Record<string, L.Marker>>({});
  const tracked = located.find((r) => String(r.id) === trackedId) ?? null;

  const centre: [number, number] = located.length
    ? [
        located.reduce((sum, r) => sum + (r.lat as number), 0) / located.length,
        located.reduce((sum, r) => sum + (r.lng as number), 0) / located.length,
      ]
    : DEFAULT_CENTRE;

  return (
    <div className="relative">
      <MapContainer
        center={centre}
        zoom={located.length ? 15 : 13}
        scrollWheelZoom={false}
        className="w-full h-[22rem] sm:h-[30rem] rounded-2xl z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <FollowTracked report={tracked} nonce={trackNonce} markers={markers} />

        {located.map((report) => (
          <Marker
            key={report.id}
            position={[report.lat as number, report.lng as number]}
            icon={pinFor(report.severity, String(report.id) === trackedId)}
            zIndexOffset={String(report.id) === trackedId ? 1000 : 0}
            ref={(marker) => {
              if (marker) markers.current[String(report.id)] = marker;
              else delete markers.current[String(report.id)];
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                  RPT-{String(report.id).slice(0, 8).toUpperCase()}
                </p>
                <p className="font-black mb-0.5">
                  {report.damage_type || 'Unclassified'}
                </p>
                <p className="mb-1">
                  Severity: <strong>{report.severity || 'Unknown'}</strong>
                  {' · '}
                  {report.state || 'Needs Action'}
                </p>
                {report.address && (
                  <p className="text-xs text-zinc-600 leading-snug">{report.address}</p>
                )}
                <p className="text-xs text-zinc-600 tabular-nums mt-1">
                  {Number(report.lat).toFixed(6)}, {Number(report.lng).toFixed(6)}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {tracked && (
        <p className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] text-xs font-bold text-white bg-oasys-blue/90 px-4 py-2 rounded-full shadow-lg tabular-nums whitespace-nowrap">
          Tracking RPT-{String(tracked.id).slice(0, 8).toUpperCase()} ·{' '}
          {Number(tracked.lat).toFixed(6)}, {Number(tracked.lng).toFixed(6)}
        </p>
      )}

      {located.length === 0 && (
        <p className="absolute inset-x-0 bottom-4 text-center text-xs font-bold text-white bg-black/70 mx-auto w-max px-4 py-2 rounded-full">
          No reports have coordinates yet
        </p>
      )}
    </div>
  );
}

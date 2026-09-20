'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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

function pinFor(severity: string | null) {
  const key = toSeverity(severity) ?? 'Low';
  const colour = PIN_COLOUR[key];
  const glyph = PIN_GLYPH[key];
  const ink = key === 'Medium' ? '#000' : '#fff';

  return L.divIcon({
    className: 'oasys-pin',
    html:
      `<div style="background:${colour};color:${ink};width:26px;height:26px;` +
      `border-radius:999px;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);` +
      `display:flex;align-items:center;justify-content:center;font-size:11px;` +
      `line-height:1;font-weight:700">${glyph}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export default function ReportsMap({ reports }: { reports: MapReport[] }) {
  const located = reports.filter(
    (r) =>
      typeof r.lat === 'number' &&
      typeof r.lng === 'number' &&
      Number.isFinite(r.lat) &&
      Number.isFinite(r.lng)
  );

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
        />

        {located.map((report) => (
          <Marker
            key={report.id}
            position={[report.lat as number, report.lng as number]}
            icon={pinFor(report.severity)}
          >
            <Popup>
              <div className="text-sm">
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
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {located.length === 0 && (
        <p className="absolute inset-x-0 bottom-4 text-center text-xs font-bold text-white bg-black/70 mx-auto w-max px-4 py-2 rounded-full">
          No reports have coordinates yet
        </p>
      )}
    </div>
  );
}

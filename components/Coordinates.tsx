// Latitude and longitude of where the photo was taken, shown beside the
// address everywhere a report appears. The address is a lookup and can be
// vague or missing; the coordinates are what was actually recorded.

interface Props {
  lat: number | null | undefined;
  lng: number | null | undefined;
  /** Surface the text sits on. Controls contrast, not meaning. */
  tone?: 'dark' | 'light';
  className?: string;
}

export default function Coordinates({ lat, lng, tone = 'dark', className = '' }: Props) {
  const valid = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);
  const label = tone === 'dark' ? 'text-fg' : 'text-fg';
  const muted = tone === 'dark' ? 'text-fg-muted' : 'text-fg-muted';
  const link = tone === 'dark' ? 'text-oasys-blue' : 'text-blue-700';

  if (!valid) {
    return <p className={`text-xs ${muted} ${className}`}>Coordinates not recorded</p>;
  }

  return (
    <p className={`text-xs ${muted} tabular-nums flex flex-wrap gap-x-3 gap-y-0.5 ${className}`}>
      <span>
        <span className={`font-bold ${label}`}>Latitude: </span>
        {lat.toFixed(6)}
      </span>
      <span>
        <span className={`font-bold ${label}`}>Longitude: </span>
        {lng.toFixed(6)}
      </span>
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=19/${lat}/${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`font-bold ${link} hover:underline`}
      >
        Open map
      </a>
    </p>
  );
}

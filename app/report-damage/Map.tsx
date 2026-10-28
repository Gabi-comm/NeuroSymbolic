'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { DEFAULT_CENTER } from '@/utils/reportLocation';

export interface Position {
  lat: number;
  lng: number;
}

interface MapProps {
  /** null until a location is known: no pin is drawn. */
  position: Position | null;
  /** GPS uncertainty in metres, drawn as a circle; null hides it. */
  accuracyM: number | null;
  /** The reporter tapped the map or dragged the pin. */
  onPick: (pos: Position) => void;
}

const customRedPin = L.divIcon({
  className: 'custom-pin',
  html: '<div class="w-8 h-8 bg-red-600 rounded-full border-4 border-white shadow-lg"></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

function ClickToPin({ onPick }: Pick<MapProps, 'onPick'>) {
  useMapEvents({
    click(e: L.LeafletMouseEvent) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// MapContainer's center is only read on mount, so a GPS fix that arrives later
// has to move the view explicitly.
function FollowPosition({ position }: Pick<MapProps, 'position'>) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 18));
  }, [map, position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function Map({ position, accuracyM, onPick }: MapProps) {
  // Dragging is how a reporter corrects a GPS fix; the handler object is
  // memoised so react-leaflet does not rebind it on every render.
  const markerEvents = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const { lat, lng } = (e.target as L.Marker).getLatLng();
        onPick({ lat, lng });
      },
    }),
    [onPick]
  );

  return (
    <MapContainer
      center={position ? [position.lat, position.lng] : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
      zoom={16}
      className="w-full h-full rounded-2xl z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickToPin onPick={onPick} />
      <FollowPosition position={position} />
      {position && accuracyM != null && (
        <Circle
          center={[position.lat, position.lng]}
          radius={accuracyM}
          pathOptions={{ color: '#4f75e0', weight: 1, fillOpacity: 0.12 }}
        />
      )}
      {position && (
        <Marker
          position={[position.lat, position.lng]}
          icon={customRedPin}
          draggable
          eventHandlers={markerEvents}
        />
      )}
    </MapContainer>
  );
}

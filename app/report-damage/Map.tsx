'use client';

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export interface Position {
  lat: number;
  lng: number;
}

interface MapProps {
  position: Position;
  setPosition: (pos: Position) => void;
  fetchAddress: (lat: number, lng: number) => void;
}

// Custom Tailwind Pin
const customRedPin = L.divIcon({
  className: 'custom-pin',
  html: '<div class="w-8 h-8 bg-red-600 rounded-full border-4 border-white shadow-lg animate-bounce"></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Click Handler Component
function MapClickHandler({ position, setPosition, fetchAddress }: MapProps) {
  useMapEvents({
    click(e: L.LeafletMouseEvent) {
      const { lat, lng } = e.latlng;
      setPosition({ lat, lng });
      fetchAddress(lat, lng);
    },
  });

  return position ? <Marker position={[position.lat, position.lng]} icon={customRedPin} /> : null;
}

// Main Map Component
export default function Map({ position, setPosition, fetchAddress }: MapProps) {
  const defaultCenter: [number, number] = [14.6566, 120.9796]; 

  return (
    <MapContainer 
      center={position ? [position.lat, position.lng] : defaultCenter} 
      zoom={16} 
      className="w-full h-full rounded-2xl z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler position={position} setPosition={setPosition} fetchAddress={fetchAddress} />
    </MapContainer>
  );
}
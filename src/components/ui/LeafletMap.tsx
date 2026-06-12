import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icons in Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description?: string;
  dayIndex?: number; // Used for coloring different days
}

interface LeafletMapProps {
  points: MapPoint[];
  height?: string;
  className?: string;
}

// Custom hook to automatically adjust bounds to fit all points
const FitBounds = ({ points }: { points: MapPoint[] }) => {
  const map = useMap();

  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [points, map]);

  return null;
};

const DAY_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export function LeafletMap({ points, height = '400px', className = '' }: LeafletMapProps) {
  // If no points, show a default global view (e.g., Europe)
  const defaultCenter: [number, number] = points.length > 0 ? [points[0].lat, points[0].lng] : [48.8566, 2.3522];
  
  // Group points by dayIndex to draw separate polylines
  const polylinesByDay: Record<number, [number, number][]> = {};
  points.forEach(p => {
    const day = p.dayIndex || 0;
    if (!polylinesByDay[day]) polylinesByDay[day] = [];
    polylinesByDay[day].push([p.lat, p.lng]);
  });

  return (
    <div className={`relative rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700 z-10 ${className}`} style={{ height }}>
      <MapContainer 
        center={defaultCenter} 
        zoom={12} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%', zIndex: 1 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {points.map(point => {
          const color = DAY_COLORS[(point.dayIndex || 0) % DAY_COLORS.length];
          // We can use standard markers, but color styling needs a custom divIcon if we want to match exactly
          const customIcon = L.divIcon({
            className: 'custom-map-marker',
            html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12]
          });

          return (
            <Marker key={point.id} position={[point.lat, point.lng]} icon={customIcon}>
              <Popup>
                <div className="text-start" dir="auto">
                  <h3 className="font-bold text-sm mb-1">{point.title}</h3>
                  {point.description && <p className="text-xs text-slate-600">{point.description}</p>}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {Object.entries(polylinesByDay).map(([dayIdx, latlngs]) => {
          const color = DAY_COLORS[parseInt(dayIdx) % DAY_COLORS.length];
          return (
            <Polyline 
              key={`line-${dayIdx}`} 
              positions={latlngs} 
              pathOptions={{ color, weight: 4, opacity: 0.7, dashArray: '8, 8' }} 
            />
          );
        })}

        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}

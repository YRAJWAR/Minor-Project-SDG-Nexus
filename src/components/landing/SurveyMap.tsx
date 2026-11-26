'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, useMap } from 'react-leaflet';

export interface MapPoint { district: string; state: string; lat: number; lng: number; count: number; open: number }

const BOUNDS: [[number, number], [number, number]] = [[8, 69], [35, 96]];
const MERIDIANS = [70, 75, 80, 85, 90, 95];
const PARALLELS = [10, 15, 20, 25, 30, 35];

// Degree labels on the sheet's frame, placed where each graticule line meets the edge.
function FrameLabels() {
    const map = useMap();
    const [, tick] = useState(0);
    useEffect(() => {
        const redraw = () => tick((n) => n + 1);
        map.on('move zoom resize', redraw);
        return () => { map.off('move zoom resize', redraw); };
    }, [map]);
    const size = map.getSize();
    return (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[500] font-[family-name:var(--font-display)] text-[10px] tracking-wide text-[var(--color-ink-soft)]">
            {MERIDIANS.map((lng) => {
                const x = map.latLngToContainerPoint([20, lng]).x;
                return x > 12 && x < size.x - 12 ? <span key={lng} className="absolute bottom-1 -translate-x-1/2" style={{ left: x }}>{lng}°E</span> : null;
            })}
            {PARALLELS.map((lat) => {
                const y = map.latLngToContainerPoint([lat, 80]).y;
                return y > 12 && y < size.y - 12 ? <span key={lat} className="absolute left-1.5 -translate-y-1/2" style={{ top: y }}>{lat}°N</span> : null;
            })}
        </div>
    );
}

// The hero sheet: India with a mark for every district that has reports, sized by how many.
export default function SurveyMap({ points }: { points: MapPoint[] }) {
    const max = Math.max(1, ...points.map((p) => p.count));
    return (
        <MapContainer bounds={BOUNDS} zoomSnap={0.25} scrollWheelZoom={false} zoomControl={false} attributionControl
            className="h-full w-full" style={{ background: 'var(--color-paper)' }}>
            <TileLayer
                className="survey-tiles"
                attribution='Basemap &copy; Esri'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            />
            {MERIDIANS.map((lng) => <Polyline key={`m${lng}`} positions={[[0, lng], [40, lng]]} pathOptions={{ color: '#1f4e8c', weight: 0.6, opacity: 0.35, dashArray: '2 4' }} interactive={false} />)}
            {PARALLELS.map((lat) => <Polyline key={`p${lat}`} positions={[[lat, 60], [lat, 100]]} pathOptions={{ color: '#1f4e8c', weight: 0.6, opacity: 0.35, dashArray: '2 4' }} interactive={false} />)}
            {points.map((p) => {
                const r = 5 + Math.sqrt(p.count / max) * 13;
                return (
                    <CircleMarker key={`${p.state}-${p.district}`} center={[p.lat, p.lng]} radius={r}
                        pathOptions={{ color: '#16212c', weight: 1, fillColor: p.open > 0 ? '#b7791f' : '#2f5d3a', fillOpacity: 0.82 }}>
                        <Tooltip direction="top" offset={[0, -r]}>
                            <strong>{p.district}</strong>, {p.state}<br />{p.count} reported · {p.open} open
                        </Tooltip>
                    </CircleMarker>
                );
            })}
            <FrameLabels />
        </MapContainer>
    );
}

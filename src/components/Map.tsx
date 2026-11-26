'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { SDG_INFO, type RegionData } from '@/data/mockData';

const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then((m) => m.CircleMarker), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then((m) => m.Tooltip), { ssr: false });

export type ColorMode =
    | 'composite' | 'funding' | 'beneficiaries' | 'ngo_density' | 'efficiency' | 'sdg' | 'risk' | 'challenge_density';

interface HeatmapProps {
    regions?: RegionData[];
    colorBy: ColorMode;
    selectedSDG?: number;
    showLabels?: boolean;
    intensityScale?: number;
    onSelectDistrict?: (districtName: string) => void;
}

interface DistrictPoint { district: string; state: string | null; count: number; open: number; resolutionRate: number; lat: number | null; lng: number | null }
interface Bubble { key: string; title: string; subtitle: string; lat: number; lng: number; value: number; label: string; district?: string }

// What each mode measures. District modes come from citizen reports; state modes from NGO projects.
const MODES: Record<ColorMode, { title: string; level: 'district' | 'state'; highIsBad: boolean }> = {
    challenge_density: { title: 'Problems reported', level: 'district', highIsBad: true },
    risk: { title: 'Open problems', level: 'district', highIsBad: true },
    composite: { title: 'Resolution rate', level: 'district', highIsBad: false },
    funding: { title: 'Project funding', level: 'state', highIsBad: false },
    beneficiaries: { title: 'People reached', level: 'state', highIsBad: false },
    ngo_density: { title: 'Active NGOs', level: 'state', highIsBad: false },
    efficiency: { title: 'Cost per person reached', level: 'state', highIsBad: true },
    sdg: { title: 'Projects on the selected SDG', level: 'state', highIsBad: false },
};

const inr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(1)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);

// Survey palette: ochre → rust where high needs attention, pale → deep forest where high is good.
function colour(norm: number, highIsBad: boolean) {
    const t = Math.max(0, Math.min(1, norm));
    return highIsBad ? `hsl(${36 - t * 29}, ${71 - t * 13}%, ${42 - t * 3}%)` : `hsl(${130 - t * 1}, ${30 - t * 2}%, ${62 - t * 35}%)`;
}

export default function SDGHeatmap({ regions = [], colorBy = 'challenge_density', selectedSDG, intensityScale = 1, onSelectDistrict }: HeatmapProps) {
    const [points, setPoints] = useState<DistrictPoint[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const mode = MODES[colorBy] ?? MODES.challenge_density;

    useEffect(() => {
        fetch('/api/government/challenge-density')
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => setPoints(j?.data?.density ?? []))
            .catch(() => setPoints([]));
    }, []);

    const bubbles: Bubble[] = useMemo(() => {
        if (mode.level === 'district') {
            return points.filter((p) => p.lat !== null && p.lng !== null).map((p) => {
                const value = colorBy === 'risk' ? p.open : colorBy === 'composite' ? p.resolutionRate : p.count;
                const label = colorBy === 'risk' ? `${p.open} open of ${p.count}` : colorBy === 'composite' ? `${p.resolutionRate}% resolved (${p.count} reported)` : `${p.count} reported, ${p.open} open`;
                return { key: p.district, title: p.district, subtitle: p.state ?? '', lat: p.lat!, lng: p.lng!, value, label, district: p.district };
            });
        }
        return regions.filter((r) => r.lat).map((r) => {
            const value =
                colorBy === 'funding' ? r.funding
                    : colorBy === 'beneficiaries' ? r.beneficiaries
                        : colorBy === 'ngo_density' ? r.ngo_count
                            : colorBy === 'efficiency' ? (r.beneficiaries ? r.funding / r.beneficiaries : 0)
                                : selectedSDG ? (r.primary_sdgs.includes(selectedSDG) ? r.projects : 0) : r.projects;
            const label =
                colorBy === 'funding' ? inr(value)
                    : colorBy === 'beneficiaries' ? `${value.toLocaleString('en-IN')} people`
                        : colorBy === 'ngo_density' ? `${value} NGO${value === 1 ? '' : 's'}`
                            : colorBy === 'efficiency' ? `₹${Math.round(value).toLocaleString('en-IN')} per person`
                                : `${value} project${value === 1 ? '' : 's'}`;
            return { key: r.name, title: r.name, subtitle: `${r.projects} projects · ${r.ngo_count} NGOs`, lat: r.lat, lng: r.lng, value, label };
        });
    }, [points, regions, colorBy, selectedSDG, mode.level]);

    const max = Math.max(1, ...bubbles.map((b) => b.value));

    return (
        <div className="w-full h-[380px] sm:h-[480px] md:h-[560px] overflow-hidden relative border border-[var(--color-rule)]">
            <MapContainer center={[22.5, 80.5]} zoom={5} minZoom={4} style={{ width: '100%', height: '100%' }} scrollWheelZoom>
                <TileLayer
                    className="survey-tiles"
                    attribution='Basemap &copy; Esri'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                />
                {bubbles.map((b) => {
                    const norm = b.value / max;
                    return (
                        <CircleMarker
                            key={`${colorBy}-${b.key}`}
                            center={[b.lat, b.lng]}
                            radius={(mode.level === 'district' ? 7 : 10) + norm * 18 * intensityScale}
                            pathOptions={{
                                fillColor: colour(norm, mode.highIsBad), fillOpacity: 0.78,
                                color: selected === b.key ? '#16212c' : '#fbfcf9', weight: selected === b.key ? 3 : 1.5,
                            }}
                            eventHandlers={{
                                click: () => {
                                    setSelected(b.key);
                                    if (b.district) onSelectDistrict?.(b.district);
                                },
                            }}
                        >
                            <Tooltip direction="top" offset={[0, -6]}>
                                <div style={{ fontFamily: 'inherit' }}>
                                    <strong>{b.title}</strong>{b.subtitle ? <span style={{ color: 'var(--color-ink-muted)' }}> · {b.subtitle}</span> : null}
                                    <div>{b.label}</div>
                                </div>
                            </Tooltip>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            <div className="absolute bottom-4 right-4 z-[1000] border border-[var(--color-ink)] bg-[var(--color-sheet)] px-3 py-2 text-xs text-[var(--color-ink-soft)] max-w-[calc(100%-2rem)]">
                <p className="font-semibold text-slate-900">
                    {mode.title}{colorBy === 'sdg' && selectedSDG ? ` — SDG ${selectedSDG} ${SDG_INFO.find((s) => s.id === selectedSDG)?.name ?? ''}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                    <span>Low</span>
                    <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${colour(0, mode.highIsBad)}, ${colour(1, mode.highIsBad)})` }} />
                    <span>High</span>
                </div>
                <p className="mt-1 text-slate-500">
                    {mode.level === 'district' ? `By district, from citizen reports · ${bubbles.length} districts` : `By state, from NGO projects · ${bubbles.length} states`}
                </p>
            </div>
            {bubbles.length === 0 && (
                <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
                    <p className="bg-white/90 rounded-lg px-4 py-2 text-sm text-slate-600">No data to show for this view yet.</p>
                </div>
            )}
        </div>
    );
}

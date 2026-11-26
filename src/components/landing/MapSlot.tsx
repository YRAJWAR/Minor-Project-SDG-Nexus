'use client';

import dynamic from 'next/dynamic';
import type { MapPoint } from './SurveyMap';

// Leaflet needs the browser, so the map loads on the client; the sheet keeps its size meanwhile.
const SurveyMap = dynamic(() => import('./SurveyMap'), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-[var(--color-paper-deep)]" aria-label="Loading map" />,
});

export default function MapSlot({ points }: { points: MapPoint[] }) {
    return <SurveyMap points={points} />;
}

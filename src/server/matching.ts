// One university-matching formula for every screen (officer suggestions, faculty inbox, routing panel).
// score 0–100 = 40% SDG fit + 25% distance + 15% department fit + 15% track record + 5% spare capacity.
// Every part is shown with its reason; nothing unknown is invented (unknown distance scores 0 and says so).
import prisma from '@/lib/prisma';

export const MATCH_WEIGHTS = { sdg: 40, distance: 25, department: 15, trackRecord: 15, capacity: 5 } as const;
export const MAX_FULL_LOAD = 6; // active projects at which a university gets no spare-capacity credit
export const FIELD_REACH_KM = 800; // teams must be able to visit the site; farther universities are suggested only to fill the list

// Departments that usually work on each kind of problem (matched as words inside department names).
const DEPT_FIT: Record<string, string[]> = {
    'Drinking Water & Sanitation': ['civil', 'environment', 'public health', 'hydrology'],
    'Clean Energy & Power': ['electrical', 'renewable', 'mechanical', 'energy'],
    'Infrastructure & Connectivity': ['civil', 'computer', 'electronics', 'geology'],
    'Rural Healthcare & Nutrition': ['public health', 'biomedical', 'food', 'social work'],
    'Women Empowerment & Livelihood': ['social work', 'food', 'computer'],
    'Education & Digital Literacy': ['computer', 'electronics', 'social work'],
    'Agriculture & Food Security': ['agricultur', 'food', 'hydrology', 'environment'],
    'Forest & Environment': ['environment', 'forestry', 'geology', 'marine'],
};

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6371, rad = Math.PI / 180;
    const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

export interface MatchChallenge { sdgTags: number[]; category: string; lat: number | null; lng: number | null }
export interface MatchUniversity {
    id: string; name: string; district: string; naacGrade?: string | null; departments: string[]; sdgExpertise: number[];
    lat: number | null; lng: number | null; pastPerformanceScore: number | null; activeProjects: number;
}

export function scoreMatch(ch: MatchChallenge, u: MatchUniversity) {
    const sdgMatched = ch.sdgTags.filter((t) => u.sdgExpertise.includes(t));
    const distKm = ch.lat !== null && ch.lng !== null && u.lat !== null && u.lng !== null ? haversineKm({ lat: ch.lat, lng: ch.lng }, { lat: u.lat, lng: u.lng }) : null;
    const fitWords = DEPT_FIT[ch.category] ?? [];
    const fitDepts = u.departments.filter((d) => fitWords.some((w) => d.toLowerCase().includes(w)));
    const parts = {
        sdg: ch.sdgTags.length ? sdgMatched.length / ch.sdgTags.length : 0,
        distance: distKm === null ? 0 : Math.max(0, 1 - distKm / 600), // 600 km or more: no distance credit
        department: fitDepts.length ? 1 : 0,
        trackRecord: u.pastPerformanceScore ?? 0.5, // 0.5 = no resolved project yet (neutral)
        capacity: Math.max(0, 1 - u.activeProjects / MAX_FULL_LOAD),
    };
    const score = Math.round((Object.keys(MATCH_WEIGHTS) as (keyof typeof parts)[]).reduce((s, k) => s + MATCH_WEIGHTS[k] * parts[k], 0));
    const reasons = [
        sdgMatched.length ? `Works on SDG ${sdgMatched.join(', ')}` : 'No SDG overlap',
        distKm === null ? 'Distance unknown' : distKm < 50 ? `Nearby (${Math.round(distKm)} km)` : `${Math.round(distKm)} km away`,
        fitDepts.length ? `Relevant department: ${fitDepts[0]}` : 'No department listed for this kind of problem',
        u.pastPerformanceScore === null ? 'No resolved project yet' : `Track record ${Math.round(u.pastPerformanceScore * 100)}/100 from resolved projects`,
        `${u.activeProjects} active project${u.activeProjects === 1 ? '' : 's'}`,
    ];
    return { score, parts, distKm: distKm === null ? null : Math.round(distKm), sdgMatched, reasons };
}

/** All universities ranked for one report, with each part of the score (shape used by every matching screen). */
export async function rankUniversities(challenge: { sdgTags: number[]; category: string; district: string; state?: string | null; gpsLat: number | null; gpsLng: number | null }, limit?: number) {
    const [heis, centre] = await Promise.all([
        prisma.hEI.findMany({
            select: {
                id: true, name: true, district: true, naacGrade: true, departments: true, sdgExpertise: true, lat: true, lng: true, pastPerformanceScore: true,
                _count: { select: { teams: { where: { proposal: { challenge: { status: { in: ['TEAM_FORMED', 'FUNDED', 'IN_PROGRESS'] } } } } } } },
            },
        }),
        challenge.gpsLat !== null && challenge.gpsLng !== null ? null
            : prisma.district.findFirst({ where: { name: challenge.district, ...(challenge.state ? { state: { name: challenge.state } } : {}) }, select: { lat: true, lng: true } }),
    ]);
    // No GPS on the report: use the district centre (never a made-up point).
    const lat = challenge.gpsLat ?? centre?.lat ?? null, lng = challenge.gpsLng ?? centre?.lng ?? null;
    const ranked = heis.map((h) => {
        const m = scoreMatch({ sdgTags: challenge.sdgTags, category: challenge.category, lat, lng }, { ...h, activeProjects: h._count.teams });
        return {
            id: h.id, heiId: h.id, name: h.name, district: h.district, naacGrade: h.naacGrade, departments: h.departments,
            score: m.score, totalScore: m.score / 100, parts: m.parts, reasons: m.reasons, distKm: m.distKm, sdgMatched: m.sdgMatched,
            sdgOverlap: m.parts.sdg, geoScore: m.parts.distance, perfScore: m.parts.trackRecord, activeProjects: h._count.teams,
        };
    }).sort((a, b) => b.score - a.score);
    // Within field reach first (unknown distance counts as reachable), then the rest.
    const reachable = (d: number | null) => d === null || d <= FIELD_REACH_KM;
    const ordered = [...ranked.filter((u) => reachable(u.distKm)), ...ranked.filter((u) => !reachable(u.distKm))];
    return limit ? ordered.slice(0, limit) : ordered;
}

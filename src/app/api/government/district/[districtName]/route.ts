import { requireUser } from '@/server/middleware/auth';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { SDG_INFO } from '@/data/mockData';

const RESOLVED = new Set(['COMPLETED', 'DEPLOYED']);
const ENGAGED = new Set(['UNIVERSITY_ASSIGNED', 'TEAM_FORMED', 'IN_PROGRESS']);

// District drill-down for officers, computed only from stored reports, proposals and universities.
export async function GET(req: NextRequest, context: { params: Promise<{ districtName: string }> }) {
    const user = await requireUser(req, ['OFFICER', 'ADMIN']);
    if (user instanceof NextResponse) return user;
    const name = decodeURIComponent((await context.params).districtName ?? '').trim();
    if (!name) return NextResponse.json({ success: false, error: 'District name is required' }, { status: 400 });

    let district, challenges, heis;
    try {
        district = await prisma.district.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, include: { state: true } });
        if (!district) return NextResponse.json({ success: false, error: `Unknown district "${name}"` }, { status: 404 });
        [challenges, heis] = await Promise.all([
            prisma.challenge.findMany({
                where: { district: { equals: district.name, mode: 'insensitive' } },
                include: { proposals: { select: { status: true, budgetRequested: true } } },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.hEI.findMany({ where: { state: district.state.name }, select: { name: true, district: true, lat: true, lng: true } }),
        ]);
    } catch (err) {
        console.error(`District drill-down failed for ${name}:`, err);
        return NextResponse.json({ success: false, error: 'District data is temporarily unavailable.' }, { status: 503 });
    }

    const total = challenges.length;
    const resolved = challenges.filter((c) => RESOLVED.has(c.status)).length;
    const resolutionRate = total ? Math.round((resolved / total) * 100) : 0;
    const open = challenges.filter((c) => !RESOLVED.has(c.status));
    const funding = challenges.flatMap((c) => c.proposals).filter((p) => p.status === 'ACCEPTED').reduce((s, p) => s + p.budgetRequested, 0);

    // Most frequent SDGs among unresolved reports.
    const counts = new Map<number, number>();
    open.flatMap((c) => c.sdgTags).forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
    const pressureSDGs = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sdg, n]) => {
        const info = SDG_INFO.find((x) => x.id === sdg);
        return { sdgNumber: sdg, title: `${info?.name ?? `SDG ${sdg}`} (${n})`, color: info?.color ?? '#64748b' };
    });

    // Closest university in the same state (straight-line), if coordinates are known.
    const dist = (h: { lat: number | null; lng: number | null }) =>
        district.lat === null || h.lat === null || h.lng === null || district.lng === null ? Infinity : Math.hypot(h.lat - district.lat, h.lng - district.lng);
    const nearest = [...heis].sort((a, b) => dist(a) - dist(b))[0];

    const now = Date.now();
    const pending = open.slice(0, 3).map((c) => ({
        id: c.id, title: c.title, status: c.status, category: c.category, sdgs: c.sdgTags,
        daysPending: Math.floor((now - c.createdAt.getTime()) / 86_400_000),
    }));

    const unrouted = open.filter((c) => !ENGAGED.has(c.status)).length;
    const recommendation =
        total === 0 ? 'No problems have been reported in this district yet.'
            : resolutionRate < 40 && nearest ? `Route the ${unrouted} unassigned problem${unrouted === 1 ? '' : 's'} to ${nearest.name}.`
                : resolutionRate <= 70 ? `${unrouted} problem${unrouted === 1 ? '' : 's'} still need a university.`
                    : 'Well served — most reported problems are resolved.';

    return NextResponse.json({
        success: true,
        data: {
            district: { name: district.name, division: district.state.name, nearestHEI: nearest ? `${nearest.name} (${nearest.district})` : 'None in this state yet', code: String(heis.length) },
            pressureSDGs,
            stats: { totalChallenges: total, resolvedChallenges: resolved, resolutionRate, activeEngagements: challenges.filter((c) => ENGAGED.has(c.status)).length, committedCSRFunding: funding },
            topPendingChallenges: pending,
            recommendation,
        },
    });
}

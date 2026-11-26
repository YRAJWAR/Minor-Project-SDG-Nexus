import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { SDG_INFO } from '@/data/mockData';

const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING = new Set(['SUBMITTED', 'AI_PROCESSED', 'VALIDATED']);
const ACTIVE = new Set(['UNIVERSITY_ASSIGNED', 'TEAM_FORMED', 'IN_PROGRESS']);
const RESOLVED = new Set(['COMPLETED', 'DEPLOYED']);
const lakhs = (rupees: number) => Math.round(rupees / 1000) / 100; // 2 decimals

// All five insights are computed from live data. When there is no data, the text says so (no invented numbers).
export async function GET() {
    let challenges, acceptedProposals, released;
    try {
        [challenges, acceptedProposals, released] = await Promise.all([
            prisma.challenge.findMany({
                select: { district: true, status: true, sdgTags: true, createdAt: true, updatedAt: true },
            }),
            prisma.challengeProposal.findMany({
                where: { status: 'ACCEPTED' },
                select: { budgetRequested: true, createdAt: true, hei: { select: { name: true } } },
            }),
            prisma.milestone.aggregate({ _sum: { fundReleased: true } }),
        ]);
    } catch (dbErr) {
        console.error('Prisma error in /api/government/insights:', dbErr);
        return NextResponse.json(
            { success: false, error: 'Insights are temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    // 1. Most underserved district: most pending challenges, ranked by pending minus active work.
    const byDistrict = new Map<string, { pending: number; active: number }>();
    for (const ch of challenges) {
        const d = byDistrict.get(ch.district) ?? { pending: 0, active: 0 };
        if (PENDING.has(ch.status)) d.pending++;
        if (ACTIVE.has(ch.status)) d.active++;
        byDistrict.set(ch.district, d);
    }
    const ranked = [...byDistrict.entries()]
        .filter(([, d]) => d.pending > 0)
        .sort((a, b) => b[1].pending - b[1].active - (a[1].pending - a[1].active));
    const worst = ranked[0];
    const mostUnderserved = worst
        ? {
            text: `${worst[0]}: ${worst[1].pending} pending challenge(s), ${worst[1].active} with a university`,
            recommendation: `Prioritise verification and routing for ${worst[0]}.`,
            chartData: ranked.slice(0, 5).map(([name, d], i) => ({
                name,
                count: d.pending,
                fill: i === 0 ? '#f43f5e' : '#94a3b8',
            })),
        }
        : { text: 'No pending challenges right now.', recommendation: 'Nothing waiting for review.', chartData: [] };

    // 2. Fastest resolution: average days from submission to completion, per district.
    // ponytail: uses updatedAt as the completion date; a status history table (Phase 2) makes this exact.
    const days = new Map<string, number[]>();
    for (const ch of challenges) {
        if (!RESOLVED.has(ch.status)) continue;
        const list = days.get(ch.district) ?? [];
        list.push(Math.max(1, Math.round((ch.updatedAt.getTime() - ch.createdAt.getTime()) / DAY_MS)));
        days.set(ch.district, list);
    }
    const fastest = [...days.entries()]
        .map(([district, list]) => ({ district, avg: Math.round(list.reduce((a, b) => a + b, 0) / list.length), n: list.length }))
        .sort((a, b) => a.avg - b.avg)[0];
    const resolvedCount = challenges.filter((c) => RESOLVED.has(c.status)).length;
    const fastestResolution = fastest
        ? { text: `${fastest.district} resolves challenges fastest: ${fastest.avg} days on average`, avgDays: fastest.avg, resolvedCount }
        : { text: 'No challenges have been resolved yet.', avgDays: 0, resolvedCount: 0 };

    // 3. SDG coverage gap: SDG with the most challenges that have no university assigned yet.
    const demand = new Map<number, { total: number; unassigned: number }>();
    for (const ch of challenges) {
        for (const sdg of ch.sdgTags) {
            const d = demand.get(sdg) ?? { total: 0, unassigned: 0 };
            d.total++;
            if (PENDING.has(ch.status)) d.unassigned++;
            demand.set(sdg, d);
        }
    }
    const gap = [...demand.entries()].sort((a, b) => b[1].unassigned - a[1].unassigned)[0];
    const sdgTitle = (n: number) => SDG_INFO.find((s) => s.id === n)?.name ?? `SDG ${n}`;
    const sdgCoverageGap = gap && gap[1].unassigned > 0
        ? {
            text: `SDG ${gap[0]} has ${gap[1].total} challenge(s); ${gap[1].unassigned} still have no university`,
            sdgNumber: gap[0],
            sdgTitle: sdgTitle(gap[0]),
            chartData: [
                { name: 'Total', value: gap[1].total, fill: '#94a3b8' },
                { name: 'Unassigned', value: gap[1].unassigned, fill: '#f59e0b' },
            ],
        }
        : { text: 'Every tagged challenge has a university.', sdgNumber: 0, sdgTitle: '—', chartData: [] };

    // 4. CSR utilisation: accepted proposal budgets vs money released against milestones.
    const committed = acceptedProposals.reduce((s, p) => s + p.budgetRequested, 0);
    const disbursed = released._sum.fundReleased ?? 0;
    const csrUtilization = {
        text: committed > 0
            ? `₹${lakhs(committed)}L approved across ${acceptedProposals.length} proposal(s); ₹${lakhs(disbursed)}L released`
            : 'No funded proposals yet.',
        committedLakhs: lakhs(committed),
        disbursedLakhs: lakhs(disbursed),
        disbursedPercent: committed > 0 ? Math.min(100, Math.round((disbursed / committed) * 100)) : 0,
    };

    // 5. University engagement: university with the most accepted proposals in the last 30 days.
    const monthAgo = Date.now() - 30 * DAY_MS;
    const recent = new Map<string, number>();
    for (const p of acceptedProposals) {
        if (p.createdAt.getTime() >= monthAgo) recent.set(p.hei.name, (recent.get(p.hei.name) ?? 0) + 1);
    }
    const topUni = [...recent.entries()].sort((a, b) => b[1] - a[1])[0];
    const universityEngagement = {
        text: topUni ? `${topUni[0]} had ${topUni[1]} proposal(s) accepted in the last 30 days` : 'No proposals accepted in the last 30 days.',
        acceptedThisMonth: topUni?.[1] ?? 0,
        totalAssigned: acceptedProposals.length,
    };

    return NextResponse.json({
        success: true,
        data: {
            insights: { mostUnderserved, fastestResolution, sdgCoverageGap, csrUtilization, universityEngagement },
        },
        timestamp: new Date().toISOString(),
    });
}

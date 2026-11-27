import { requireUser } from '@/server/middleware/auth';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { scoreMatch } from '@/server/matching';


export async function GET(request: NextRequest) {
    const user = await requireUser(request, ['FACULTY']);
    if (user instanceof NextResponse) return user;

    let hei;
    let challenges;
    try {
        hei = user.heiId ? await prisma.hEI.findUnique({
            where: { id: user.heiId },
            include: { _count: { select: { teams: { where: { proposal: { challenge: { status: { in: ['TEAM_FORMED', 'FUNDED', 'IN_PROGRESS'] } } } } } } } },
        }) : null;
        if (!hei) {
            return NextResponse.json(
                { success: false, error: 'Your account is not linked to a university.', timestamp: new Date().toISOString() },
                { status: 403 }
            );
        }
        // Only challenges routed to THIS university (a proposal exists for it). Other universities' work is not shown.
        challenges = await prisma.challenge.findMany({
            where: { proposals: { some: { heiId: hei.id } } },
            orderBy: { createdAt: 'desc' },
            include: { proposals: { where: { heiId: hei.id }, select: { id: true, status: true } } },
        });
    } catch (dbErr) {
        console.error('Inbox query failed:', dbErr);
        return NextResponse.json(
            { success: false, error: 'The inbox is temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    const data = challenges.map((ch) => ({
        id: ch.id,
        title: ch.title,
        description: ch.description,
        district: ch.district,
        block: ch.block || ch.district,
        category: ch.category,
        status: ch.status,
        sdgTags: ch.sdgTags,
        daysSinceSubmitted: Math.max(1, Math.floor((Date.now() - ch.createdAt.getTime()) / 86_400_000)),
        // Same formula as the officer's suggestions (src/server/matching.ts).
        matchScore: (() => {
            const m = scoreMatch({ sdgTags: ch.sdgTags, category: ch.category, lat: ch.gpsLat, lng: ch.gpsLng }, { ...hei, activeProjects: hei._count.teams });
            return { overall: m.score, sdgOverlap: Math.round(m.parts.sdg * 100), geoProximity: Math.round(m.parts.distance * 100), pastPerformance: Math.round(m.parts.trackRecord * 100), reasons: m.reasons };
        })(),
        hasExistingProposal: ch.proposals.length > 0,
        createdAt: ch.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
}

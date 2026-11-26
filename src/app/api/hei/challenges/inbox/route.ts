import { requireUser } from '@/server/middleware/auth';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function calculateMatchBreakdown(
    challenge: { sdgTags: number[]; district: string },
    hei: { sdgExpertise: number[]; district: string; pastPerformanceScore: number | null }
) {
    const commonSDGs = challenge.sdgTags.filter((t) => hei.sdgExpertise.includes(t));
    const sdgOverlap =
        challenge.sdgTags.length > 0
            ? Math.round((commonSDGs.length / challenge.sdgTags.length) * 100)
            : 50;

    const normalizedSdgScore = commonSDGs.length > 0 ? Math.max(75, sdgOverlap) : 40;

    const geoProximity =
        challenge.district.trim().toLowerCase() === hei.district.trim().toLowerCase()
            ? 100
            : 80; // ponytail: same-district check only; Phase 2 uses real distance

    const pastPerformance = Math.round((hei.pastPerformanceScore ?? 0) * 100);

    const overall = Math.min(
        98,
        Math.round(normalizedSdgScore * 0.5 + geoProximity * 0.25 + pastPerformance * 0.25)
    );

    const reasons: string[] = [];
    if (commonSDGs.length > 0) {
        reasons.push(`Direct alignment on UN SDG ${commonSDGs.join(', ')} research expertise`);
    } else {
        reasons.push('Interdisciplinary engineering challenge open to university innovation cell');
    }

    if (geoProximity === 100) {
        reasons.push(`Located in home district (${hei.district}) for rapid field deployment`);
    } else {
        reasons.push(`Outside your district (${challenge.district})`);
    }

    reasons.push(`Institutional rating: ${pastPerformance}% past performance score`);

    return {
        overall,
        sdgOverlap: normalizedSdgScore,
        geoProximity,
        pastPerformance,
        reasons,
    };
}

export async function GET(request: NextRequest) {
    const user = await requireUser(request, ['FACULTY']);
    if (user instanceof NextResponse) return user;

    let hei;
    let challenges;
    try {
        hei = user.heiId ? await prisma.hEI.findUnique({ where: { id: user.heiId } }) : null;
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
        matchScore: calculateMatchBreakdown(
            { sdgTags: ch.sdgTags, district: ch.district },
            { sdgExpertise: hei.sdgExpertise, district: hei.district, pastPerformanceScore: hei.pastPerformanceScore }
        ),
        hasExistingProposal: ch.proposals.length > 0,
        createdAt: ch.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
}

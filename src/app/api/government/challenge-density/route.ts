import { requireUser } from '@/server/middleware/auth';
import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

const RESOLVED = new Set(['COMPLETED', 'DEPLOYED']);

// Challenges per district and resolution rate, computed only from districts that actually have challenges.
export async function GET(req: NextRequest) {
    const user = await requireUser(req);
    if (user instanceof NextResponse) return user;
    let challenges;
    try {
        challenges = await prisma.challenge.findMany({ select: { district: true, status: true } });
    } catch (dbErr) {
        console.error('Database query failed in challenge-density:', dbErr);
        return NextResponse.json(
            { success: false, error: 'District statistics are temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    const stats = new Map<string, { total: number; resolved: number }>();
    for (const ch of challenges) {
        const key = ch.district.trim();
        const s = stats.get(key) ?? { total: 0, resolved: 0 };
        s.total++;
        if (RESOLVED.has(ch.status)) s.resolved++;
        stats.set(key, s);
    }

    const districts = [...stats.entries()].map(([district, s]) => ({
        district,
        totalChallenges: s.total,
        resolvedChallenges: s.resolved,
        resolutionRate: Math.round((s.resolved / s.total) * 100),
    }));
    const avgResolutionRate = districts.length
        ? Math.round(districts.reduce((sum, d) => sum + d.resolutionRate, 0) / districts.length)
        : 0;
    const threshold = Math.round(avgResolutionRate * 0.6); // 60% of the average

    return NextResponse.json({
        success: true,
        data: {
            density: districts.map((d) => ({ district: d.district, count: d.totalChallenges })),
            equity: districts.map((d) => ({ ...d, avgResolutionRate, threshold, isBelowThreshold: d.resolutionRate < threshold })),
            avgResolutionRate,
            threshold,
            totalChallenges: challenges.length,
        },
        timestamp: new Date().toISOString(),
    });
}

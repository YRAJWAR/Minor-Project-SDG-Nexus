import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser, inJurisdiction } from '@/server/middleware/auth';
import { transition, LifecycleError } from '@/server/lifecycle';
import { rankUniversities } from '@/server/matching';


export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ challengeId: string }> }
) {
    try {
        const user = await requireUser(req, ['OFFICER', 'ADMIN']);
        if (user instanceof NextResponse) return user;
        const { challengeId } = await params;

        let challenge;
        let heis;
        try {
            challenge = await prisma.challenge.findUnique({
                where: { id: challengeId },
                select: {
                    id: true,
                    title: true,
                    district: true,
                    state: true,
                    category: true,
                    sdgTags: true,
                    status: true,
                    description: true,
                    submittedVia: true,
                    gpsLat: true,
                    gpsLng: true,
                },
            });
            heis = challenge ? await rankUniversities(challenge, 3) : [];
        } catch (dbErr) {
            console.error('Prisma error in validate GET:', dbErr);
            return NextResponse.json(
                { success: false, error: 'Matching is temporarily unavailable.', timestamp: new Date().toISOString() },
                { status: 503 }
            );
        }

        if (!challenge) {
            return NextResponse.json(
                { success: false, error: `No challenge found with ID "${challengeId}"`, timestamp: new Date().toISOString() },
                { status: 404 }
            );
        }
        if (!inJurisdiction(user, challenge.district)) {
            return NextResponse.json(
                { success: false, error: 'This challenge is outside your district.', timestamp: new Date().toISOString() },
                { status: 403 }
            );
        }

        const top3Heis = heis;

        return NextResponse.json({
            success: true,
            data: {
                challenge,
                topHeiMatches: top3Heis,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Validate GET route error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to compute HEI matches',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ challengeId: string }> }
) {
    try {
        const { challengeId } = await params;
        const body = await req.json().catch(() => ({}));
        const { selectedHeiId } = body;

        // 1. Only an officer (in this challenge's district) or an admin may validate and route.
        const user = await requireUser(req, ['OFFICER', 'ADMIN']);
        if (user instanceof NextResponse) return user;

        // 2. Fetch challenge and candidate universities
        let challenge;
        let allHeis;
        try {
            challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
            allHeis = challenge ? await rankUniversities(challenge) : [];
        } catch (dbErr) {
            console.error('DB lookup failed in validate route:', dbErr);
            return NextResponse.json(
                { success: false, error: 'Validation is temporarily unavailable. Please try again.', timestamp: new Date().toISOString() },
                { status: 503 }
            );
        }

        if (!challenge) {
            return NextResponse.json(
                { success: false, error: `No challenge found with ID "${challengeId}"`, timestamp: new Date().toISOString() },
                { status: 404 }
            );
        }
        if (!inJurisdiction(user, challenge.district)) {
            return NextResponse.json(
                { success: false, error: 'This challenge is outside your district.', timestamp: new Date().toISOString() },
                { status: 403 }
            );
        }

        // Ranked with the shared formula (src/server/matching.ts).
        const top3Heis = allHeis.slice(0, 3);

        // 5. Verify (if still awaiting the officer) and optionally assign, through the lifecycle service:
        //    it checks role, district and status, and writes the change + ledger entry + notifications together.
        let newStatus = challenge.status;
        let assignedHei: { id: string; name: string } | null = null;
        try {
            if (challenge.status === 'SUBMITTED' || challenge.status === 'AI_PROCESSED') {
                newStatus = (await transition(challengeId, 'VERIFY', user)).status;
            }
            if (selectedHeiId) {
                newStatus = (await transition(challengeId, 'ASSIGN', user, { heiId: selectedHeiId })).status;
                assignedHei = allHeis.find((h) => h.id === selectedHeiId) ?? null;
            }
        } catch (err) {
            if (err instanceof LifecycleError) {
                return NextResponse.json({ success: false, error: err.message, timestamp: new Date().toISOString() }, { status: err.status });
            }
            console.error('Validate/route failed:', err);
            return NextResponse.json(
                { success: false, error: 'The change could not be saved. Nothing was updated — please try again.', timestamp: new Date().toISOString() },
                { status: 503 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                challengeId,
                status: newStatus,
                previousStatus: challenge.status,
                validatedAt: new Date().toISOString(),
                assignedHei: assignedHei ? { id: assignedHei.id, name: assignedHei.name } : null,
                topHeiMatches: top3Heis,
            },
            message: selectedHeiId
                ? `Challenge validated and successfully assigned to ${assignedHei?.name}.`
                : 'Challenge successfully validated by Government. Top 3 HEI matches computed.',
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Validate challenge route error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to validate challenge and compute HEI matches',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}

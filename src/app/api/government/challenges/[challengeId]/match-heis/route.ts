import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser, inJurisdiction } from '@/server/middleware/auth';
import { matchChallengesToHEIs } from '@/services/smartMatchingService';

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ challengeId: string }> }
) {
    try {
        const { challengeId } = await context.params;

        const user = await requireUser(req, ['OFFICER', 'ADMIN']);
        if (user instanceof NextResponse) return user;

        // Fetch challenge and compute matches; a DB failure is reported, never papered over.
        let challenge;
        let matches;
        try {
            challenge = await prisma.challenge.findUnique({
                where: { id: challengeId },
                select: { id: true, title: true, district: true, sdgTags: true, gpsLat: true, gpsLng: true, status: true },
            });
            if (challenge) matches = await matchChallengesToHEIs(challenge, 3);
        } catch (dbErr) {
            console.error('Prisma lookup error in match-heis:', dbErr);
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

        return NextResponse.json({
            success: true,
            data: {
                challengeId: challenge.id,
                challengeTitle: challenge.title,
                district: challenge.district,
                sdgTags: challenge.sdgTags,
                matches,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Error in /api/government/challenges/[challengeId]/match-heis:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to compute HEI match routing',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}

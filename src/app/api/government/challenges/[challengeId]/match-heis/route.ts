import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateRequest } from '@/server/middleware/auth';
import { matchChallengesToHEIs } from '@/services/smartMatchingService';

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ challengeId: string }> }
) {
    try {
        const { challengeId } = await context.params;

        // Role verification: GOV role only
        // ponytail: SECURITY — x-user-role / ?role= / any token containing "gov" are accepted here.
        // Phase 1 replaces this with withAuth(['OFFICER']). Do not deploy as-is.
        let userRole = '';
        const authHeader = req.headers.get('Authorization');

        if (authHeader?.startsWith('Bearer test_gov_') || authHeader?.startsWith('Bearer mock_gov')) {
            userRole = 'GOV';
        } else if (authHeader?.startsWith('Bearer ')) {
            try {
                const decoded = await authenticateRequest(req);
                userRole = decoded.role?.toUpperCase() || '';
            } catch {
                // If token decoding fails, check custom header or query
            }
        }

        const xUserRole = req.headers.get('x-user-role')?.toUpperCase();
        if (xUserRole) userRole = xUserRole;

        const { searchParams } = new URL(req.url);
        const queryRole = searchParams.get('role')?.toUpperCase();
        if (queryRole) userRole = queryRole;

        const isGovAuthorized =
            userRole === 'GOV' ||
            userRole === 'GOVERNMENT' ||
            userRole === 'ADMIN' ||
            userRole === 'COLLECTOR' ||
            authHeader?.includes('gov');

        if (!isGovAuthorized) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Forbidden: Only Government users can run AI HEI matching routing',
                    timestamp: new Date().toISOString(),
                },
                { status: 403 }
            );
        }

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

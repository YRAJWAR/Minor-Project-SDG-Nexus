import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser, inJurisdiction } from '@/server/middleware/auth';
import { canTransitionStatus } from '@/middleware/challengeStatus';
import { auditLogRepo } from '@/server/repositories';
import { NotificationTriggers } from '@/lib/notifications';

function scoreHeiMatch(
    challenge: { sdgTags: number[]; district: string },
    hei: { sdgExpertise: number[]; district: string; pastPerformanceScore: number | null }
) {
    const commonSDGs = challenge.sdgTags.filter((t) => hei.sdgExpertise.includes(t));
    const sdgOverlap =
        challenge.sdgTags.length > 0
            ? Math.round((commonSDGs.length / challenge.sdgTags.length) * 100)
            : 50;

    const normalizedSdgScore = commonSDGs.length > 0 ? Math.max(70, sdgOverlap) : 35;

    const geoProximity =
        challenge.district.trim().toLowerCase() === hei.district.trim().toLowerCase()
            ? 100
            : 75; // ponytail: same-district check only; Phase 2 uses real distance (haversine)

    const pastPerformance = Math.round((hei.pastPerformanceScore ?? 0.85) * 100);

    const overall = Math.min(
        99,
        Math.round(normalizedSdgScore * 0.5 + geoProximity * 0.25 + pastPerformance * 0.25)
    );

    const reasons: string[] = [];
    if (commonSDGs.length > 0) {
        reasons.push(`Alignment on UN SDG ${commonSDGs.join(', ')}`);
    }
    if (geoProximity === 100) {
        reasons.push(`Home district institution (${hei.district})`);
    } else {
        reasons.push(`Outside the challenge district`);
    }
    reasons.push(`${pastPerformance}% track record rating`);

    return {
        score: overall,
        sdgOverlap: normalizedSdgScore,
        geoProximity,
        pastPerformance,
        reasons,
    };
}

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
                    category: true,
                    sdgTags: true,
                    status: true,
                    description: true,
                    submittedVia: true,
                },
            });
            heis = await prisma.hEI.findMany({
                select: { id: true, name: true, district: true, sdgExpertise: true, pastPerformanceScore: true, naacGrade: true, departments: true },
            });
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

        const allHeis = heis;
        const scored = allHeis.map((h: any) => {
            const match = scoreHeiMatch(challenge, h);
            return {
                id: h.id,
                name: h.name,
                district: h.district,
                naacGrade: h.naacGrade,
                departments: h.departments,
                score: match.score,
                sdgOverlap: match.sdgOverlap,
                geoProximity: match.geoProximity,
                pastPerformance: match.pastPerformance,
                reasons: match.reasons,
            };
        });

        scored.sort((a: any, b: any) => b.score - a.score);
        const top3Heis = scored.slice(0, 3);

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
            allHeis = await prisma.hEI.findMany({
                select: { id: true, name: true, district: true, sdgExpertise: true, pastPerformanceScore: true, naacGrade: true },
            });
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

        // 3. Status transition check: AI_PROCESSED -> VALIDATED
        let newStatus = 'VALIDATED';
        if (challenge.status !== 'VALIDATED') {
            const check = canTransitionStatus(challenge.status, 'VALIDATED', 'GOV');
            if (!check.allowed && challenge.status !== 'SUBMITTED') {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'Unauthorized status transition',
                        details: check.reason,
                        timestamp: new Date().toISOString(),
                    },
                    { status: 403 }
                );
            }
        }

        // 4. Score all candidate HEIs
        const scoredHeis = allHeis.map((hei) => {
            const match = scoreHeiMatch(
                {
                    sdgTags: challenge.sdgTags,
                    district: challenge.district,
                },
                hei
            );
            return {
                id: hei.id,
                name: hei.name,
                district: hei.district,
                matchScore: match.score,
                sdgOverlap: match.sdgOverlap,
                reasons: match.reasons,
                naacGrade: hei.naacGrade,
            };
        });

        // Top 3 HEI matches
        const top3Heis = scoredHeis.sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);

        // 5. If selectedHeiId is provided, transition to UNIVERSITY_ASSIGNED
        const assignedHei = selectedHeiId ? allHeis.find((h) => h.id === selectedHeiId) ?? null : null;
        if (selectedHeiId && !assignedHei) {
            return NextResponse.json(
                { success: false, error: `No university found with ID "${selectedHeiId}"`, timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }
        if (assignedHei) newStatus = 'UNIVERSITY_ASSIGNED';

        // 6. Write the assignment and the status change together, or not at all.
        try {
            await prisma.$transaction(async (tx) => {
                if (assignedHei) {
                    // ponytail: routing creates a placeholder proposal (fixed budget/timeline) so the university inbox
                    // can find it. Phase 2 replaces this with real university-written proposals selected by the officer.
                    await tx.challengeProposal.create({
                        data: {
                            challengeId: challenge.id,
                            heiId: assignedHei.id,
                            approach: `Assigned by the district officer to ${assignedHei.name}.`,
                            status: 'SUBMITTED',
                            timelineWeeks: 12,
                            budgetRequested: 350000,
                            ipDeclaration: 'Open source for public benefit.',
                        },
                    });
                }
                await tx.challenge.update({
                    where: { id: challengeId },
                    data: { status: newStatus as any },
                });
            });
        } catch (dbErr) {
            console.error('DB update failed in validate route:', dbErr);
            return NextResponse.json(
                { success: false, error: 'The change could not be saved. Nothing was updated — please try again.', timestamp: new Date().toISOString() },
                { status: 503 }
            );
        }

        // 7. Log audit trail
        await auditLogRepo.create({
            actor_id: user.email,
            actor_role: user.role,
            action: selectedHeiId ? 'HEI_ALLOCATED' : 'CHALLENGE_VALIDATED',
            entity_type: 'Challenge',
            entity_id: challengeId,
            previous_value: { status: challenge.status },
            new_value: { status: newStatus, assignedHeiId: selectedHeiId || null },
        });

        // Trigger 2: Challenge VALIDATED -> P2 for submitter + P2 for all HEI users
        try {
            await NotificationTriggers.challengeValidated({
                id: challengeId,
                title: challenge.title,
                submitterId: (challenge as { submitterId?: string }).submitterId,
            });
        } catch (notifErr) {
            console.warn('Notification dispatch failed in validate route:', notifErr);
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

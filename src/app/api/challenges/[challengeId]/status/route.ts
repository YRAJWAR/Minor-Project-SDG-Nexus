import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/server/middleware/auth';
import { allowedActions } from '@/server/lifecycle';

function maskSubmitter(submittedBy: string, isAnonymous: boolean, district: string): string {
    if (isAnonymous || !submittedBy) {
        return `Community Member, ${district}`;
    }

    // Clean any phone numbers in parentheses or brackets e.g. "Arjun Mahato (9876543210)"
    const clean = submittedBy.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();

    if (/^\d+$/.test(clean) || clean.includes('@') || clean.length < 2) {
        return `Community Member, ${district}`;
    }

    return `${clean}, ${district}`;
}

const PIPELINE_STAGES = [
    { id: 'SUBMITTED', title: 'Citizen Submission', description: 'Problem reported by a citizen' },
    { id: 'AI_PROCESSED', title: 'AI SDG Tagging', description: 'Classified against the UN SDGs' },
    { id: 'VALIDATED', title: 'District Officer Review', description: 'Verified by the district officer' },
    { id: 'UNIVERSITY_ASSIGNED', title: 'University Assigned', description: 'Routed to a matching university' },
    { id: 'TEAM_FORMED', title: 'Team Formed', description: 'Faculty and student team assigned' },
    { id: 'IN_PROGRESS', title: 'Prototype & Testing', description: 'Solution being built and tested' },
    { id: 'COMPLETED', title: 'Completed', description: 'All milestones verified' },
    { id: 'DEPLOYED', title: 'Deployed & Confirmed', description: 'Confirmed on the ground by citizens' },
];

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ challengeId: string }> }
) {
    const { challengeId } = await context.params;

    let challenge;
    let history: { action: string; created_at: Date }[] = [];
    let mergedInto: { id: string; title: string } | null = null;
    try {
        challenge = await prisma.challenge.findUnique({
            where: { id: challengeId },
            include: {
                proposals: {
                    select: { id: true, status: true, hei: { select: { name: true, district: true } } },
                },
                _count: { select: { endorsements: true } },
            },
        });
        if (challenge) {
            history = await prisma.auditLog.findMany({ where: { entity_type: 'Challenge', entity_id: challenge.id }, orderBy: { seq: 'asc' }, select: { action: true, created_at: true } });
            mergedInto = challenge.mergedIntoId ? await prisma.challenge.findUnique({ where: { id: challenge.mergedIntoId }, select: { id: true, title: true } }) : null;
        }
    } catch (dbErr) {
        console.error('Database query failed in /api/challenges/[challengeId]/status:', dbErr);
        return NextResponse.json(
            { success: false, error: 'Tracking is temporarily unavailable. Please try again shortly.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    if (!challenge) {
        return NextResponse.json(
            { success: false, error: `No challenge found with ID "${challengeId}"`, timestamp: new Date().toISOString() },
            { status: 404 }
        );
    }

    const currentStageIndex = Math.max(0, PIPELINE_STAGES.findIndex((s) => s.id === challenge.status));
    const dateLabel = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

    // Stage dates come from the ledger; a stage without a ledger entry shows no date rather than a guess.
    const STAGE_ACTION: Record<string, string> = { SUBMITTED: 'CHALLENGE_SUBMITTED', AI_PROCESSED: 'CHALLENGE_SUBMITTED', VALIDATED: 'CHALLENGE_VERIFY', UNIVERSITY_ASSIGNED: 'CHALLENGE_ASSIGN', TEAM_FORMED: 'CHALLENGE_SELECT_PROPOSAL', IN_PROGRESS: 'CHALLENGE_START', COMPLETED: 'CHALLENGE_COMPLETE', DEPLOYED: 'CHALLENGE_CLOSE' };
    const when = (stageId: string) => history.find((h) => h.action === STAGE_ACTION[stageId])?.created_at;
    const pipeline = PIPELINE_STAGES.map((stage, index) => {
        const at = index === 0 ? challenge.createdAt : when(stage.id) ?? (index === currentStageIndex ? challenge.updatedAt : null);
        return {
            step: index + 1,
            ...stage,
            state: index < currentStageIndex ? 'completed' : index === currentStageIndex ? 'current' : 'upcoming',
            timestamp: at && index <= currentStageIndex ? dateLabel(at) : null,
        };
    });
    const viewer = await getSessionUser(req).catch(() => null);

    const assigned = challenge.proposals.find((p) => p.status === 'ACCEPTED')?.hei ?? null;

    return NextResponse.json({
        success: true,
        data: {
            id: challenge.id,
            title: challenge.title,
            description: challenge.description,
            category: challenge.category,
            district: challenge.district,
            block: challenge.block,
            gpsLat: challenge.gpsLat,
            gpsLng: challenge.gpsLng,
            photoUrls: challenge.photoUrls,
            videoUrls: challenge.videoUrls,
            status: challenge.status,
            sdgTags: challenge.sdgTags,
            aiConfidence: challenge.aiConfidence,
            gpVerified: challenge.gpVerified,
            submittedByMasked: maskSubmitter(challenge.submittedBy, challenge.isAnonymous, challenge.district),
            isAnonymous: challenge.isAnonymous,
            submittedVia: challenge.submittedVia || 'PORTAL',
            createdAt: challenge.createdAt.toISOString(),
            updatedAt: challenge.updatedAt.toISOString(),
            pipeline,
            endorsements: challenge._count.endorsements,
            rejectReason: challenge.rejectReason,
            citizenRating: challenge.citizenRating,
            confirmedAt: challenge.confirmedAt?.toISOString() ?? null,
            disputeReason: challenge.disputeReason,
            verifiedBeneficiaries: challenge.verifiedBeneficiaries,
            mergedInto,
            allowedActions: viewer ? allowedActions(challenge, viewer) : [],
            signedIn: !!viewer,
            proposalsCount: challenge.proposals.length,
            assignedInstitutions: assigned ? [assigned.name] : [],
            assignedHEI: assigned,
        },
        timestamp: new Date().toISOString(),
    });
}

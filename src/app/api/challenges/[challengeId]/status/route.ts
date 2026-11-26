import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
    _req: NextRequest,
    context: { params: Promise<{ challengeId: string }> }
) {
    const { challengeId } = await context.params;

    let challenge;
    try {
        challenge = await prisma.challenge.findUnique({
            where: { id: challengeId },
            include: {
                proposals: {
                    select: { id: true, status: true, hei: { select: { name: true, district: true } } },
                },
            },
        });
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

    // Only real timestamps: submission date and the date of the latest status change.
    // ponytail: per-stage dates need a status history table (planned ledger, Phase 2).
    const pipeline = PIPELINE_STAGES.map((stage, index) => ({
        step: index + 1,
        ...stage,
        state: index < currentStageIndex ? 'completed' : index === currentStageIndex ? 'current' : 'upcoming',
        timestamp:
            index === 0 ? dateLabel(challenge.createdAt)
                : index === currentStageIndex ? dateLabel(challenge.updatedAt)
                    : null,
    }));

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
            proposalsCount: challenge.proposals.length,
            assignedInstitutions: assigned ? [assigned.name] : [],
            assignedHEI: assigned,
        },
        timestamp: new Date().toISOString(),
    });
}

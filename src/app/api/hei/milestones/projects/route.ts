import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
    let acceptedProposals;
    try {
        acceptedProposals = await prisma.challengeProposal.findMany({
            where: { status: 'ACCEPTED' },
            include: { challenge: true, hei: true, team: { include: { milestones: true, members: true } } },
            orderBy: { createdAt: 'desc' },
        });
    } catch (dbErr) {
        console.error('Prisma query failed in /api/hei/milestones/projects:', dbErr);
        return NextResponse.json(
            { success: false, error: 'Projects are temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    // ponytail: lists every university's projects until Phase 1 scopes this to the signed-in user's university.
    const now = Date.now();
    const projects = acceptedProposals
        .filter((prop) => prop.team) // a project exists only once its team is formed
        .map((prop) => {
            const team = prop.team!;
            return {
                id: team.id,
                projectId: team.id,
                teamId: team.id,
                proposalId: prop.id,
                challengeId: prop.challenge.id,
                challengeTitle: prop.challenge.title,
                district: prop.challenge.district,
                block: prop.challenge.block,
                category: prop.challenge.category,
                sdgTags: prop.challenge.sdgTags,
                csrFunder: prop.fundingSource,
                budgetRequested: prop.budgetRequested,
                daysActive: Math.max(1, Math.round((now - prop.createdAt.getTime()) / 86_400_000)),
                proposalStatus: prop.status,
                totalMilestones: team.milestones.length,
                verifiedMilestones: team.milestones.filter((m) => m.status === 'GP_VERIFIED' || m.status === 'CSR_APPROVED').length,
                facultyName: team.facultyName,
                facultyEmail: team.facultyEmail,
                heiName: prop.hei.name,
            };
        });

    return NextResponse.json({ success: true, data: projects, timestamp: new Date().toISOString() });
}

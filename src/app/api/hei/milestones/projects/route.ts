import { requireUser } from '@/server/middleware/auth';
import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
    const user = await requireUser(req, ['FACULTY', 'STUDENT', 'OFFICER', 'CSR', 'ADMIN']);
    if (user instanceof NextResponse) return user;
    let acceptedProposals;
    try {
        acceptedProposals = await prisma.challengeProposal.findMany({
            where: {
                status: 'ACCEPTED',
                // Faculty: own university. Students: teams they belong to. Officers: their district.
                ...(user.role === 'FACULTY' ? { heiId: user.heiId ?? '\u0000' } : {}),
                ...(user.role === 'STUDENT' ? { team: { members: { some: { student: { userId: user.id } } } } } : {}),
                ...(user.role === 'OFFICER' ? { challenge: { district: { equals: user.district?.name ?? '\u0000', mode: 'insensitive' as const } } } : {}),
            },
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

    // ponytail: CSR partners see every accepted project until funding commitments exist (Phase 3).
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

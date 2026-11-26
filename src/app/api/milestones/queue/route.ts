import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';

// Milestones waiting for the signed-in user's decision:
//   officer → SUBMITTED ones in their district (verify or reject)
//   CSR     → GP_VERIFIED ones (release funds)
//   admin   → both
export async function GET(req: NextRequest) {
    const user = await requireUser(req, ['OFFICER', 'CSR', 'ADMIN']);
    if (user instanceof NextResponse) return user;

    const statuses = user.role === 'OFFICER' ? ['SUBMITTED' as const] : user.role === 'CSR' ? ['GP_VERIFIED' as const] : ['SUBMITTED' as const, 'GP_VERIFIED' as const];
    try {
        const milestones = await prisma.milestone.findMany({
            where: {
                status: { in: statuses },
                ...(user.role === 'OFFICER'
                    ? { team: { proposal: { challenge: { district: { equals: user.district?.name ?? '\u0000', mode: 'insensitive' as const } } } } }
                    : {}),
            },
            include: { team: { include: { hei: { select: { name: true } }, proposal: { include: { challenge: { select: { title: true, district: true, state: true } } } }, milestones: { select: { id: true } } } } },
            orderBy: { createdAt: 'asc' },
        });
        return NextResponse.json({
            success: true,
            data: milestones.map((m) => ({
                id: m.id,
                projectId: m.teamId,
                title: m.title,
                description: m.description,
                status: m.status,
                submittedAt: m.createdAt.toISOString(),
                sealed: !!m.hashValue,
                challengeTitle: m.team.proposal.challenge.title,
                place: [m.team.proposal.challenge.district, m.team.proposal.challenge.state].filter(Boolean).join(', '),
                university: m.team.hei.name,
                // Even split of the accepted budget across the project's milestones, as a starting suggestion.
                suggestedRelease: Math.round(m.team.proposal.budgetRequested / Math.max(1, m.team.milestones.length)),
            })),
        });
    } catch (err) {
        console.error('Milestone queue failed:', err);
        return NextResponse.json({ success: false, error: 'Approvals are temporarily unavailable.' }, { status: 503 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';

// Projects with a selected university plan, and how much funding each still needs (plus this CSR's own share).
export async function GET(req: NextRequest) {
    const user = await requireUser(req, ['CSR', 'ADMIN']);
    if (user instanceof NextResponse) return user;
    try {
        const challenges = await prisma.challenge.findMany({
            where: { status: { in: ['TEAM_FORMED', 'FUNDED', 'IN_PROGRESS'] }, proposals: { some: { status: 'ACCEPTED' } } },
            include: {
                proposals: { where: { status: 'ACCEPTED' }, include: { hei: { select: { name: true } } } },
                commitments: { include: { csrOrg: { select: { name: true } } } },
            },
            orderBy: { updatedAt: 'desc' },
        });
        return NextResponse.json({
            success: true,
            // Only projects selected with a milestone plan (older demo projects without one are funded elsewhere).
            data: challenges.filter((c) => Array.isArray(c.proposals[0]?.milestonePlan)).map((c) => {
                const p = c.proposals[0];
                const committed = c.commitments.reduce((s, x) => s + x.amount, 0);
                const mine = c.commitments.find((x) => x.csrOrgId === user.organizationId);
                return {
                    id: c.id, title: c.title, place: [c.district, c.state].filter(Boolean).join(', '), status: c.status, sdgTags: c.sdgTags,
                    university: p.hei.name, budget: p.budgetRequested, timelineWeeks: p.timelineWeeks,
                    committed, gap: Math.max(0, Math.round(p.budgetRequested - committed)),
                    mine: mine ? { amount: mine.amount, released: mine.released } : null,
                    funders: c.commitments.map((x) => ({ name: x.csrOrg.name, amount: x.amount })),
                    milestones: p.milestonePlan,
                };
            }),
        });
    } catch (err) {
        console.error('Open funding list failed:', err);
        return NextResponse.json({ success: false, error: 'Funding list is temporarily unavailable.' }, { status: 503 });
    }
}

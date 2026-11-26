import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser, inJurisdiction } from '@/server/middleware/auth';
import { validatePlan, type PlanMilestone, type TeamPlan } from '@/server/lifecycle';

// All submitted university proposals for one report, for the officer choosing between them.
export async function GET(req: NextRequest, context: { params: Promise<{ challengeId: string }> }) {
    const user = await requireUser(req, ['OFFICER', 'ADMIN']);
    if (user instanceof NextResponse) return user;
    const { challengeId } = await context.params;
    try {
        const ch = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { district: true } });
        if (!ch) return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
        if (!inJurisdiction(user, ch.district)) return NextResponse.json({ success: false, error: 'This report is outside your district.' }, { status: 403 });

        const proposals = await prisma.challengeProposal.findMany({
            where: { challengeId, status: { not: 'DRAFT' } },
            include: { hei: { select: { name: true, district: true, naacGrade: true } } },
            orderBy: { createdAt: 'asc' },
        });
        const ids = proposals.flatMap((p) => ((p.teamPlan as unknown as TeamPlan | null)?.members ?? []).map((m) => m.studentProfileId));
        const facultyIds = proposals.map((p) => (p.teamPlan as unknown as TeamPlan | null)?.facultyId).filter(Boolean) as string[];
        const [students, faculty] = await Promise.all([
            prisma.studentProfile.findMany({ where: { id: { in: ids } }, include: { user: { select: { full_name: true } } } }),
            prisma.user.findMany({ where: { id: { in: facultyIds } }, select: { id: true, full_name: true } }),
        ]);
        const name = new Map(students.map((s) => [s.id, `${s.user.full_name} (${s.branch}, yr ${s.year})`]));
        const fname = new Map(faculty.map((f) => [f.id, f.full_name]));

        return NextResponse.json({
            success: true,
            data: proposals.map((p) => {
                const team = p.teamPlan as unknown as TeamPlan | null;
                const plan = (p.milestonePlan as unknown as PlanMilestone[] | null) ?? [];
                return {
                    id: p.id, status: p.status, university: p.hei.name, universityDistrict: p.hei.district, naac: p.hei.naacGrade,
                    approach: p.approach, timelineWeeks: p.timelineWeeks, budget: p.budgetRequested, aiQualityScore: p.aiQualityScore,
                    faculty: team?.facultyId ? fname.get(team.facultyId) ?? null : null,
                    team: (team?.members ?? []).map((m) => name.get(m.studentProfileId) ?? 'Unknown student'),
                    milestones: plan,
                    problems: validatePlan(team, plan, p.budgetRequested, p.timelineWeeks),
                };
            }),
        });
    } catch (err) {
        console.error('Proposals list failed:', err);
        return NextResponse.json({ success: false, error: 'Proposals are temporarily unavailable.' }, { status: 503 });
    }
}

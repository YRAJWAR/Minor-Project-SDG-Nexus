import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';

// Everything the shared dashboards (NGO, corporate, heatmap, ledger, leaderboard, analytics, profile)
// need, read from the database in one call and shaped like DataContext's types.
// ponytail: one unpaginated read of all projects; fine for hundreds, paginate per page past a few thousand.
export async function GET(req: NextRequest) {
    const user = await requireUser(req);
    if (user instanceof NextResponse) return user;

    let orgs, projects, activities, scores, csr;
    try {
        [orgs, projects, activities, scores, csr] = await Promise.all([
            prisma.organization.findMany({ where: { type: 'NGO', verification_status: 'VERIFIED' } }),
            prisma.project.findMany({
                include: { organization: { select: { name: true, state: true, district: true } }, sdg_tags: { select: { sdg_id: true } } },
                orderBy: { created_at: 'desc' },
            }),
            prisma.projectActivity.findMany({
                include: { project: { select: { title: true, organization: { select: { district: true, state: true } } } } },
                orderBy: { created_at: 'desc' },
                take: 200,
            }),
            prisma.impactScore.findMany({ orderBy: { calculated_at: 'desc' }, distinct: ['organization_id'] }),
            prisma.cSRAllocation.groupBy({ by: ['project_id'], _sum: { amount_committed: true } }),
        ]);
    } catch (err) {
        console.error('Overview query failed:', err);
        return NextResponse.json({ success: false, error: 'Dashboard data is temporarily unavailable.' }, { status: 503 });
    }

    const scoreOf = new Map(scores.map((s) => [s.organization_id, s]));
    const committed = new Map(csr.map((c) => [c.project_id, c._sum.amount_committed ?? 0]));
    const day = (d: Date) => d.toISOString().split('T')[0];

    const outProjects = projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        organization_id: p.organization_id,
        organization_name: p.organization.name,
        budget: p.budget_allocated,
        spent: p.budget_utilized,
        location: { lat: p.latitude ?? 0, lng: p.longitude ?? 0, name: p.organization.state },
        timeline: { start: day(p.created_at), end: day(new Date(p.created_at.getTime() + 365 * 86_400_000)) },
        beneficiary_count: p.beneficiaries_count,
        sdg_tags: p.sdg_tags.map((t) => t.sdg_id),
        status: p.status === 'COMPLETED' ? 'completed' : p.status === 'ACTIVE' ? 'active' : 'planning',
        created_at: day(p.created_at),
        impact_score: Math.round(scoreOf.get(p.organization_id)?.final_score ?? 0),
    }));

    const outActivities = activities.map((a) => ({
        id: a.id,
        project_id: a.project_id,
        project_title: a.project.title,
        description: a.description,
        timestamp: a.created_at.toISOString(),
        hash: a.hash_value,
        location: [a.project.organization.district, a.project.organization.state].filter(Boolean).join(', '),
        verified: true,
    }));

    const outScores = scores.map((s) => {
        const sdgs = [...new Set(outProjects.filter((p) => p.organization_id === s.organization_id).flatMap((p) => p.sdg_tags))];
        return {
            organization_id: s.organization_id,
            overall_score: Math.round(s.final_score),
            beneficiary_scale: Math.round(s.scale_score),
            outcome_score: Math.round(s.outcome_score),
            geographic_need: Math.round(s.geographic_need_score),
            funding_efficiency: Math.round(s.efficiency_score),
            verification_score: Math.round(s.transparency_score),
            sdg_breakdown: sdgs.map((sdg) => ({ sdg, score: Math.round(s.final_score) })),
        };
    });

    const outOrgs = orgs.map((o) => {
        const mine = outProjects.filter((p) => p.organization_id === o.id);
        const located = mine.filter((p) => p.location.lat);
        return {
            id: o.id,
            name: o.name,
            sdg_focus: [...new Set(mine.flatMap((p) => p.sdg_tags))],
            location: {
                lat: located.reduce((s, p) => s + p.location.lat, 0) / Math.max(1, located.length),
                lng: located.reduce((s, p) => s + p.location.lng, 0) / Math.max(1, located.length),
                state: o.state,
            },
            impact_score: Math.round(scoreOf.get(o.id)?.final_score ?? 0),
            // What is still unfunded on its live projects.
            funding_need: Math.round(mine.filter((p) => p.status !== 'completed').reduce((s, p) => s + Math.max(0, p.budget - (committed.get(p.id) ?? 0)), 0)),
            projects_count: mine.length,
            beneficiaries: mine.reduce((s, p) => s + p.beneficiary_count, 0),
            verified: true,
        };
    });

    // One row per state that has work in it.
    const byState = new Map<string, typeof outProjects>();
    for (const p of outProjects) byState.set(p.location.name, [...(byState.get(p.location.name) ?? []), p]);
    const regions = [...byState.entries()].map(([name, ps]) => {
        const sdgCount = new Map<number, number>();
        ps.flatMap((p) => p.sdg_tags).forEach((s) => sdgCount.set(s, (sdgCount.get(s) ?? 0) + 1));
        const located = ps.filter((p) => p.location.lat);
        return {
            name,
            lat: located.reduce((s, p) => s + p.location.lat, 0) / Math.max(1, located.length),
            lng: located.reduce((s, p) => s + p.location.lng, 0) / Math.max(1, located.length),
            funding: ps.reduce((s, p) => s + p.budget, 0),
            ngo_count: new Set(ps.map((p) => p.organization_id)).size,
            primary_sdgs: [...sdgCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s),
            projects: ps.length,
            beneficiaries: ps.reduce((s, p) => s + p.beneficiary_count, 0),
        };
    });

    // A CSR partner's own portfolio, from its allocations.
    let myCsr = null;
    if (user.role === 'CSR' && user.organizationId) {
        const mine = await prisma.cSRAllocation.findMany({ where: { corporate_org_id: user.organizationId }, select: { project_id: true, amount_committed: true, amount_disbursed: true } }).catch(() => []);
        const funded = outProjects.filter((p) => mine.some((a) => a.project_id === p.id));
        myCsr = {
            committed: mine.reduce((s, a) => s + a.amount_committed, 0),
            disbursed: mine.reduce((s, a) => s + a.amount_disbursed, 0),
            projects: funded.length,
            sdgs: new Set(funded.flatMap((p) => p.sdg_tags)).size,
            beneficiaries: funded.reduce((s, p) => s + p.beneficiary_count, 0),
        };
    }

    return NextResponse.json({
        success: true,
        data: { projects: outProjects, activities: outActivities, impactScores: outScores, organizations: outOrgs, regions, myCsr },
    });
}

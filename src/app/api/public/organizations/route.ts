import { NextResponse } from 'next/server';
import { handleApiError } from '@/server/middleware/errorHandler';
import { successResponse } from '@/server/utils';

// ──────────────────────────────────────────────────────────────
// GET /api/public/organizations
// Public read-only listing of verified organizations.
// Sensitive financial details excluded.
// ──────────────────────────────────────────────────────────────

export async function GET() {
    try {
        const prisma = (await import('@/lib/prisma')).default;
        let orgs, scores;
        try {
            orgs = await prisma.organization.findMany({
                where: { verification_status: 'VERIFIED' },
                select: {
                    id: true, name: true, type: true, state: true, district: true,
                    verification_status: true,
                    projects: { select: { beneficiaries_count: true, sdg_tags: { select: { sdg_id: true } } } },
                },
                orderBy: { name: 'asc' },
            });
            scores = await prisma.impactScore.findMany({
                where: { organization_id: { in: orgs.map((o) => o.id) } },
                orderBy: { calculated_at: 'desc' },
                distinct: ['organization_id'],
                select: { organization_id: true, final_score: true },
            });
        } catch (dbErr) {
            console.error('Public organizations query failed:', dbErr);
            return NextResponse.json(
                { success: false, error: 'Organizations are temporarily unavailable.', timestamp: new Date().toISOString() },
                { status: 503 }
            );
        }

        const scoreMap = new Map(scores.map((s) => [s.organization_id, Number(s.final_score)]));
        const result = orgs.map((o) => ({
            id: o.id, name: o.name, type: o.type, state: o.state, district: o.district,
            verification_status: o.verification_status,
            project_count: o.projects.length,
            total_beneficiaries: o.projects.reduce((sum, p) => sum + p.beneficiaries_count, 0),
            // null = not scored yet (shown as such), never a made-up 0
            impact_score: scoreMap.get(o.id) ?? null,
            sdg_focus: [...new Set(o.projects.flatMap((p) => p.sdg_tags.map((t) => t.sdg_id)))],
        }));

        return NextResponse.json(successResponse({ organizations: result }, { source: 'database' }));
    } catch (error) {
        return handleApiError(error);
    }
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';
import { trancheDue } from '@/server/lifecycle';
import { haversineKm } from '@/server/matching';

// Proof GPS further than this from the reported spot is flagged for the officer to look at.
const FAR_KM = 5;

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
                    ? { team: { proposal: { challenge: { district: { equals: user.district?.name ?? '-', mode: 'insensitive' as const } } } } }
                    : {}),
                // A CSR sees planned tranches only for projects it committed to (older unplanned milestones stay visible).
                ...(user.role === 'CSR'
                    ? { OR: [{ amount: null }, { team: { proposal: { challenge: { commitments: { some: { csrOrgId: user.organizationId ?? '-' } } } } } }] }
                    : {}),
            },
            include: { team: { include: { hei: { select: { name: true } }, proposal: { include: { challenge: { select: { title: true, district: true, state: true, gpsLat: true, gpsLng: true } }, ngoPartner: { select: { name: true } } } }, milestones: { select: { id: true, dueDate: true } } } } },
            orderBy: { createdAt: 'asc' },
        });
        return NextResponse.json({
            success: true,
            data: milestones.map((m) => ({ m, t: trancheDue(m, m.team.milestones, m.team.proposal.budgetRequested) })).map(({ m, t }) => ({
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
                ngoPartner: m.team.proposal.ngoStatus === 'ACCEPTED' ? m.team.proposal.ngoPartner?.name ?? null : null,
                ngoAttested: m.ngoAttestedAt !== null,
                // The agreed tranche for planned milestones; for older ones an even split as a suggestion.
                suggestedRelease: t.due ?? Math.round(m.team.proposal.budgetRequested / Math.max(1, m.team.milestones.length)),
                retained: t.retained, // held back until the citizen confirms and the officer closes
                proofDistanceKm: (() => {
                    const c = m.team.proposal.challenge;
                    return m.gpsLat !== null && m.gpsLng !== null && c.gpsLat !== null && c.gpsLng !== null ? Math.round(haversineKm({ lat: m.gpsLat, lng: m.gpsLng }, { lat: c.gpsLat, lng: c.gpsLng }) * 10) / 10 : null;
                })(),
                farKm: FAR_KM,
                fixedAmount: m.amount !== null, // planned tranche: the release must equal it
            })),
        });
    } catch (err) {
        console.error('Milestone queue failed:', err);
        return NextResponse.json({ success: false, error: 'Approvals are temporarily unavailable.' }, { status: 503 });
    }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { universityScore, reachPerLakh, median, type ResolvedProject } from '@/lib/universityScore';

// Public: university impact scores from resolved projects only, with the breakdown behind each number.
export async function GET() {
    try {
        const heis = await prisma.hEI.findMany({
            select: {
                id: true, name: true, district: true, state: true,
                proposals: {
                    where: { status: 'ACCEPTED', challenge: { status: 'DEPLOYED' } },
                    select: { budgetRequested: true, challenge: { select: { verifiedBeneficiaries: true, citizenRating: true } }, team: { select: { milestones: { select: { dueDate: true, createdAt: true, status: true, hashValue: true, proofUrls: true, gpsLat: true } } } } },
                },
            },
        });
        const projectsOf = (h: (typeof heis)[number]): ResolvedProject[] => h.proposals.map((p) => ({
            budget: p.budgetRequested,
            verifiedBeneficiaries: p.challenge.verifiedBeneficiaries,
            citizenRating: p.challenge.citizenRating,
            milestones: (p.team?.milestones ?? []).map((m) => ({
                dueDate: m.dueDate, submittedAt: m.status === 'PENDING' ? null : m.createdAt,
                sealed: !!m.hashValue, hasProof: m.proofUrls.length > 0 || m.gpsLat !== null,
            })),
        }));
        const reaches = heis.map((h) => reachPerLakh(projectsOf(h))).filter((r): r is number => r !== null);
        const med = median(reaches);
        const rows = heis
            .map((h) => ({ id: h.id, name: h.name, place: [h.district, h.state].filter(Boolean).join(', '), ...(universityScore(projectsOf(h), med) ?? { score: null, breakdown: null, basedOn: 0 }) }))
            .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        return NextResponse.json({ success: true, data: { universities: rows, medianReachPerLakh: med } });
    } catch (err) {
        console.error('University scores failed:', err);
        return NextResponse.json({ success: false, error: 'Scores are temporarily unavailable.' }, { status: 503 });
    }
}

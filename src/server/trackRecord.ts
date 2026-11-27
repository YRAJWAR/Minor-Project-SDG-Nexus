// University track record, computed from resolved projects only (see src/lib/universityScore.ts).
// Closing a report changes it, and matching everywhere (officer suggestions, faculty inbox, smart matching)
// reads it from HEI.pastPerformanceScore — so a citizen's rating today changes which university is suggested tomorrow.
import type { PrismaClient } from '@prisma/client';
import defaultPrisma from '@/lib/prisma';
import { universityScore, reachPerLakh, median, type ResolvedProject } from '@/lib/universityScore';
import { areaNeed } from '@/server/lifecycle';

export async function computeUniversityScores(prisma: PrismaClient = defaultPrisma) {
    const [heis, states] = await Promise.all([
        prisma.hEI.findMany({
            select: {
                id: true, name: true, district: true, state: true,
                proposals: {
                    where: { status: 'ACCEPTED', challenge: { status: 'DEPLOYED' } },
                    select: { budgetRequested: true, challenge: { select: { state: true, verifiedBeneficiaries: true, citizenRating: true } }, team: { select: { milestones: { select: { dueDate: true, createdAt: true, status: true, hashValue: true, proofUrls: true, gpsLat: true } } } } },
                },
            },
        }),
        prisma.state.findMany({ select: { name: true, sdgIndex: true } }),
    ]);
    const stateIndex = new Map(states.map((s) => [s.name.toLowerCase(), s.sdgIndex]));
    const projectsOf = (h: (typeof heis)[number]): ResolvedProject[] => h.proposals.map((p) => ({
        budget: p.budgetRequested,
        verifiedBeneficiaries: p.challenge.verifiedBeneficiaries,
        citizenRating: p.challenge.citizenRating,
        areaNeed: areaNeed(p.challenge.state ? stateIndex.get(p.challenge.state.toLowerCase()) : null),
        milestones: (p.team?.milestones ?? []).map((m) => ({
            dueDate: m.dueDate, submittedAt: m.status === 'PENDING' ? null : m.createdAt,
            sealed: !!m.hashValue, hasProof: m.proofUrls.length > 0 || m.gpsLat !== null,
        })),
    }));
    const med = median(heis.map((h) => reachPerLakh(projectsOf(h))).filter((r): r is number => r !== null));
    return {
        medianReachPerLakh: med,
        universities: heis
            .map((h) => ({ id: h.id, name: h.name, place: [h.district, h.state].filter(Boolean).join(', '), ...(universityScore(projectsOf(h), med) ?? { score: null, breakdown: null, basedOn: 0 }) }))
            .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    };
}

/** Stores each university's current score (0–1) as its track record; null until its first resolved project. */
export async function refreshTrackRecords(prisma: PrismaClient = defaultPrisma) {
    const { universities } = await computeUniversityScores(prisma);
    for (const u of universities) {
        await prisma.hEI.update({ where: { id: u.id }, data: { pastPerformanceScore: u.score === null ? null : u.score / 100 } });
    }
    return universities.length;
}

// University impact score (REBUILD_PLAN.md §6), from RESOLVED projects only, shown with its breakdown.
// score 0–100 = 30% milestones on time + 25% citizen satisfaction + 20% verified beneficiaries per ₹ lakh (vs the
// median university) + 15% proof completeness + 10% area need.
// A part with no data is left out and the remaining weights are scaled up — never filled with a made-up value.
// ponytail: "area need" has no data source yet (no district SDG index in the DB), so it is always left out.

export interface ResolvedProject {
    budget: number;
    verifiedBeneficiaries: number | null;
    citizenRating: number | null;
    milestones: { dueDate: Date; submittedAt: Date | null; sealed: boolean; hasProof: boolean }[];
}

const WEIGHTS = { onTime: 30, satisfaction: 25, reach: 20, proof: 15 } as const;
type Part = keyof typeof WEIGHTS;

/** Beneficiaries per ₹1 lakh across a university's projects (null if none recorded). */
export function reachPerLakh(projects: ResolvedProject[]): number | null {
    const counted = projects.filter((p) => p.verifiedBeneficiaries !== null && p.budget > 0);
    if (!counted.length) return null;
    return counted.reduce((s, p) => s + p.verifiedBeneficiaries!, 0) / (counted.reduce((s, p) => s + p.budget, 0) / 100_000);
}

export function universityScore(projects: ResolvedProject[], medianReach: number | null) {
    if (!projects.length) return null; // no score before the first resolution
    const ms = projects.flatMap((p) => p.milestones.filter((m) => m.submittedAt));
    const ratings = projects.map((p) => p.citizenRating).filter((r): r is number => r !== null);
    const reach = reachPerLakh(projects);
    const parts: Record<Part, number | null> = {
        onTime: ms.length ? ms.filter((m) => m.submittedAt! <= m.dueDate).length / ms.length : null,
        satisfaction: ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length - 1) / 4 : null,
        reach: reach !== null && medianReach ? Math.min(1, reach / (2 * medianReach)) : null, // the median scores 50
        proof: ms.length ? ms.filter((m) => m.sealed && m.hasProof).length / ms.length : null,
    };
    const used = (Object.keys(parts) as Part[]).filter((k) => parts[k] !== null);
    const weight = used.reduce((s, k) => s + WEIGHTS[k], 0);
    const score = weight ? Math.round((100 * used.reduce((s, k) => s + WEIGHTS[k] * parts[k]!, 0)) / weight) : null;
    return {
        score,
        breakdown: Object.fromEntries((Object.keys(parts) as Part[]).map((k) => [k, parts[k] === null ? null : Math.round(parts[k]! * 100)])) as Record<Part, number | null>,
        basedOn: projects.length,
    };
}

export function median(xs: number[]): number | null {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

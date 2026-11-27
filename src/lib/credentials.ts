import CryptoJS from 'crypto-js';

/**
 * Computes the student credential SHA-256 hash.
 * Formula: SHA256(`${studentId}|${challengeId}|${creditPoints}|${issuedAt.toISOString()}`)
 */
export function computeCredentialHash(
    studentId: string,
    challengeId: string,
    creditPoints: number,
    issuedAt: string | Date
): string {
    const timeIso = typeof issuedAt === 'string' ? new Date(issuedAt).toISOString() : issuedAt.toISOString();
    const payload = `${studentId}|${challengeId}|${creditPoints}|${timeIso}`;
    return CryptoJS.SHA256(payload).toString();
}

/**
 * Credentials may be issued only for a RESOLVED project: every milestone paid (zero milestones is NOT complete)
 * and the report closed by the officer (status DEPLOYED, after the citizen confirmed or 14 days passed).
 * Shared by the "ready for credentials" list and credential issuing.
 */
export function isProjectComplete(milestones: { status: string }[], challengeStatus: string): boolean {
    return challengeStatus === 'DEPLOYED' && milestones.length > 0 && milestones.every((m) => m.status === 'CSR_APPROVED');
}

/**
 * Student rating on a credential: faculty 40% + NGO field partner 40% + the citizen's rating of the fix 20%.
 * Without an NGO rating the faculty weight rises to 80%; a missing citizen rating is left out (never assumed).
 */
export function blendedRating(faculty: number, citizen: number | null | undefined, ngo?: number | null): number {
    const parts: [number, number][] = [[faculty, ngo ? 40 : 80]];
    if (ngo) parts.push([ngo, 40]);
    if (citizen) parts.push([citizen, 20]);
    const w = parts.reduce((s, [, k]) => s + k, 0);
    return Math.round((parts.reduce((s, [v, k]) => s + v * k, 0) / w) * 10) / 10;
}

/** Field hours a student may log on one milestone: 40 per week between the previous milestone's due date and this one's. */
export const HOURS_PER_WEEK_CAP = 40;
export function milestoneHoursCap(start: Date, due: Date): number {
    return HOURS_PER_WEEK_CAP * Math.max(1, Math.ceil((due.getTime() - start.getTime()) / (7 * 86_400_000)));
}

/** A student may be on at most this many active projects (team formed, funded or in progress) at once. */
export const MAX_ACTIVE_TEAMS = 3;

const weeksOf = (start: Date, end: Date) => Math.max(1, (end.getTime() - start.getTime()) / (7 * 86_400_000));
/**
 * Hours a week one student is already committed to during [start, end), from hours logged on other milestones.
 * Each log is spread evenly over its own period; only logs whose period overlaps count.
 */
export function weeklyLoad(logs: { hours: number; start: Date; end: Date }[], start: Date, end: Date): number {
    return logs.filter((l) => l.end > start && l.start < end).reduce((t, l) => t + l.hours / weeksOf(l.start, l.end), 0);
}
/** Would logging `hours` over [start, end) push this student past 40 hours a week across all their projects? */
export function overWeeklyLimit(logs: { hours: number; start: Date; end: Date }[], hours: number, start: Date, end: Date) {
    const total = weeklyLoad(logs, start, end) + hours / weeksOf(start, end);
    return { total: Math.round(total), over: total > HOURS_PER_WEEK_CAP + 1e-9 };
}

/** Credits awarded for verified field hours: 30 hours = 1 credit (whole credits only). */
export function creditsForHours(hours: number): number {
    return Math.floor(hours / 30);
}

/**
 * Verifies if the stored hash matches the recomputed SHA-256 hash.
 */
export function verifyCredentialHash(
    storedHash: string,
    studentId: string,
    challengeId: string,
    creditPoints: number,
    issuedAt: string | Date
): { valid: boolean; computedHash: string } {
    const computedHash = computeCredentialHash(studentId, challengeId, creditPoints, issuedAt);
    return {
        valid: storedHash.trim().toLowerCase() === computedHash.trim().toLowerCase(),
        computedHash,
    };
}

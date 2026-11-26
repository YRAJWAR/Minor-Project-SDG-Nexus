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

/** Student rating on a credential: faculty 80%, the citizen's rating of the fix 20% (faculty alone if none). */
export function blendedRating(faculty: number, citizen: number | null | undefined): number {
    return Math.round((citizen ? 0.8 * faculty + 0.2 * citizen : faculty) * 10) / 10;
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

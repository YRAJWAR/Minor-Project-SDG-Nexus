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
 * A project is complete only when it has milestones and every one has been approved for funding.
 * (Zero milestones is NOT complete.) Shared by the "ready for credentials" list and credential issuing.
 */
export function isProjectComplete(milestones: { status: string }[]): boolean {
    return milestones.length > 0 && milestones.every((m) => m.status === 'CSR_APPROVED');
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

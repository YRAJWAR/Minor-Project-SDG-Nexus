import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeCredentialHash } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

// Public endpoint: never return contact details. Mask the surname ("Arjun Sharma" -> "Arjun Sh****").
function maskName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 3) + '****';
    return `${parts[0]} ${parts[parts.length - 1].slice(0, 2)}****`;
}

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ credentialId: string }> }
) {
    const { credentialId } = await context.params;
    const now = new Date().toISOString();

    let cred;
    let challenge;
    try {
        cred = await prisma.studentCredential.findUnique({
            where: { id: credentialId },
            include: { student: { include: { user: { include: { hei: true } } } } },
        });
        // ponytail: credentials don't store challengeId yet, so the hash input is resolved by title.
        // Phase 1 schema adds Credential.challengeId and removes this lookup.
        if (cred) challenge = await prisma.challenge.findFirst({ where: { title: cred.challengeTitle } });
    } catch (dbErr) {
        console.error(`DB error fetching credential ${credentialId}:`, dbErr);
        return NextResponse.json(
            { success: false, error: 'Verification is temporarily unavailable. Please try again shortly.', timestamp: now },
            { status: 503 }
        );
    }

    if (!cred) {
        return NextResponse.json(
            { success: false, error: `No credential exists with ID "${credentialId}".`, timestamp: now },
            { status: 404 }
        );
    }

    // Without the linked challenge the hash cannot be recomputed, so it cannot be called valid.
    const computedHash = challenge
        ? computeCredentialHash(cred.studentProfileId, challenge.id, cred.creditPoints, cred.issuedAt)
        : null;
    const valid = computedHash !== null && cred.hashValue.trim().toLowerCase() === computedHash;

    return NextResponse.json({
        success: true,
        data: {
            id: cred.id,
            studentName: maskName(cred.student.user.full_name),
            branch: cred.student.branch,
            year: cred.student.year,
            universityName: cred.student.user.hei?.name ?? null,
            challengeId: challenge?.id ?? null,
            challengeTitle: cred.challengeTitle,
            challengeDistrict: cred.challengeDistrict,
            sdgTags: cred.sdgTags,
            hoursContributed: cred.hoursContributed,
            creditPoints: cred.creditPoints,
            hashValue: cred.hashValue,
            issuedAt: cred.issuedAt.toISOString(),
            verification: { valid, storedHash: cred.hashValue, computedHash, verifiedAt: now },
        },
        timestamp: now,
    });
}

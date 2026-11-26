import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeMilestoneHash } from '@/lib/merkle';

// Recomputes a milestone's hash from the stored record and compares it with the hash stored at submission.
// The client only says WHICH milestone to check; any hash it sends is ignored.
export async function POST(req: NextRequest) {
    const now = new Date().toISOString();
    const body = await req.json().catch(() => null);
    const milestoneId = typeof body?.milestoneId === 'string' ? body.milestoneId : '';

    if (!milestoneId) {
        return NextResponse.json({ success: false, error: 'milestoneId is required', timestamp: now }, { status: 400 });
    }

    let milestone;
    try {
        milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
    } catch (dbErr) {
        console.error('DB lookup failed in ledger verify:', dbErr);
        return NextResponse.json(
            { success: false, error: 'Verification is temporarily unavailable. Please try again shortly.', timestamp: now },
            { status: 503 }
        );
    }

    if (!milestone) {
        return NextResponse.json(
            { success: false, error: `Milestone with ID ${milestoneId} not found`, timestamp: now },
            { status: 404 }
        );
    }

    const isoTimestamp = milestone.createdAt.toISOString();
    const lat = milestone.gpsLat ?? '';
    const lng = milestone.gpsLng ?? '';
    // ponytail: hashes the proof URL, not the file bytes. Phase 3 hashes the uploaded file on the server.
    const computedHash = computeMilestoneHash(milestone.proofUrls[0] ?? '', isoTimestamp, lat, lng);
    const storedHash = milestone.hashValue;

    return NextResponse.json({
        success: true,
        data: {
            // A milestone that was never sealed cannot be valid.
            valid: storedHash !== null && storedHash === computedHash,
            sealed: storedHash !== null,
            storedHash,
            computedHash,
            timestamp: isoTimestamp,
            coords: lat !== '' && lng !== '' ? `${lat}°N, ${lng}°E` : null,
            milestoneTitle: milestone.title,
        },
        timestamp: now,
    });
}

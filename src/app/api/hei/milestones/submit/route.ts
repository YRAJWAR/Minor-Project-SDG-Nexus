import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';
import { computeMilestoneHash } from '@/lib/merkle';

const fail = (error: string, status: number) =>
    NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });

const toCoord = (v: unknown, limit: number): number | null => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && Math.abs(n) <= limit ? n : NaN;
};

export async function POST(request: NextRequest) {
    const user = await requireUser(request, ['FACULTY', 'STUDENT']);
    if (user instanceof NextResponse) return user;

    const body = await request.json().catch(() => null);
    if (!body) return fail('Invalid request body', 400);
    const { projectId, teamId, title, description, dueDate, proofUrls = [], proofVideoUrl, gpsLat, gpsLng } = body;

    if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) return fail('Milestone title must be 1–200 characters', 400);
    if (!dueDate || Number.isNaN(new Date(dueDate).getTime())) return fail('A valid due date is required', 400);
    const teamOrProjectId = teamId || projectId;
    if (!teamOrProjectId) return fail('Team ID or Project ID is required', 400);
    if (!Array.isArray(proofUrls) || proofUrls.length > 5) return fail('Up to 5 proof files are allowed', 400);

    const lat = toCoord(gpsLat, 90);
    const lng = toCoord(gpsLng, 180);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return fail('GPS coordinates are invalid', 400);

    let team;
    try {
        team = await prisma.projectTeam.findFirst({
            where: { OR: [{ id: teamOrProjectId }, { proposalId: teamOrProjectId }] },
            include: { proposal: true, members: { select: { student: { select: { userId: true } } } } },
        });
    } catch (dbErr) {
        console.error('DB error loading team for milestone:', dbErr);
        return fail('Milestones cannot be submitted right now. Please try again.', 503);
    }
    if (!team) return fail(`No project team found for "${teamOrProjectId}"`, 404);
    const onTeam = user.role === 'FACULTY'
        ? team.heiId === user.heiId
        : team.members.some((m) => m.student.userId === user.id);
    if (!onTeam) return fail("Only this project's faculty or team members can submit milestones.", 403);

    // The hash is computed from exactly what is stored (same timestamp, same numbers), so
    // /api/ledger/verify can recompute it later. Any hash sent by the client is ignored.
    const createdAt = new Date();
    const hashValue = computeMilestoneHash(proofUrls[0] ?? '', createdAt, lat ?? '', lng ?? '');

    let milestone;
    try {
        milestone = await prisma.milestone.create({
            data: {
                teamId: team.id,
                title: title.trim(),
                description: typeof description === 'string' ? description.trim().slice(0, 3000) : '',
                dueDate: new Date(dueDate),
                status: 'SUBMITTED',
                proofUrls,
                proofVideoUrl: typeof proofVideoUrl === 'string' ? proofVideoUrl : null,
                hashValue,
                gpsLat: lat,
                gpsLng: lng,
                exifTimestamp: null, // ponytail: EXIF capture time is not read server-side yet (Phase 3 uploads)
                createdAt,
            },
        });
    } catch (dbErr) {
        console.error('Milestone could not be saved:', dbErr);
        return fail('The milestone could not be saved. Nothing was submitted — please try again.', 503);
    }

    try {
        const { NotificationTriggers } = await import('@/lib/notifications');
        await NotificationTriggers.milestoneSubmitted({ id: milestone.id, title: milestone.title, challengeId: team.proposal.challengeId });
    } catch (notifErr) {
        console.warn('Notification creation failed for milestone:', notifErr);
    }

    return NextResponse.json({
        success: true,
        data: { milestone, hashValue, isSealed: true, message: 'Milestone saved and its hash recorded' },
        timestamp: new Date().toISOString(),
    });
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';
import { computeMilestoneHash } from '@/lib/merkle';
import { transition } from '@/server/lifecycle';

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
    const { projectId, teamId, milestoneId, title, description, dueDate, proofUrls = [], proofVideoUrl, gpsLat, gpsLng } = body;

    if (typeof milestoneId !== 'string') {
        if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) return fail('Milestone title must be 1–200 characters', 400);
        if (!dueDate || Number.isNaN(new Date(dueDate).getTime())) return fail('A valid due date is required', 400);
    }
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
            include: { proposal: { include: { challenge: { select: { id: true, status: true } } } }, members: { select: { student: { select: { userId: true } } } } },
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
    const challengeStatus = team.proposal.challenge.status;
    // Planned (Phase 3) projects can only report work once funded; older projects without a plan keep working.
    const planned = await prisma.milestone.count({ where: { teamId: team.id, amount: { not: null } } });
    if (planned > 0 && !['FUNDED', 'IN_PROGRESS'].includes(challengeStatus)) {
        return fail('Milestones can be submitted once the project is fully funded.', 409);
    }
    if (planned > 0 && typeof milestoneId !== 'string') return fail('Choose which planned milestone this proof is for.', 400);

    // The hash is computed from exactly what is stored (same timestamp, same numbers), so
    // /api/ledger/verify can recompute it later. Any hash sent by the client is ignored.
    const createdAt = new Date();
    const hashValue = computeMilestoneHash(proofUrls[0] ?? '', createdAt, lat ?? '', lng ?? '');

    let milestone;
    try {
        // A planned milestone (PENDING, or REJECTED and being redone) gets its proof; otherwise a new one is created.
        if (typeof milestoneId === 'string') {
            const target = await prisma.milestone.findUnique({ where: { id: milestoneId } });
            if (!target || target.teamId !== team.id) return fail('That milestone is not part of this project.', 404);
            if (target.status !== 'PENDING' && target.status !== 'REJECTED') return fail(`This milestone is already ${target.status.toLowerCase().replace('_', ' ')}.`, 409);
            const { count } = await prisma.milestone.updateMany({
                where: { id: target.id, status: target.status },
                data: {
                    description: typeof description === 'string' ? description.trim().slice(0, 3000) : target.description,
                    status: 'SUBMITTED', proofUrls, proofVideoUrl: typeof proofVideoUrl === 'string' ? proofVideoUrl : null,
                    hashValue, gpsLat: lat, gpsLng: lng, createdAt,
                },
            });
            if (count !== 1) return fail('This milestone was just changed. Reload and try again.', 409);
            milestone = await prisma.milestone.findUniqueOrThrow({ where: { id: target.id } });
        } else milestone = await prisma.milestone.create({
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

    // The first proof on a funded project moves the report to "in progress".
    if (challengeStatus === 'FUNDED') {
        try {
            await transition(team.proposal.challenge.id, 'START', user);
        } catch (err) {
            console.warn('Could not mark the project as started:', err);
        }
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

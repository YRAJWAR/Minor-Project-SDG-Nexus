import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { MilestoneStatus } from '@prisma/client';

const fail = (error: string, status: number) =>
    NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });

// Allowed milestone moves. Anything else is refused.
// ponytail: role checks (officer verifies, CSR approves) arrive with real auth in Phase 1.
const NEXT: Record<MilestoneStatus, MilestoneStatus[]> = {
    PENDING: ['SUBMITTED'],
    SUBMITTED: ['GP_VERIFIED', 'REJECTED'],
    GP_VERIFIED: ['CSR_APPROVED', 'REJECTED'],
    CSR_APPROVED: [],
    REJECTED: ['SUBMITTED'],
};

const findTeam = (projectId: string) =>
    prisma.projectTeam.findFirst({ where: { OR: [{ id: projectId }, { proposalId: projectId }] }, select: { id: true } });

export async function GET(_request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    const { projectId } = await context.params;

    let team;
    try {
        team = await prisma.projectTeam.findFirst({
            where: { OR: [{ id: projectId }, { proposalId: projectId }] },
            include: { milestones: { orderBy: { dueDate: 'asc' } } },
        });
    } catch (dbErr) {
        console.error(`Prisma error fetching milestones for ${projectId}:`, dbErr);
        return fail('Milestones are temporarily unavailable.', 503);
    }
    if (!team) return fail(`No project found for "${projectId}"`, 404);

    return NextResponse.json({ success: true, data: team.milestones, timestamp: new Date().toISOString() });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    const { projectId } = await context.params;
    const body = await request.json().catch(() => null);
    const { milestoneId, status, verifierCode, fundReleased } = body ?? {};

    if (typeof milestoneId !== 'string' || typeof status !== 'string') return fail('milestoneId and status are required', 400);
    if (!(status in NEXT)) return fail(`Unknown milestone status "${status}"`, 400);
    const next = status as MilestoneStatus;
    const amount = fundReleased === undefined ? undefined : Number(fundReleased);
    if (next === 'CSR_APPROVED' && !(amount !== undefined && Number.isFinite(amount) && amount > 0)) {
        return fail('Approving a milestone for funding requires the released amount.', 400);
    }

    let milestone;
    try {
        const team = await findTeam(projectId);
        if (!team) return fail(`No project found for "${projectId}"`, 404);

        const current = await prisma.milestone.findUnique({
            where: { id: milestoneId },
            include: {
                team: {
                    include: {
                        proposal: true,
                        members: { include: { student: true } },
                        hei: { include: { users: true } },
                    },
                },
            },
        });
        if (!current || current.teamId !== team.id) return fail('Milestone not found in this project', 404);
        if (!NEXT[current.status].includes(next)) {
            return fail(`A milestone cannot move from ${current.status} to ${next}.`, 409);
        }

        milestone = await prisma.milestone.update({
            where: { id: milestoneId },
            data: {
                status: next,
                ...(typeof verifierCode === 'string' ? { verifierCode } : {}),
                ...(next === 'CSR_APPROVED' ? { fundReleased: amount } : {}),
            },
        });

        const challengeId = current.team.proposal.challengeId;
        const heiUserIds = current.team.hei.users.map((u) => u.id);
        const studentUserIds = current.team.members.map((m) => m.student.userId);
        try {
            const { NotificationTriggers } = await import('@/lib/notifications');
            if (next === 'GP_VERIFIED') {
                await NotificationTriggers.milestoneVerified({ id: milestone.id, title: milestone.title, challengeId }, heiUserIds, studentUserIds);
            }
            if (next === 'CSR_APPROVED') {
                await NotificationTriggers.fundReleased({ id: milestone.id, title: milestone.title, challengeId }, amount!, null, heiUserIds[0] ?? null);
            }
        } catch (notifErr) {
            console.warn('Milestone notification failed:', notifErr);
        }
    } catch (dbErr) {
        console.error('Milestone update failed:', dbErr);
        return fail('The milestone could not be updated. Nothing was changed — please try again.', 503);
    }

    return NextResponse.json({ success: true, data: milestone, timestamp: new Date().toISOString() });
}

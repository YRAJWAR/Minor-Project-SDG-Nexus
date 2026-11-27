import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { MilestoneStatus, Role } from '@prisma/client';
import { requireUser, inJurisdiction } from '@/server/middleware/auth';
import { transition } from '@/server/lifecycle';
import { appendLedger } from '@/server/ledger';

const fail = (error: string, status: number) =>
    NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });

// Allowed milestone moves. Anything else is refused.
const NEXT: Record<MilestoneStatus, MilestoneStatus[]> = {
    PENDING: ['SUBMITTED'],
    SUBMITTED: ['GP_VERIFIED', 'REJECTED'],
    GP_VERIFIED: ['CSR_APPROVED', 'REJECTED'],
    CSR_APPROVED: [],
    REJECTED: ['SUBMITTED'],
};

const findTeam = (projectId: string) =>
    prisma.projectTeam.findFirst({ where: { OR: [{ id: projectId }, { proposalId: projectId }] }, select: { id: true } });

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    const viewer = await requireUser(request);
    if (viewer instanceof NextResponse) return viewer;
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

// Who may make each move: the district officer verifies or rejects, a CSR partner releases funds,
// and the team resubmits after a rejection.
const MOVER: Record<MilestoneStatus, Role[]> = {
    PENDING: [],
    SUBMITTED: ['FACULTY', 'STUDENT'],
    GP_VERIFIED: ['OFFICER', 'ADMIN'],
    REJECTED: ['OFFICER', 'ADMIN'],
    CSR_APPROVED: ['CSR', 'ADMIN'],
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
    const user = await requireUser(request);
    if (user instanceof NextResponse) return user;
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
                        proposal: { include: { challenge: { select: { district: true } } } },
                        members: { include: { student: true } },
                        hei: { include: { users: true } },
                    },
                },
            },
        });
        if (!current || current.teamId !== team.id) return fail('Milestone not found in this project', 404);
        if (!MOVER[next].includes(user.role)) return fail(`Your role cannot move a milestone to ${next}.`, 403);
        if (user.role === 'OFFICER' && !inJurisdiction(user, current.team.proposal.challenge.district)) {
            return fail('This project is outside your district.', 403);
        }
        if (next === 'SUBMITTED') {
            const onTeam = user.role === 'FACULTY'
                ? current.team.heiId === user.heiId
                : current.team.members.some((m) => m.student.userId === user.id);
            if (!onTeam) return fail("Only this project's faculty or team members can resubmit.", 403);
        }
        if (!NEXT[current.status].includes(next)) {
            return fail(`A milestone cannot move from ${current.status} to ${next}.`, 409);
        }

        const challengeId = current.team.proposal.challengeId;
        if (next === 'CSR_APPROVED' && current.amount !== null && Math.round(amount!) !== Math.round(current.amount)) {
            return fail(`This milestone's agreed tranche is ₹${Math.round(current.amount).toLocaleString('en-IN')}.`, 400);
        }
        const planned = current.amount !== null;
        milestone = await prisma.$transaction(async (tx) => {
            if (next === 'CSR_APPROVED' && planned) {
                // Only a funder who committed to this project may release, and never more than they committed.
                if (!user.organizationId) throw new Error('NO_ORG');
                const c = await tx.fundingCommitment.findUnique({ where: { challengeId_csrOrgId: { challengeId, csrOrgId: user.organizationId } } });
                if (!c || c.amount - c.released < amount!) throw new Error('OVER_COMMITMENT');
                await tx.fundingCommitment.update({ where: { id: c.id }, data: { released: { increment: amount! } } });
            }
            const { count } = await tx.milestone.updateMany({
                where: { id: milestoneId, status: current.status },
                data: {
                    status: next,
                    ...(typeof verifierCode === 'string' ? { verifierCode } : {}),
                    ...(next === 'CSR_APPROVED' ? { fundReleased: amount, releasedAt: new Date(), releasedByOrgId: user.organizationId ?? null } : {}),
                },
            });
            if (count !== 1) throw new Error('CHANGED');
            await appendLedger({
                actor_id: user.id, actor_role: user.role, action: `MILESTONE_${next}`, entity_type: 'Milestone', entity_id: milestoneId,
                previous_value: { status: current.status }, new_value: { status: next, ...(next === 'CSR_APPROVED' ? { released: amount } : {}), challengeId },
            }, tx);
            return tx.milestone.findUniqueOrThrow({ where: { id: milestoneId } });
        }).catch((err: Error) => {
            if (err.message === 'NO_ORG' || err.message === 'OVER_COMMITMENT') return 'OVER_COMMITMENT' as const;
            if (err.message === 'CHANGED') return 'CHANGED' as const;
            throw err;
        });
        if (milestone === 'OVER_COMMITMENT') return fail('Your organisation has not committed enough to this project to release this tranche.', 403);
        if (milestone === 'CHANGED') return fail('This milestone was just changed by someone else. Reload and try again.', 409);

        // Last tranche paid → the project is complete.
        if (next === 'CSR_APPROVED' && planned) {
            const unpaid = await prisma.milestone.count({ where: { teamId: current.teamId, status: { not: 'CSR_APPROVED' } } });
            if (unpaid === 0) await transition(challengeId, 'COMPLETE', user).catch((e) => console.warn('Could not complete project:', e));
        }

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

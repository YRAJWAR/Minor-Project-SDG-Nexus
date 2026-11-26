// The one place a challenge changes state (REBUILD_PLAN.md §5). transition() checks that the action is allowed
// from the current status, that the actor may do it (role + district), and the action's preconditions; then it
// writes the change, a ledger entry and the notifications in ONE transaction. allowedActions() tells the UI
// which buttons to show, so pages never decide that on their own.
import type { ChallengeStatus, Role } from '@prisma/client';
import prisma from '@/lib/prisma';
import { appendLedger } from '@/server/ledger';
import { audienceWhere } from '@/lib/notifications';

export type Action = 'VERIFY' | 'REJECT' | 'MERGE' | 'ASSIGN' | 'ENDORSE';

export interface Actor { id: string; role: Role; district?: { name: string } | null }
export interface ChallengeLike { id: string; status: ChallengeStatus; district: string; submitterId: string | null }

const AWAITING_OFFICER: ChallengeStatus[] = ['SUBMITTED', 'AI_PROCESSED'];
const CLOSED: ChallengeStatus[] = ['COMPLETED', 'DEPLOYED', 'REJECTED', 'MERGED'];

// action → statuses it can start from, and who may take it
const RULES: Record<Action, { from: ChallengeStatus[]; roles: Role[]; officerOnlyInDistrict?: boolean }> = {
    VERIFY: { from: AWAITING_OFFICER, roles: ['OFFICER', 'ADMIN'], officerOnlyInDistrict: true },
    REJECT: { from: AWAITING_OFFICER, roles: ['OFFICER', 'ADMIN'], officerOnlyInDistrict: true },
    MERGE: { from: AWAITING_OFFICER, roles: ['OFFICER', 'ADMIN'], officerOnlyInDistrict: true },
    ASSIGN: { from: ['VALIDATED'], roles: ['OFFICER', 'ADMIN'], officerOnlyInDistrict: true },
    ENDORSE: { from: ['SUBMITTED', 'AI_PROCESSED', 'VALIDATED', 'UNIVERSITY_ASSIGNED', 'TEAM_FORMED', 'IN_PROGRESS'], roles: ['CITIZEN', 'NGO', 'STUDENT', 'FACULTY'] },
};

const sameDistrict = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Why this actor can't take this action now, or null if they can. */
export function blockedReason(action: Action, ch: ChallengeLike, actor: Actor): string | null {
    const rule = RULES[action];
    if (!rule.from.includes(ch.status)) return `A ${ch.status.toLowerCase().replace(/_/g, ' ')} report cannot be ${action.toLowerCase()}ed.`;
    if (!rule.roles.includes(actor.role)) return 'Your role cannot do this.';
    if (rule.officerOnlyInDistrict && actor.role === 'OFFICER' && !(actor.district && sameDistrict(actor.district.name, ch.district))) {
        return 'This report is outside your district.';
    }
    if (action === 'ENDORSE' && ch.submitterId === actor.id) return 'You reported this yourself.';
    return null;
}

export function allowedActions(ch: ChallengeLike, actor: Actor): Action[] {
    return (Object.keys(RULES) as Action[]).filter((a) => blockedReason(a, ch, actor) === null);
}

// ── Priority (officer queue order), shown with its breakdown ──
const SEVERITY: Record<string, number> = { NORMAL: 0.25, MODERATE: 0.5, HIGH: 0.75, CRITICAL: 1 };
export const OVERDUE_DAYS = 7;

export function priority(input: { urgency: string; endorsements: number; districtOpen: number; maxDistrictOpen: number; createdAt: Date; status: ChallengeStatus }, now = Date.now()) {
    const days = Math.max(0, (now - input.createdAt.getTime()) / 86_400_000);
    const parts = {
        severity: SEVERITY[input.urgency] ?? SEVERITY.NORMAL,
        endorsements: Math.min(1, Math.log2(1 + input.endorsements) / Math.log2(21)), // 20 endorsements = full marks
        areaBacklog: input.maxDistrictOpen > 0 ? input.districtOpen / input.maxDistrictOpen : 0,
        waiting: Math.min(1, days / 14),
    };
    const score = Math.round(100 * (0.35 * parts.severity + 0.25 * parts.endorsements + 0.2 * parts.areaBacklog + 0.2 * parts.waiting));
    return {
        score,
        breakdown: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 100)])) as Record<keyof typeof parts, number>,
        overdue: AWAITING_OFFICER.includes(input.status) && days > OVERDUE_DAYS,
        daysWaiting: Math.floor(days),
    };
}

export class LifecycleError extends Error {
    constructor(message: string, public status: 400 | 403 | 404 | 409) { super(message); }
}

export interface Payload { reason?: string; targetId?: string; heiId?: string; sdgTags?: number[] }

/** Runs one action. Throws LifecycleError (with an HTTP status) when it is not allowed. */
export async function transition(challengeId: string, action: Action, actor: Actor, payload: Payload = {}) {
    if (!(action in RULES)) throw new LifecycleError(`Unknown action "${action}"`, 400);
    const ch = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!ch) throw new LifecycleError(`No report found with ID "${challengeId}"`, 404);
    const blocked = blockedReason(action, ch, actor);
    if (blocked) throw new LifecycleError(blocked, blocked.includes('cannot be') ? 409 : 403);

    // Preconditions and the change itself, per action.
    let next: ChallengeStatus = ch.status;
    const data: Record<string, unknown> = {};
    let notify: { roles: Role[]; message: string; extraUserIds: string[] } | null = null;
    let target: { id: string; title: string } | null = null;
    let hei: { id: string; name: string } | null = null;

    if (action === 'VERIFY') {
        next = 'VALIDATED';
        if (payload.sdgTags !== undefined) {
            const tags = [...new Set(payload.sdgTags)];
            if (!tags.length || tags.length > 5 || !tags.every((t) => Number.isInteger(t) && t >= 1 && t <= 17)) {
                throw new LifecycleError('Choose 1–5 SDGs between 1 and 17.', 400);
            }
            data.sdgTags = tags;
        }
        notify = { roles: ['FACULTY'], message: `New verified problem open for proposals: “${ch.title}” (${ch.district}).`, extraUserIds: ch.submitterId ? [ch.submitterId] : [] };
    } else if (action === 'REJECT') {
        const reason = payload.reason?.trim() ?? '';
        if (reason.length < 10 || reason.length > 500) throw new LifecycleError('Give a reason of 10–500 characters; the citizen will see it.', 400);
        next = 'REJECTED';
        data.rejectReason = reason;
        notify = { roles: [], message: `Your report “${ch.title}” was not accepted: ${reason}`, extraUserIds: ch.submitterId ? [ch.submitterId] : [] };
    } else if (action === 'MERGE') {
        if (!payload.targetId || payload.targetId === ch.id) throw new LifecycleError('Choose the report to merge into.', 400);
        const t = await prisma.challenge.findUnique({ where: { id: payload.targetId }, select: { id: true, title: true, district: true, status: true } });
        if (!t) throw new LifecycleError('The report to merge into was not found.', 404);
        if (!sameDistrict(t.district, ch.district)) throw new LifecycleError('Reports can only be merged within the same district.', 400);
        if (CLOSED.includes(t.status)) throw new LifecycleError('Cannot merge into a closed report.', 409);
        next = 'MERGED';
        data.mergedIntoId = t.id;
        target = t;
        notify = { roles: [], message: `Your report “${ch.title}” was merged into “${t.title}”, which is being followed up. Your support was added to it.`, extraUserIds: ch.submitterId ? [ch.submitterId] : [] };
    } else if (action === 'ASSIGN') {
        if (!payload.heiId) throw new LifecycleError('Choose a university.', 400);
        hei = await prisma.hEI.findUnique({ where: { id: payload.heiId }, select: { id: true, name: true } });
        if (!hei) throw new LifecycleError(`No university found with ID "${payload.heiId}"`, 400);
        next = 'UNIVERSITY_ASSIGNED';
        notify = { roles: [], message: `“${ch.title}” (${ch.district}) was assigned to ${hei.name}.`, extraUserIds: ch.submitterId ? [ch.submitterId] : [] };
    }

    const audience = notify ? [
        ...(notify.roles.length ? await prisma.user.findMany({ where: await audienceWhere(notify.roles, ch.id), select: { id: true } }) : []).map((u) => u.id),
        ...notify.extraUserIds,
    ] : [];

    return prisma.$transaction(async (tx) => {
        if (action === 'ENDORSE') {
            const existing = await tx.endorsement.findUnique({ where: { challengeId_userId: { challengeId: ch.id, userId: actor.id } } });
            if (existing) throw new LifecycleError('You have already endorsed this report.', 409);
            await tx.endorsement.create({ data: { challengeId: ch.id, userId: actor.id } });
        } else {
            // Guard against a concurrent change: only update if the status is still what we checked.
            const { count } = await tx.challenge.updateMany({ where: { id: ch.id, status: ch.status }, data: { status: next, ...data } });
            if (count !== 1) throw new LifecycleError('This report was just changed by someone else. Reload and try again.', 409);
        }
        if (action === 'MERGE' && target && ch.submitterId) {
            await tx.endorsement.upsert({ where: { challengeId_userId: { challengeId: target.id, userId: ch.submitterId } }, create: { challengeId: target.id, userId: ch.submitterId }, update: {} });
        }
        if (action === 'ASSIGN' && hei) {
            // ponytail: routing still creates a placeholder proposal (fixed budget/timeline) for the university inbox.
            // Phase 3 replaces it with university-written proposals the officer selects from.
            await tx.challengeProposal.create({
                data: { challengeId: ch.id, heiId: hei.id, approach: `Assigned by the district officer to ${hei.name}.`, status: 'SUBMITTED', timelineWeeks: 12, budgetRequested: 350000, ipDeclaration: 'Open source for public benefit.' },
            });
        }
        await appendLedger({
            actor_id: actor.id, actor_role: actor.role, action: `CHALLENGE_${action}`, entity_type: 'Challenge', entity_id: ch.id,
            previous_value: { status: ch.status },
            new_value: { status: next, ...data, ...(hei ? { heiId: hei.id } : {}) },
        }, tx);
        if (notify && audience.length) {
            await tx.notification.createMany({
                data: [...new Set(audience)].filter((id) => id !== actor.id).map((userId) => ({ userId, message: notify!.message, entityType: 'CHALLENGE', entityId: ch.id, challengeId: ch.id, priority: action === 'REJECT' ? 'P1' : 'P2' })),
            });
        }
        const updated = { ...ch, status: next };
        return { challengeId: ch.id, previousStatus: ch.status, status: next, allowedActions: allowedActions(updated, actor) };
    });
}

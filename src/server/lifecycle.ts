// The one place a challenge changes state (REBUILD_PLAN.md §5). transition() checks that the action is allowed
// from the current status, that the actor may do it (role + district), and the action's preconditions; then it
// writes the change, a ledger entry and the notifications in ONE transaction. allowedActions() tells the UI
// which buttons to show, so pages never decide that on their own.
import type { ChallengeStatus, Role } from '@prisma/client';
import prisma from '@/lib/prisma';
import { appendLedger } from '@/server/ledger';
import { audienceWhere } from '@/lib/notifications';

export type Action = 'VERIFY' | 'REJECT' | 'MERGE' | 'ASSIGN' | 'ENDORSE' | 'SELECT_PROPOSAL' | 'COMMIT_FUNDS' | 'START' | 'COMPLETE' | 'CONFIRM' | 'DISPUTE' | 'CLOSE';

export interface Actor { id: string; role: Role; district?: { name: string } | null; organizationId?: string | null }
export interface ChallengeLike { id: string; status: ChallengeStatus; district: string; submitterId: string | null; completedAt?: Date | null; confirmedAt?: Date | null }

const AWAITING_OFFICER: ChallengeStatus[] = ['SUBMITTED', 'AI_PROCESSED'];
const CLOSED: ChallengeStatus[] = ['COMPLETED', 'DEPLOYED', 'REJECTED', 'MERGED'];

// action → statuses it can start from, and who may take it
const RULES: Record<Action, { from: ChallengeStatus[]; roles: Role[]; officerOnlyInDistrict?: boolean }> = {
    VERIFY: { from: AWAITING_OFFICER, roles: ['OFFICER', 'ADMIN'], officerOnlyInDistrict: true },
    REJECT: { from: AWAITING_OFFICER, roles: ['OFFICER', 'ADMIN'], officerOnlyInDistrict: true },
    MERGE: { from: AWAITING_OFFICER, roles: ['OFFICER', 'ADMIN'], officerOnlyInDistrict: true },
    ASSIGN: { from: ['VALIDATED'], roles: ['OFFICER', 'ADMIN'], officerOnlyInDistrict: true },
    ENDORSE: { from: ['SUBMITTED', 'AI_PROCESSED', 'VALIDATED', 'UNIVERSITY_ASSIGNED', 'TEAM_FORMED', 'FUNDED', 'IN_PROGRESS'], roles: ['CITIZEN', 'NGO', 'STUDENT', 'FACULTY'] },
    // Phase 3: the officer picks one university proposal; CSR partners fund it; work starts and completes.
    SELECT_PROPOSAL: { from: ['VALIDATED', 'UNIVERSITY_ASSIGNED'], roles: ['OFFICER', 'ADMIN'], officerOnlyInDistrict: true },
    COMMIT_FUNDS: { from: ['TEAM_FORMED'], roles: ['CSR'] },
    START: { from: ['FUNDED'], roles: ['FACULTY', 'STUDENT', 'ADMIN'] }, // taken automatically when the first milestone is submitted
    COMPLETE: { from: ['IN_PROGRESS'], roles: ['CSR', 'OFFICER', 'ADMIN'] }, // taken automatically when the last tranche is released
    // Phase 4: the reporting citizen confirms (with a rating) or disputes; the officer closes and records verified impact.
    CONFIRM: { from: ['COMPLETED'], roles: ['CITIZEN', 'NGO'] },
    DISPUTE: { from: ['COMPLETED'], roles: ['CITIZEN', 'NGO'] },
    CLOSE: { from: ['COMPLETED'], roles: ['OFFICER', 'ADMIN'], officerOnlyInDistrict: true },
};

/** Days the officer waits for the citizen's answer before closing without it. */
export const CONFIRM_WAIT_DAYS = 14;

// ── Proposal plan (team + milestones), checked on submit and again on selection ──
export interface PlanMember { studentProfileId: string; role?: string }
export interface PlanMilestone { title: string; week: number; amount: number }
export interface TeamPlan { facultyId: string; members: PlanMember[] }

/** Problems with a proposal's plan, or [] if it is complete. Pure, so it is tested directly. */
export function validatePlan(team: TeamPlan | null | undefined, milestones: PlanMilestone[] | null | undefined, budget: number, weeks: number): string[] {
    const errors: string[] = [];
    const ids = (team?.members ?? []).map((m) => m.studentProfileId);
    if (!team?.facultyId) errors.push('A faculty lead is required.');
    if (ids.length < 2 || ids.length > 8) errors.push('The team needs 2–8 students.');
    if (new Set(ids).size !== ids.length) errors.push('A student is listed twice.');
    const ms = milestones ?? [];
    if (ms.length < 2 || ms.length > 6) errors.push('Plan 2–6 milestones.');
    for (const [i, m] of ms.entries()) {
        if (!m.title?.trim() || m.title.trim().length > 120) errors.push(`Milestone ${i + 1} needs a title (up to 120 characters).`);
        if (!Number.isInteger(m.week) || m.week < 1 || m.week > weeks) errors.push(`Milestone ${i + 1} must fall within weeks 1–${weeks}.`);
        if (!(Number.isFinite(m.amount) && m.amount > 0)) errors.push(`Milestone ${i + 1} needs an amount above ₹0.`);
    }
    const total = ms.reduce((t, m) => t + (Number.isFinite(m.amount) ? m.amount : 0), 0);
    if (ms.length && Math.round(total) !== Math.round(budget)) errors.push(`Milestone amounts add up to ₹${Math.round(total).toLocaleString('en-IN')}, but the budget is ₹${Math.round(budget).toLocaleString('en-IN')}.`);
    return errors;
}

const sameDistrict = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Why this actor can't take this action now, or null if they can. */
export function blockedReason(action: Action, ch: ChallengeLike, actor: Actor): string | null {
    const rule = RULES[action];
    if (!rule.roles.includes(actor.role)) return 'Your role cannot do this.';
    if (!rule.from.includes(ch.status)) return `This action is not possible while the report is ${ch.status.toLowerCase().replace(/_/g, ' ')}.`;
    if (rule.officerOnlyInDistrict && actor.role === 'OFFICER' && !(actor.district && sameDistrict(actor.district.name, ch.district))) {
        return 'This report is outside your district.';
    }
    if (action === 'ENDORSE' && ch.submitterId === actor.id) return 'You reported this yourself.';
    if ((action === 'CONFIRM' || action === 'DISPUTE') && ch.submitterId !== actor.id) return 'Only the person who reported this can confirm or dispute the fix.';
    if (action === 'CONFIRM' && ch.confirmedAt) return 'You have already confirmed this fix.';
    if (action === 'CLOSE' && !ch.confirmedAt && (!ch.completedAt || Date.now() - ch.completedAt.getTime() < CONFIRM_WAIT_DAYS * 86_400_000)) {
        return `Waiting for the citizen's confirmation (or ${CONFIRM_WAIT_DAYS} days after completion).`;
    }
    return null;
}

export function allowedActions(ch: ChallengeLike, actor: Actor): Action[] {
    return (Object.keys(RULES) as Action[]).filter((a) => blockedReason(a, ch, actor) === null);
}

// ── Priority (officer queue order), shown with its breakdown ──
const SEVERITY: Record<string, number> = { NORMAL: 0.25, MODERATE: 0.5, HIGH: 0.75, CRITICAL: 1 };
export const OVERDUE_DAYS = 7;

/** Need of a state, 0-1, from its NITI Aayog SDG India Index score: lower score = more need (index 50 or below = full need). */
export function areaNeed(sdgIndex: number | null | undefined): number | null {
    return typeof sdgIndex === 'number' ? Math.min(1, Math.max(0, (100 - sdgIndex) / 50)) : null;
}

export function priority(input: { urgency: string; endorsements: number; districtOpen: number; maxDistrictOpen: number; stateSdgIndex?: number | null; createdAt: Date; status: ChallengeStatus }, now = Date.now()) {
    const days = Math.max(0, (now - input.createdAt.getTime()) / 86_400_000);
    const need = areaNeed(input.stateSdgIndex);
    const parts = {
        severity: SEVERITY[input.urgency] ?? SEVERITY.NORMAL,
        endorsements: Math.min(1, Math.log2(1 + input.endorsements) / Math.log2(21)), // 20 endorsements = full marks
        areaBacklog: input.maxDistrictOpen > 0 ? input.districtOpen / input.maxDistrictOpen : 0,
        waiting: Math.min(1, days / 14),
    };
    // The 20% "area" share: half the state's SDG Index need, half the district's open backlog (backlog alone if the index is unknown).
    const area = need === null ? parts.areaBacklog : (need + parts.areaBacklog) / 2;
    const score = Math.round(100 * (0.35 * parts.severity + 0.25 * parts.endorsements + 0.2 * area + 0.2 * parts.waiting));
    return {
        score,
        breakdown: { ...(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 100)])) as Record<keyof typeof parts, number>), areaNeed: need === null ? null : Math.round(need * 100) },
        overdue: AWAITING_OFFICER.includes(input.status) && days > OVERDUE_DAYS,
        daysWaiting: Math.floor(days),
    };
}

export class LifecycleError extends Error {
    constructor(message: string, public status: 400 | 403 | 404 | 409) { super(message); }
}

export interface Payload { reason?: string; targetId?: string; heiId?: string; sdgTags?: number[]; proposalId?: string; amount?: number; rating?: number; beneficiaries?: number }

/** Runs one action. Throws LifecycleError (with an HTTP status) when it is not allowed. */
export async function transition(challengeId: string, action: Action, actor: Actor, payload: Payload = {}) {
    if (!(action in RULES)) throw new LifecycleError(`Unknown action "${action}"`, 400);
    const ch = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!ch) throw new LifecycleError(`No report found with ID "${challengeId}"`, 404);
    const blocked = blockedReason(action, ch, actor);
    if (blocked) throw new LifecycleError(blocked, /not possible while|already|Waiting/.test(blocked) ? 409 : 403);

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

    let selected: { id: string; heiId: string; teamPlan: unknown; milestonePlan: unknown; budgetRequested: number } | null = null;
    let commitAmount = 0;
    let commitBudget = 0;
    if (action === 'SELECT_PROPOSAL') {
        const p = payload.proposalId ? await prisma.challengeProposal.findUnique({ where: { id: payload.proposalId }, include: { hei: { select: { name: true } } } }) : null;
        if (!p || p.challengeId !== ch.id) throw new LifecycleError('Choose one of this report\'s proposals.', 400);
        if (p.status !== 'SUBMITTED' && p.status !== 'UNDER_REVIEW') throw new LifecycleError(`A ${p.status.toLowerCase()} proposal cannot be selected.`, 409);
        const problems = validatePlan(p.teamPlan as unknown as TeamPlan, p.milestonePlan as unknown as PlanMilestone[], p.budgetRequested, p.timelineWeeks);
        if (problems.length) throw new LifecycleError(`This proposal is incomplete: ${problems.join(' ')}`, 409);
        selected = p;
        next = 'TEAM_FORMED';
        data.updatedAt = new Date();
        const heiUsers = await prisma.user.findMany({ where: { heiId: p.heiId, role: { in: ['FACULTY', 'STUDENT'] } }, select: { id: true } });
        notify = { roles: ['CSR'], message: `“${ch.title}” (${ch.district}) has a selected university plan by ${p.hei.name} and needs ₹${Math.round(p.budgetRequested).toLocaleString('en-IN')} in funding.`, extraUserIds: [...heiUsers.map((u) => u.id), ...(ch.submitterId ? [ch.submitterId] : [])] };
    } else if (action === 'COMMIT_FUNDS') {
        if (!actor.organizationId) throw new LifecycleError('Your account is not linked to a CSR organisation.', 403);
        const accepted = await prisma.challengeProposal.findFirst({ where: { challengeId: ch.id, status: 'ACCEPTED' }, select: { budgetRequested: true, heiId: true } });
        if (!accepted) throw new LifecycleError('This report has no selected proposal to fund.', 409);
        const committed = (await prisma.fundingCommitment.aggregate({ where: { challengeId: ch.id }, _sum: { amount: true } }))._sum.amount ?? 0;
        const gap = Math.round(accepted.budgetRequested - committed);
        const amount = Math.round(Number(payload.amount));
        if (!(amount > 0)) throw new LifecycleError('Enter an amount above ₹0.', 400);
        if (amount > gap) throw new LifecycleError(`Only ₹${gap.toLocaleString('en-IN')} is still needed.`, 400);
        commitAmount = amount;
        commitBudget = accepted.budgetRequested;
        if (amount === gap) next = 'FUNDED';
        const heiUsers = await prisma.user.findMany({ where: { heiId: accepted.heiId, role: 'FACULTY' }, select: { id: true } });
        notify = { roles: ['OFFICER'], message: amount === gap ? `“${ch.title}” is fully funded. Work can start.` : `₹${amount.toLocaleString('en-IN')} committed to “${ch.title}”; ₹${(gap - amount).toLocaleString('en-IN')} still needed.`, extraUserIds: heiUsers.map((u) => u.id) };
    } else if (action === 'START') {
        next = 'IN_PROGRESS';
    } else if (action === 'COMPLETE') {
        const open = await prisma.milestone.count({ where: { team: { proposal: { challengeId: ch.id, status: 'ACCEPTED' } }, status: { not: 'CSR_APPROVED' } } });
        if (open > 0) throw new LifecycleError(`${open} milestone(s) are not paid yet.`, 409);
        next = 'COMPLETED';
        data.completedAt = new Date();
        notify = { roles: ['OFFICER'], message: `All milestones of “${ch.title}” are verified and paid. Please check the fix and confirm or dispute it.`, extraUserIds: ch.submitterId ? [ch.submitterId] : [] };
    } else if (action === 'CONFIRM') {
        const rating = Number(payload.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new LifecycleError('Rate the fix from 1 to 5.', 400);
        data.confirmedAt = new Date();
        data.citizenRating = rating;
        notify = { roles: ['OFFICER'], message: `The citizen confirmed the fix for “${ch.title}” (rated ${rating}/5). It can be closed.`, extraUserIds: [] };
    } else if (action === 'DISPUTE') {
        const reason = payload.reason?.trim() ?? '';
        if (reason.length < 10 || reason.length > 500) throw new LifecycleError('Say what is still wrong (10–500 characters).', 400);
        next = 'IN_PROGRESS';
        data.disputeReason = reason;
        data.completedAt = null;
        notify = { roles: ['OFFICER', 'FACULTY'], message: `The citizen says “${ch.title}” is not fixed: ${reason}`, extraUserIds: [] };
    } else if (action === 'CLOSE') {
        const n = Number(payload.beneficiaries);
        if (!Number.isInteger(n) || n < 1 || n > 10_000_000) throw new LifecycleError('Enter the verified number of people who benefit (a whole number).', 400);
        next = 'DEPLOYED';
        data.verifiedBeneficiaries = n;
        notify = { roles: ['FACULTY'], message: `“${ch.title}” is resolved (${n.toLocaleString('en-IN')} people benefit). Student credentials can now be issued.`, extraUserIds: ch.submitterId ? [ch.submitterId] : [] };
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
            // (a partial COMMIT_FUNDS keeps the status; the guarded update still proves nobody changed it meanwhile)
            if (count !== 1) throw new LifecycleError('This report was just changed by someone else. Reload and try again.', 409);
        }
        if (action === 'MERGE' && target && ch.submitterId) {
            await tx.endorsement.upsert({ where: { challengeId_userId: { challengeId: target.id, userId: ch.submitterId } }, create: { challengeId: target.id, userId: ch.submitterId }, update: {} });
        }
        if (action === 'ASSIGN' && hei) {
            // An invitation: an empty DRAFT proposal the university completes (team, milestones, budget) and submits.
            const has = await tx.challengeProposal.findFirst({ where: { challengeId: ch.id, heiId: hei.id }, select: { id: true } });
            if (!has) {
                await tx.challengeProposal.create({ data: { challengeId: ch.id, heiId: hei.id, approach: '', status: 'DRAFT', timelineWeeks: 0, budgetRequested: 0, ipDeclaration: '' } });
            }
        }
        if (action === 'SELECT_PROPOSAL' && selected) {
            const p = selected;
            const team = p.teamPlan as unknown as TeamPlan;
            const plan = p.milestonePlan as unknown as PlanMilestone[];
            const faculty = await tx.user.findUnique({ where: { id: team.facultyId }, select: { full_name: true, email: true } });
            await tx.challengeProposal.update({ where: { id: p.id }, data: { status: 'ACCEPTED' } });
            await tx.challengeProposal.updateMany({ where: { challengeId: ch.id, id: { not: p.id }, status: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'] } }, data: { status: 'REJECTED' } });
            const start = Date.now();
            await tx.projectTeam.create({
                data: {
                    proposalId: p.id, heiId: p.heiId, facultyName: faculty?.full_name ?? 'Faculty lead', facultyEmail: faculty?.email ?? '',
                    members: { create: team.members.map((m, i) => ({ studentProfileId: m.studentProfileId, role: m.role?.trim().slice(0, 60) || (i === 0 ? 'Team Lead' : 'Member') })) },
                    milestones: { create: plan.map((m) => ({ title: m.title.trim(), description: '', dueDate: new Date(start + m.week * 7 * 86_400_000), status: 'PENDING', proofUrls: [], amount: m.amount })) },
                },
            });
        }
        if (action === 'COMMIT_FUNDS' && commitAmount) {
            await tx.fundingCommitment.upsert({
                where: { challengeId_csrOrgId: { challengeId: ch.id, csrOrgId: actor.organizationId! } },
                create: { challengeId: ch.id, csrOrgId: actor.organizationId!, amount: commitAmount },
                update: { amount: { increment: commitAmount } },
            });
            // Re-check inside the transaction so two funders committing at once can't overshoot the budget.
            const total = (await tx.fundingCommitment.aggregate({ where: { challengeId: ch.id }, _sum: { amount: true } }))._sum.amount ?? 0;
            if (Math.round(total) > Math.round(commitBudget)) throw new LifecycleError('Someone else just committed funds. Reload and try again.', 409);
        }
        await appendLedger({
            actor_id: actor.id, actor_role: actor.role, action: `CHALLENGE_${action}`, entity_type: 'Challenge', entity_id: ch.id,
            previous_value: { status: ch.status },
            new_value: { status: next, ...data, ...(hei ? { heiId: hei.id } : {}), ...(selected ? { proposalId: selected.id } : {}), ...(commitAmount ? { committed: commitAmount, csrOrgId: actor.organizationId } : {}) },
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

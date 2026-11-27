import prisma from '@/lib/prisma';
import type { Role } from '@prisma/client';

export interface CreateNotificationParams {
    userId: string;
    message: string;
    entityType: string;
    entityId: string;
    priority?: string;
    challengeId?: string | null;
}

/**
 * Standard notification creator wrapping prisma.notification.create
 */
export async function createNotification(
    userIdOrParams: string | CreateNotificationParams,
    message?: string,
    entityType?: string,
    entityId?: string,
    priority: string = 'P2',
    challengeId?: string | null
) {
    try {
        let params: CreateNotificationParams;
        if (typeof userIdOrParams === 'object') {
            params = userIdOrParams;
        } else {
            params = {
                userId: userIdOrParams,
                message: message || '',
                entityType: entityType || 'GENERAL',
                entityId: entityId || '',
                priority: priority || 'P2',
                challengeId: challengeId || null,
            };
        }

        return await prisma.notification.create({
            data: {
                userId: params.userId,
                message: params.message,
                entityType: params.entityType,
                entityId: params.entityId,
                priority: params.priority || 'P2',
                challengeId: params.challengeId || null,
                read: false,
            },
        });
    } catch (err) {
        console.warn('Notification create failed (non-fatal):', err);
        return null;
    }
}

/**
 * Who should hear about a challenge, per role. Without a challenge: everyone with the role.
 *   OFFICER → only officers of the challenge's district
 *   FACULTY → universities with a proposal on it; before any proposal, universities in the same state
 *   others  → everyone with the role (e.g. any CSR funder may pick it up)
 */
export async function audienceWhere(roles: Role[], challengeId?: string | null) {
    if (!challengeId) return { role: { in: roles } };
    const ch = await prisma.challenge.findUnique({
        where: { id: challengeId },
        select: {
            district: true, state: true, proposals: { select: { heiId: true, status: true, ngoPartnerId: true, ngoStatus: true, team: { select: { members: { select: { student: { select: { userId: true } } } } } } } },
            commitments: { select: { csrOrgId: true } },
        },
    });
    if (!ch) return { role: { in: roles } };
    const heiIds = [...new Set(ch.proposals.map((p) => p.heiId))];
    const accepted = ch.proposals.find((p) => p.status === 'ACCEPTED');
    const studentIds = accepted?.team?.members.map((m) => m.student.userId) ?? [];
    const funders = [...new Set(ch.commitments.map((c) => c.csrOrgId))];
    return {
        OR: roles.map((role) =>
            role === 'OFFICER' ? { role, district: { name: { equals: ch.district, mode: 'insensitive' as const } } }
                : role === 'FACULTY' ? { role, hei: heiIds.length ? { id: { in: heiIds } } : { state: ch.state ?? '-' } }
                    // Students on the selected team; the NGO field partner; CSR partners who funded it (every CSR partner until one has).
                    : role === 'STUDENT' ? { role, id: { in: studentIds } }
                        : role === 'NGO' ? { role, organizationId: accepted?.ngoStatus === 'ACCEPTED' ? accepted.ngoPartnerId ?? '-' : '-' }
                            : role === 'CSR' && funders.length ? { role, organizationId: { in: funders } }
                                : { role }),
    };
}

/**
 * Notify users with the specified role(s), scoped to the challenge when one is given (see audienceWhere)
 */
export async function notifyUsersByRole(
    roles: Role[],
    message: string,
    entityType: string,
    entityId: string,
    priority: string = 'P2',
    challengeId?: string | null
) {
    try {
        const users = await prisma.user.findMany({ where: await audienceWhere(roles, challengeId), select: { id: true } });

        if (users.length === 0) return [];

        const created = await prisma.notification.createMany({
            data: users.map((u) => ({
                userId: u.id,
                message,
                entityType,
                entityId,
                priority,
                challengeId: challengeId || null,
                read: false,
            })),
        });

        return created;
    } catch (err) {
        console.warn('notifyUsersByRole failed (non-fatal):', err);
        return [];
    }
}

/**
 * Notify a specific list of user IDs
 */
export async function notifyUsers(
    userIds: string[],
    message: string,
    entityType: string,
    entityId: string,
    priority: string = 'P2',
    challengeId?: string | null
) {
    try {
        if (!userIds || userIds.length === 0) return [];

        return await prisma.notification.createMany({
            data: userIds.map((userId) => ({
                userId,
                message,
                entityType,
                entityId,
                priority,
                challengeId: challengeId || null,
                read: false,
            })),
        });
    } catch (err) {
        console.warn('notifyUsers failed (non-fatal):', err);
        return [];
    }
}

/**
 * High-level helper dispatchers for the 10 platform notification triggers
 */
export const NotificationTriggers = {
    // 1. Challenge submitted -> P2 for GOV
    async challengeSubmitted(challenge: { id: string; title: string; district: string }) {
        const msg = `New challenge submitted: '${challenge.title}' in ${challenge.district}`;
        return notifyUsersByRole(['OFFICER'], msg, 'CHALLENGE', challenge.id, 'P2', challenge.id);
    },

    // 2. Challenge VALIDATED -> P2 for submitter + P2 for HEI users
    async challengeValidated(challenge: { id: string; title: string; submitterId?: string | null }) {
        const msg = `Challenge '${challenge.title}' has been validated by the government`;
        if (challenge.submitterId) {
            await createNotification(challenge.submitterId, msg, 'CHALLENGE', challenge.id, 'P2', challenge.id);
        }
        return notifyUsersByRole(['FACULTY'], msg, 'CHALLENGE', challenge.id, 'P2', challenge.id);
    },

    // 3. HEI accepts challenge (TEAM_FORMED) -> P2 for GOV
    async teamFormed(challenge: { id: string; title: string }, heiName: string) {
        const msg = `${heiName} has formed a team for '${challenge.title}'`;
        return notifyUsersByRole(['OFFICER'], msg, 'CHALLENGE', challenge.id, 'P2', challenge.id);
    },

    // 4. Proposal SUBMITTED -> P2 for GOV + P2 for matching CSR users
    async proposalSubmitted(proposal: { id: string; challengeId: string; challengeTitle: string }) {
        const msg = `New university proposal for '${proposal.challengeTitle}' — ready for your review`;
        // CSR partners hear once the officer has selected a plan (SELECT_PROPOSAL in lifecycle.ts), when they can act.
        return notifyUsersByRole(['OFFICER'], msg, 'PROPOSAL', proposal.id, 'P2', proposal.challengeId);
    },

    // 5. Proposal ACCEPTED -> P1 for HEI + P1 for CSR company
    async proposalAccepted(
        proposal: { id: string; challengeId: string; challengeTitle: string },
        heiUserId?: string | null,
        csrUserId?: string | null
    ) {
        const msg = `Your proposal for '${proposal.challengeTitle}' has been accepted! Project begins now.`;
        if (heiUserId) {
            await createNotification(heiUserId, msg, 'PROPOSAL', proposal.id, 'P1', proposal.challengeId);
        } else {
            await notifyUsersByRole(['FACULTY'], msg, 'PROPOSAL', proposal.id, 'P1', proposal.challengeId);
        }

        if (csrUserId) {
            await createNotification(csrUserId, msg, 'PROPOSAL', proposal.id, 'P1', proposal.challengeId);
        } else {
            await notifyUsersByRole(['CSR'], msg, 'PROPOSAL', proposal.id, 'P1', proposal.challengeId);
        }
    },

    // 6. Milestone SUBMITTED -> P2 for GOV + P2 for CSR funder
    async milestoneSubmitted(
        milestone: { id: string; title: string; challengeId?: string | null },
        csrUserId?: string | null
    ) {
        const msg = `Milestone '${milestone.title}' submitted for verification`;
        await notifyUsersByRole(['OFFICER'], msg, 'MILESTONE', milestone.id, 'P2', milestone.challengeId);
        if (csrUserId) {
            await createNotification(csrUserId, msg, 'MILESTONE', milestone.id, 'P2', milestone.challengeId);
        } else {
            await notifyUsersByRole(['CSR'], msg, 'MILESTONE', milestone.id, 'P2', milestone.challengeId);
        }
    },

    // 7. Milestone GP_VERIFIED -> P2 for HEI + P2 for student
    async milestoneVerified(
        milestone: { id: string; title: string; challengeId?: string | null },
        heiUserIds: string[] = [],
        studentUserIds: string[] = []
    ) {
        const msg = `Your milestone '${milestone.title}' has been verified by the district officer`;
        if (heiUserIds.length > 0) {
            await notifyUsers(heiUserIds, msg, 'MILESTONE', milestone.id, 'P2', milestone.challengeId);
        } else {
            await notifyUsersByRole(['FACULTY'], msg, 'MILESTONE', milestone.id, 'P2', milestone.challengeId);
        }

        if (studentUserIds.length > 0) {
            await notifyUsers(studentUserIds, msg, 'MILESTONE', milestone.id, 'P2', milestone.challengeId);
        }
    },

    // 8. Fund release authorized (CSR_APPROVED) -> P1 for NGO + P1 for HEI
    async fundReleased(
        milestone: { id: string; title: string; challengeId?: string | null },
        amount: number,
        ngoUserId?: string | null,
        heiUserId?: string | null
    ) {
        const msg = `Tranche released: ₹${amount.toLocaleString('en-IN')} for milestone '${milestone.title}'`;
        if (ngoUserId) {
            await createNotification(ngoUserId, msg, 'MILESTONE', milestone.id, 'P1', milestone.challengeId);
        } else {
            await notifyUsersByRole(['NGO'], msg, 'MILESTONE', milestone.id, 'P1', milestone.challengeId);
        }

        if (heiUserId) {
            await createNotification(heiUserId, msg, 'MILESTONE', milestone.id, 'P1', milestone.challengeId);
        } else {
            await notifyUsersByRole(['FACULTY'], msg, 'MILESTONE', milestone.id, 'P1', milestone.challengeId);
        }
    },

    // 9. Challenge DEPLOYED -> P1 for challenge submitter + P2 for all stakeholders
    async challengeDeployed(
        challenge: { id: string; title: string; district: string; submitterId?: string | null },
        familiesHelped: number = 500
    ) {
        const msg = `Challenge '${challenge.title}' is now DEPLOYED! ${familiesHelped} families helped in ${challenge.district}.`;
        if (challenge.submitterId) {
            await createNotification(challenge.submitterId, msg, 'CHALLENGE', challenge.id, 'P1', challenge.id);
        }
        await notifyUsersByRole(['OFFICER', 'FACULTY', 'CSR', 'NGO'], msg, 'CHALLENGE', challenge.id, 'P2', challenge.id);
    },

    // 10. Risk flag triggered -> P1 for GOV + P1 for CSR funder
    async riskFlagTriggered(
        flagType: string,
        projectOrChallengeTitle: string,
        challengeId?: string | null,
        csrUserId?: string | null
    ) {
        const msg = `⚠ Risk flag: ${flagType} on project '${projectOrChallengeTitle}' — review required`;
        await notifyUsersByRole(['OFFICER'], msg, 'RISK_FLAG', challengeId || 'risk', 'P1', challengeId);
        if (csrUserId) {
            await createNotification(csrUserId, msg, 'RISK_FLAG', challengeId || 'risk', 'P1', challengeId);
        } else {
            await notifyUsersByRole(['CSR'], msg, 'RISK_FLAG', challengeId || 'risk', 'P1', challengeId);
        }
    },
};

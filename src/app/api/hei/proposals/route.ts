import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser, inJurisdiction } from '@/server/middleware/auth';
import { validatePlan, transition, LifecycleError, overcommittedStudents, type PlanMember, type PlanMilestone } from '@/server/lifecycle';
import { appendLedger } from '@/server/ledger';

// The university always comes from the signed-in faculty member, never from the request.
async function sessionHei(request: NextRequest) {
    const user = await requireUser(request, ['FACULTY']);
    if (user instanceof NextResponse) return user;
    const hei = user.heiId ? await prisma.hEI.findUnique({ where: { id: user.heiId } }) : null;
    if (!hei) {
        return NextResponse.json(
            { success: false, error: 'Your account is not linked to a university.', timestamp: new Date().toISOString() },
            { status: 403 }
        );
    }
    return { ...hei, facultyId: user.id };
}

// Normalises what the builder sends; anything malformed becomes empty and is caught by validatePlan on submit.
function readPlan(body: { members?: unknown; milestones?: unknown }) {
    const members: PlanMember[] = Array.isArray(body.members)
        ? body.members.filter((m): m is PlanMember => typeof m?.studentProfileId === 'string').map((m) => ({ studentProfileId: m.studentProfileId, role: typeof m.role === 'string' ? m.role.slice(0, 60) : undefined }))
        : [];
    const milestones: PlanMilestone[] = Array.isArray(body.milestones)
        ? body.milestones.slice(0, 10).map((m: { title?: unknown; week?: unknown; amount?: unknown }) => ({ title: String(m?.title ?? '').slice(0, 120), week: Number(m?.week), amount: Number(m?.amount) }))
        : [];
    return { members, milestones };
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const challengeId = searchParams.get('challengeId');

        const hei = await sessionHei(request);
        if (hei instanceof NextResponse) return hei;

        if (challengeId) {
            const proposal = await prisma.challengeProposal.findFirst({
                where: {
                    challengeId,
                    heiId: hei.id,
                },
                include: {
                    challenge: {
                        select: {
                            id: true,
                            title: true,
                            district: true,
                            sdgTags: true,
                            category: true,
                            status: true,
                        },
                    },
                    team: {
                        include: {
                            members: {
                                include: {
                                    student: {
                                        include: {
                                            user: {
                                                select: { full_name: true, email: true },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });

            // Names for the students in the saved plan, so the builder can show them.
            const ids = ((proposal?.teamPlan as { members?: PlanMember[] } | null)?.members ?? []).map((m) => m.studentProfileId);
            const planStudents = ids.length
                ? (await prisma.studentProfile.findMany({ where: { id: { in: ids } }, include: { user: { select: { full_name: true } } } })).map((sp) => ({ id: sp.id, name: sp.user.full_name, branch: sp.branch, year: sp.year }))
                : [];
            return NextResponse.json({
                success: true,
                data: proposal ? { ...proposal, planStudents } : null,
                timestamp: new Date().toISOString(),
            });
        }

        // Return all proposals for the HEI
        const proposals = await prisma.challengeProposal.findMany({
            where: { heiId: hei.id },
            include: {
                challenge: {
                    select: {
                        id: true,
                        title: true,
                        district: true,
                        sdgTags: true,
                        category: true,
                        status: true,
                    },
                },
                team: {
                    select: {
                        id: true,
                        facultyName: true,
                        facultyEmail: true,
                        members: {
                            select: { id: true, role: true },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({
            success: true,
            data: proposals,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Error fetching proposals:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch proposals',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            challengeId,
            approach,
            timelineWeeks,
            budgetRequested,
            csrPartner,
            ngoPartnerId,
            ipDeclaration,
            termsAccepted,
            status = 'SUBMITTED', // 'DRAFT' or 'SUBMITTED'
            aiQualityScore,
        } = body;
        const plan = readPlan(body);

        // Universities can only save drafts or submit. Accepting/rejecting is the district officer's decision.
        if (status !== 'DRAFT' && status !== 'SUBMITTED') {
            return NextResponse.json(
                { success: false, error: 'A proposal can only be saved as DRAFT or SUBMITTED.', timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }

        if (!challengeId) {
            return NextResponse.json(
                { success: false, error: 'Challenge ID is required', timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }

        if (status === 'SUBMITTED') {
            if (!approach || typeof approach !== 'string' || approach.trim().length < 50) {
                return NextResponse.json(
                    { success: false, error: 'Please describe the approach in at least 50 characters', timestamp: new Date().toISOString() },
                    { status: 400 }
                );
            }

            const weeks = Number(timelineWeeks);
            const budget = Number(budgetRequested);
            if (!Number.isInteger(weeks) || weeks < 2 || weeks > 52) {
                return NextResponse.json(
                    { success: false, error: 'Timeline must be 2–52 weeks', timestamp: new Date().toISOString() },
                    { status: 400 }
                );
            }
            if (!Number.isFinite(budget) || budget <= 0 || budget > 10_000_000) {
                return NextResponse.json(
                    { success: false, error: 'Budget must be between ₹1 and ₹1 crore', timestamp: new Date().toISOString() },
                    { status: 400 }
                );
            }

            if (!termsAccepted) {
                return NextResponse.json(
                    { success: false, error: 'Terms acceptance is required prior to submitting proposal', timestamp: new Date().toISOString() },
                    { status: 400 }
                );
            }
        }

        // Fetch challenge
        const challenge = await prisma.challenge.findUnique({
            where: { id: challengeId },
        });

        if (!challenge) {
            return NextResponse.json(
                { success: false, error: 'Challenge not found', timestamp: new Date().toISOString() },
                { status: 404 }
            );
        }

        const hei = await sessionHei(request);
        if (hei instanceof NextResponse) return hei;

        if (!['VALIDATED', 'UNIVERSITY_ASSIGNED'].includes(challenge.status)) {
            return NextResponse.json(
                { success: false, error: 'This report is not open for proposals.', timestamp: new Date().toISOString() },
                { status: 409 }
            );
        }
        const teamPlan = { facultyId: hei.facultyId, members: plan.members };
        if (status === 'SUBMITTED') {
            const problems = validatePlan(teamPlan, plan.milestones, Number(budgetRequested), Number(timelineWeeks));
            const ownStudents = await prisma.studentProfile.count({ where: { id: { in: plan.members.map((m) => m.studentProfileId) }, user: { heiId: hei.id } } });
            if (ownStudents !== plan.members.length) problems.push('Every team member must be a student of your university.');
            const busy = await overcommittedStudents(plan.members.map((m) => m.studentProfileId));
            if (busy.length) problems.push(`${busy.join(', ')} ${busy.length === 1 ? 'is' : 'are'} already on 3 active projects; choose someone else.`);
            if (problems.length) {
                return NextResponse.json(
                    { success: false, error: problems.join(' '), timestamp: new Date().toISOString() },
                    { status: 400 }
                );
            }
        }

        // Check if an existing proposal exists for this challenge & HEI
        const existingProposal = await prisma.challengeProposal.findFirst({
            where: {
                challengeId: challenge.id,
                heiId: hei.id,
            },
        });
        if (existingProposal && existingProposal.status !== 'DRAFT' && existingProposal.status !== 'SUBMITTED') {
            return NextResponse.json(
                { success: false, error: `This proposal is already ${existingProposal.status} and can no longer be edited.`, timestamp: new Date().toISOString() },
                { status: 409 }
            );
        }

        const proposalStatus: 'DRAFT' | 'SUBMITTED' = status;
        // Drafts may be incomplete; missing numbers are stored as 0 rather than invented.
        const parsedWeeks = Number.isInteger(Number(timelineWeeks)) ? Number(timelineWeeks) : 0;
        const parsedBudget = Number.isFinite(Number(budgetRequested)) ? Number(budgetRequested) : 0;
        const parsedScore = aiQualityScore ? Number(aiQualityScore) / 100 : null;

        // Optional NGO field partner: must be a verified NGO on the platform.
        let ngoId: string | null = null;
        if (typeof ngoPartnerId === 'string' && ngoPartnerId) {
            const ngo = await prisma.organization.findFirst({ where: { id: ngoPartnerId, type: 'NGO', verification_status: 'VERIFIED' }, select: { id: true } });
            if (!ngo) return NextResponse.json({ success: false, error: 'Choose a verified NGO as field partner, or none.', timestamp: new Date().toISOString() }, { status: 400 });
            ngoId = ngo.id;
        }

        // Naming an NGO sends it an invitation; the NGO must accept before it can attest or rate (same NGO = no change).
        const ngoStatus = !ngoId ? null : existingProposal?.ngoPartnerId === ngoId ? existingProposal.ngoStatus ?? 'INVITED' : 'INVITED';
        const newlyInvited = !!ngoId && existingProposal?.ngoPartnerId !== ngoId;

        let proposal;
        if (existingProposal) {
            proposal = await prisma.challengeProposal.update({
                where: { id: existingProposal.id },
                data: {
                    approach: approach || existingProposal.approach,
                    timelineWeeks: parsedWeeks,
                    budgetRequested: parsedBudget,
                    fundingSource: csrPartner || existingProposal.fundingSource,
                    ngoPartnerId: ngoId,
                    ngoStatus,
                    ipDeclaration: ipDeclaration || existingProposal.ipDeclaration,
                    status: proposalStatus,
                    aiQualityScore: parsedScore ?? existingProposal.aiQualityScore,
                    teamPlan: teamPlan as unknown as object, milestonePlan: plan.milestones as unknown as object,
                },
            });
        } else {
            proposal = await prisma.challengeProposal.create({
                data: {
                    challengeId: challenge.id,
                    heiId: hei.id,
                    approach: typeof approach === 'string' ? approach : '',
                    timelineWeeks: parsedWeeks,
                    budgetRequested: parsedBudget,
                    fundingSource: csrPartner || null,
                    ngoPartnerId: ngoId,
                    ngoStatus,
                    ipDeclaration: ipDeclaration || '',
                    status: proposalStatus,
                    aiQualityScore: parsedScore,
                    teamPlan: teamPlan as unknown as object, milestonePlan: plan.milestones as unknown as object,
                },
            });
        }

        if (newlyInvited) {
            const ngoUsers = await prisma.user.findMany({ where: { organizationId: ngoId!, role: 'NGO' }, select: { id: true } });
            await prisma.notification.createMany({
                data: ngoUsers.map((u) => ({ userId: u.id, message: `${hei.name} invited you to be field partner on “${challenge.title}” (${challenge.district}). Accept or decline on your dashboard.`, entityType: 'PROPOSAL', entityId: proposal.id, challengeId: challenge.id, priority: 'P2' })),
            }).catch((err) => console.warn('NGO invitation notice failed:', err));
        }

        // If submitted, create P2 notifications for GOV and CSR roles (Trigger 4)
        if (proposalStatus === 'SUBMITTED') {
            try {
                const { NotificationTriggers } = await import('@/lib/notifications');
                await NotificationTriggers.proposalSubmitted({
                    id: proposal.id,
                    challengeId: challenge.id,
                    challengeTitle: challenge.title,
                });
            } catch (notifErr) {
                console.warn('Could not dispatch notifications for proposal submission:', notifErr);
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                id: proposal.id,
                challengeId: challenge.id,
                heiId: hei.id,
                status: proposal.status,
                approach: proposal.approach,
                timelineWeeks: proposal.timelineWeeks,
                budgetRequested: proposal.budgetRequested,
                fundingSource: proposal.fundingSource,
                ngoPartnerId: proposal.ngoPartnerId,
                ngoStatus: proposal.ngoStatus,
                ipDeclaration: proposal.ipDeclaration,
                aiQualityScore: proposal.aiQualityScore,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Error in /api/hei/proposals:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to save proposal',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        // Accepting or rejecting a proposal is the district officer's decision.
        const user = await requireUser(request, ['OFFICER', 'ADMIN']);
        if (user instanceof NextResponse) return user;

        const body = await request.json();
        const { proposalId, status, heiUserId, csrUserId } = body;

        if (!proposalId || !status) {
            return NextResponse.json(
                { success: false, error: 'Proposal ID and status are required', timestamp: new Date().toISOString() },
                { status: 400 }
            );
        }

        const proposal = await prisma.challengeProposal.findUnique({
            where: { id: proposalId },
            include: { challenge: true, hei: true },
        });

        if (!proposal) {
            return NextResponse.json(
                { success: false, error: 'Proposal not found', timestamp: new Date().toISOString() },
                { status: 404 }
            );
        }

        if (!inJurisdiction(user, proposal.challenge.district)) {
            return NextResponse.json(
                { success: false, error: 'This challenge is outside your district.', timestamp: new Date().toISOString() },
                { status: 403 }
            );
        }
        const DECISIONS: Record<string, string[]> = { SUBMITTED: ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED'], UNDER_REVIEW: ['ACCEPTED', 'REJECTED'] };
        if (!(DECISIONS[proposal.status] ?? []).includes(status)) {
            return NextResponse.json(
                { success: false, error: `A ${proposal.status} proposal cannot be moved to ${status}.`, timestamp: new Date().toISOString() },
                { status: 409 }
            );
        }

        // Accepting = selecting this university's plan: done by the lifecycle (team, milestones, ledger, notifications).
        if (status === 'ACCEPTED') {
            try {
                const result = await transition(proposal.challengeId, 'SELECT_PROPOSAL', user, { proposalId });
                return NextResponse.json({ success: true, data: { id: proposalId, status: 'ACCEPTED', challengeStatus: result.status }, timestamp: new Date().toISOString() });
            } catch (err) {
                if (err instanceof LifecycleError) return NextResponse.json({ success: false, error: err.message, timestamp: new Date().toISOString() }, { status: err.status });
                throw err;
            }
        }

        const updatedProposal = await prisma.challengeProposal.update({
            where: { id: proposalId },
            data: { status },
        });
        await appendLedger({ actor_id: user.id, actor_role: user.role, action: `PROPOSAL_${status}`, entity_type: 'Proposal', entity_id: proposalId, previous_value: { status: proposal.status }, new_value: { status } });

        // Trigger 5: Proposal ACCEPTED -> P1 for HEI + P1 for CSR company
        if (status === 'ACCEPTED') {
            try {
                const { NotificationTriggers } = await import('@/lib/notifications');
                await NotificationTriggers.proposalAccepted(
                    {
                        id: updatedProposal.id,
                        challengeId: proposal.challengeId,
                        challengeTitle: proposal.challenge.title,
                    },
                    heiUserId || null,
                    csrUserId || null
                );
            } catch (notifErr) {
                console.warn('Could not dispatch notifications for proposal acceptance:', notifErr);
            }
        }

        return NextResponse.json({
            success: true,
            data: updatedProposal,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Error updating proposal status:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to update proposal',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}


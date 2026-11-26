import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// ponytail: SECURITY — the university is resolved from an email the client sends. Phase 1 takes it from the
// signed-in session (httpOnly cookie) so nobody can act for another university. Do not deploy as-is.
async function resolveHei(email: unknown) {
    if (typeof email !== 'string' || !email.trim()) return null;
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { hei: true } });
    return user?.hei ?? null;
}

const noHei = () =>
    NextResponse.json(
        { success: false, error: 'Your account is not linked to a university.', timestamp: new Date().toISOString() },
        { status: 403 }
    );

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const challengeId = searchParams.get('challengeId');

        const hei = await resolveHei(searchParams.get('email'));
        if (!hei) return noHei();

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

            return NextResponse.json({
                success: true,
                data: proposal,
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
            ipDeclaration,
            termsAccepted,
            status = 'SUBMITTED', // 'DRAFT' or 'SUBMITTED'
            aiQualityScore,
            facultyEmail,
        } = body;

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
            if (!approach || typeof approach !== 'string' || approach.trim().length < 10) {
                return NextResponse.json(
                    { success: false, error: 'Please provide a detailed technical approach (at least 10 characters)', timestamp: new Date().toISOString() },
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

        const hei = await resolveHei(facultyEmail);
        if (!hei) return noHei();

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

        let proposal;
        if (existingProposal) {
            proposal = await prisma.challengeProposal.update({
                where: { id: existingProposal.id },
                data: {
                    approach: approach || existingProposal.approach,
                    timelineWeeks: parsedWeeks,
                    budgetRequested: parsedBudget,
                    fundingSource: csrPartner || existingProposal.fundingSource,
                    ipDeclaration: ipDeclaration || existingProposal.ipDeclaration,
                    status: proposalStatus,
                    aiQualityScore: parsedScore ?? existingProposal.aiQualityScore,
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
                    ipDeclaration: ipDeclaration || '',
                    status: proposalStatus,
                    aiQualityScore: parsedScore,
                },
            });
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

        // ponytail: officer-only decision; enforced by role once real auth lands in Phase 1.
        const DECISIONS: Record<string, string[]> = { SUBMITTED: ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED'], UNDER_REVIEW: ['ACCEPTED', 'REJECTED'] };
        if (!(DECISIONS[proposal.status] ?? []).includes(status)) {
            return NextResponse.json(
                { success: false, error: `A ${proposal.status} proposal cannot be moved to ${status}.`, timestamp: new Date().toISOString() },
                { status: 409 }
            );
        }

        const updatedProposal = await prisma.challengeProposal.update({
            where: { id: proposalId },
            data: { status },
        });

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


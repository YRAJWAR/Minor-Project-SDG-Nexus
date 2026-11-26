import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { appendLedger } from '@/server/ledger';
import { priority, allowedActions } from '@/server/lifecycle';
import { requireUser, inJurisdiction } from '@/server/middleware/auth';

export async function GET(req: NextRequest) {
    try {
        const user = await requireUser(req, ['OFFICER', 'ADMIN']);
        if (user instanceof NextResponse) return user;

        const { searchParams } = new URL(req.url);
        const statusFilter = (searchParams.get('status') || 'ALL').toUpperCase();

        let dbChallenges;
        try {
            dbChallenges = await prisma.challenge.findMany({
                // Officers see only their own district; admins see everything.
                where: user.role === 'ADMIN' ? {} : { district: { equals: user.district?.name ?? '\u0000', mode: 'insensitive' } },
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: { select: { endorsements: true } },
                    proposals: {
                        select: { id: true, status: true, hei: { select: { name: true, district: true } } },
                    },
                },
            });
        } catch (dbErr) {
            console.error('Database query failed in challenges API:', dbErr);
            return NextResponse.json(
                { success: false, error: 'Challenges are temporarily unavailable.', timestamp: new Date().toISOString() },
                { status: 503 }
            );
        }

        const now = Date.now();
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

        // Open reports per district, for the "area backlog" part of the priority score.
        const openByDistrict = new Map<string, number>();
        for (const ch of dbChallenges) {
            if (!['COMPLETED', 'DEPLOYED', 'REJECTED', 'MERGED'].includes(ch.status)) {
                const k = ch.district.toLowerCase();
                openByDistrict.set(k, (openByDistrict.get(k) ?? 0) + 1);
            }
        }
        const maxOpen = Math.max(0, ...openByDistrict.values());

        const allChallenges = dbChallenges.map((ch) => {
                const prio = priority({ urgency: ch.urgency, endorsements: ch._count.endorsements, districtOpen: openByDistrict.get(ch.district.toLowerCase()) ?? 0, maxDistrictOpen: maxOpen, createdAt: ch.createdAt, status: ch.status }, now);
                const timeSinceUpdate = now - new Date(ch.updatedAt).getTime();
                const daysSinceUpdate = Math.floor(timeSinceUpdate / (1000 * 60 * 60 * 24));
                const isEscalationDue =
                    (ch.status === 'VALIDATED' || ch.status === 'UNIVERSITY_ASSIGNED') &&
                    timeSinceUpdate > SEVEN_DAYS_MS;

                return {
                    id: ch.id,
                    title: ch.title,
                    description: ch.description,
                    district: ch.district,
                    block: ch.block,
                    state: ch.state,
                    category: ch.category,
                    status: ch.status,
                    sdgTags: ch.sdgTags,
                    aiConfidence: ch.aiConfidence,
                    // Never expose phone numbers; anonymous reports stay anonymous even to officers.
                    submittedBy: ch.isAnonymous ? 'Anonymous' : ch.submittedBy.replace(/\(.*?\)/g, '').trim(),
                    isAnonymous: ch.isAnonymous,
                    gpVerified: ch.gpVerified,
                    submittedVia: ch.submittedVia || 'PORTAL',
                    createdAt: ch.createdAt.toISOString(),
                    updatedAt: ch.updatedAt.toISOString(),
                    daysSinceUpdate,
                    isEscalationDue,
                    urgency: ch.urgency,
                    endorsements: ch._count.endorsements,
                    priority: prio.score,
                    priorityBreakdown: prio.breakdown,
                    isOverdue: prio.overdue,
                    daysWaiting: prio.daysWaiting,
                    rejectReason: ch.rejectReason,
                    mergedIntoId: ch.mergedIntoId,
                    allowedActions: allowedActions(ch, user),
                    proposalsCount: ch.proposals?.length || 0,
                    assignedInstitutions: ch.proposals.map((p) => p.hei.name),
                };
            });

        // Compute counts for all 8 stages + ALL + ESCALATION_DUE
        const counts: Record<string, number> = {
            SUBMITTED: 0,
            AI_PROCESSED: 0,
            VALIDATED: 0,
            UNIVERSITY_ASSIGNED: 0,
            TEAM_FORMED: 0,
            IN_PROGRESS: 0,
            COMPLETED: 0,
            DEPLOYED: 0,
            REJECTED: 0,
            MERGED: 0,
            ALL: allChallenges.length,
            ESCALATION_DUE: 0,
            OVERDUE: 0,
        };

        allChallenges.forEach((ch) => {
            if (counts[ch.status] !== undefined) {
                counts[ch.status]++;
            }
            if (ch.isEscalationDue) {
                counts.ESCALATION_DUE++;
            }
            if (ch.isOverdue) counts.OVERDUE++;
        });

        // Filter challenges if filter parameter is provided
        let filteredChallenges = allChallenges;
        if (statusFilter !== 'ALL') {
            if (statusFilter === 'OVERDUE') {
                filteredChallenges = allChallenges.filter((ch) => ch.isOverdue);
            } else if (statusFilter === 'ESCALATION_DUE') {
                filteredChallenges = allChallenges.filter((ch) => ch.isEscalationDue);
            } else if (statusFilter === 'RESOLVED') {
                filteredChallenges = allChallenges.filter((ch) => ch.status === 'COMPLETED' || ch.status === 'DEPLOYED');
            } else {
                filteredChallenges = allChallenges.filter((ch) => ch.status === statusFilter);
            }
        }

        // Highest priority first: the officer's work queue.
        filteredChallenges = [...filteredChallenges].sort((a, b) => b.priority - a.priority);

        return NextResponse.json({
            success: true,
            data: filteredChallenges,
            challenges: filteredChallenges,
            counts,
            totalCount: allChallenges.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Failed to load government challenges:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to load government challenges',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requireUser(req, ['OFFICER', 'ADMIN']);
        if (user instanceof NextResponse) return user;

        const body = await req.json();
        const { challengeId, note } = body;

        if (!challengeId) {
            return NextResponse.json(
                { success: false, error: 'Challenge ID is required' },
                { status: 400 }
            );
        }

        // Record the escalation in the audit log. Do NOT touch updatedAt: that would reset the overdue clock
        // and hide the challenge that was just escalated.
        try {
            const challenge = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { id: true, status: true, district: true } });
            if (!challenge) {
                return NextResponse.json({ success: false, error: `No challenge found with ID "${challengeId}"` }, { status: 404 });
            }
            if (!inJurisdiction(user, challenge.district)) {
                return NextResponse.json({ success: false, error: 'This challenge is outside your district.' }, { status: 403 });
            }
            await appendLedger({
                actor_id: user.id, actor_role: user.role, action: 'CHALLENGE_ESCALATED', entity_type: 'Challenge', entity_id: challengeId,
                new_value: { note: typeof note === 'string' ? note.slice(0, 500) : null, status: challenge.status },
            });
        } catch (dbErr) {
            console.error('Escalation could not be recorded:', dbErr);
            return NextResponse.json({ success: false, error: 'The escalation could not be saved. Please try again.' }, { status: 503 });
        }

        return NextResponse.json({
            success: true,
            data: { id: challengeId },
            message: 'Escalation recorded in the audit log.',
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Failed to update challenge:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to process escalation' },
            { status: 500 }
        );
    }
}

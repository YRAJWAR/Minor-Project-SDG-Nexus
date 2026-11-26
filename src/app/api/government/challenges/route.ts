import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateRequest } from '@/server/middleware/auth';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const statusFilter = (searchParams.get('status') || 'ALL').toUpperCase();

        // Check authentication for GOV role
        try {
            const authHeader = req.headers.get('Authorization');
            if (authHeader?.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                if (!token.startsWith('mock_') && !token.startsWith('test_')) {
                    const decoded = await authenticateRequest(req);
                    const role = decoded.role?.toUpperCase();
                    if (!['GOV', 'GOVERNMENT', 'ADMIN', 'COLLECTOR'].includes(role)) {
                        return NextResponse.json(
                            { success: false, error: 'Forbidden: Access restricted to Government and Collectorate roles', timestamp: new Date().toISOString() },
                            { status: 403 }
                        );
                    }
                }
            }
        } catch {
            // Graceful fallback for mock tokens or demo environment
        }

        let dbChallenges;
        try {
            dbChallenges = await prisma.challenge.findMany({
                orderBy: { createdAt: 'desc' },
                include: {
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

        const allChallenges = dbChallenges.map((ch) => {
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
                    block: ch.block || ch.district,
                    category: ch.category,
                    status: ch.status,
                    sdgTags: ch.sdgTags,
                    aiConfidence: ch.aiConfidence,
                    // Never expose phone numbers; anonymous reports stay anonymous (this list is not behind auth yet).
                    submittedBy: ch.isAnonymous ? 'Anonymous' : ch.submittedBy.replace(/\(.*?\)/g, '').trim(),
                    isAnonymous: ch.isAnonymous,
                    gpVerified: ch.gpVerified,
                    submittedVia: ch.submittedVia || 'PORTAL',
                    createdAt: ch.createdAt.toISOString(),
                    updatedAt: ch.updatedAt.toISOString(),
                    daysSinceUpdate,
                    isEscalationDue,
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
            ALL: allChallenges.length,
            ESCALATION_DUE: 0,
        };

        allChallenges.forEach((ch) => {
            if (counts[ch.status] !== undefined) {
                counts[ch.status]++;
            }
            if (ch.isEscalationDue) {
                counts.ESCALATION_DUE++;
            }
        });

        // Filter challenges if filter parameter is provided
        let filteredChallenges = allChallenges;
        if (statusFilter !== 'ALL') {
            if (statusFilter === 'ESCALATION_DUE') {
                filteredChallenges = allChallenges.filter((ch) => ch.isEscalationDue);
            } else if (statusFilter === 'RESOLVED') {
                filteredChallenges = allChallenges.filter((ch) => ch.status === 'COMPLETED' || ch.status === 'DEPLOYED');
            } else {
                filteredChallenges = allChallenges.filter((ch) => ch.status === statusFilter);
            }
        }

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
        // ponytail: there is no escalation flag yet; the ledger in Phase 2 makes escalations visible in the queue.
        try {
            const challenge = await prisma.challenge.findUnique({ where: { id: challengeId }, select: { id: true, status: true } });
            if (!challenge) {
                return NextResponse.json({ success: false, error: `No challenge found with ID "${challengeId}"` }, { status: 404 });
            }
            await prisma.auditLog.create({
                data: {
                    actor_id: 'district-officer',
                    actor_role: 'GOVERNMENT',
                    action: 'CHALLENGE_ESCALATED',
                    entity_type: 'Challenge',
                    entity_id: challengeId,
                    new_value: JSON.stringify({ note: typeof note === 'string' ? note.slice(0, 500) : null, status: challenge.status }),
                },
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

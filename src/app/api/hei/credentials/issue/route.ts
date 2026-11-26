import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeCredentialHash, creditsForHours, isProjectComplete } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

const HOURS_PER_WEEK_CAP = 40;

interface StudentIssuePayload {
    studentProfileId: string;
    creditHours: number;
    overallRating?: number;
}

const fail = (error: string, status: number) =>
    NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });

// Issues credentials for members of a completed project. All-or-nothing: either every listed
// student gets a saved credential, or nothing is written and an error explains why.
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    const projectId: unknown = body?.projectId;
    const students: StudentIssuePayload[] = Array.isArray(body?.students) ? body.students : [];

    if (typeof projectId !== 'string' || !projectId) return fail('projectId is required', 400);
    if (students.length === 0) return fail('No students specified', 400);

    let team;
    try {
        team = await prisma.projectTeam.findFirst({
            where: { OR: [{ id: projectId }, { proposalId: projectId }] },
            include: { proposal: { include: { challenge: true } }, members: true, milestones: true },
        });
    } catch (dbErr) {
        console.error('DB error loading project for credential issuance:', dbErr);
        return fail('Credential issuing is temporarily unavailable.', 503);
    }

    if (!team) return fail(`No project found for "${projectId}"`, 404);
    if (!isProjectComplete(team.milestones)) {
        return fail('Credentials can only be issued after every milestone has been approved.', 409);
    }

    const challenge = team.proposal.challenge;
    const memberIds = new Set(team.members.map((m) => m.studentProfileId));
    const maxHours = team.proposal.timelineWeeks * HOURS_PER_WEEK_CAP;

    for (const s of students) {
        const hours = Number(s.creditHours);
        if (!memberIds.has(s.studentProfileId)) return fail(`Student ${s.studentProfileId} is not a member of this team.`, 400);
        if (!Number.isInteger(hours) || hours < 30 || hours > maxHours) {
            return fail(`Hours for ${s.studentProfileId} must be a whole number between 30 and ${maxHours}.`, 400);
        }
        if (s.overallRating !== undefined && !(s.overallRating >= 1 && s.overallRating <= 5)) {
            return fail('Ratings must be between 1 and 5.', 400);
        }
    }

    const issuedAt = new Date();
    let created;
    try {
        created = await prisma.$transaction(async (tx) => {
            // ponytail: duplicate check keys on challenge title because credentials don't store challengeId yet (Phase 1).
            const existing = await tx.studentCredential.findMany({
                where: { studentProfileId: { in: students.map((s) => s.studentProfileId) }, challengeTitle: challenge.title },
                select: { studentProfileId: true },
            });
            if (existing.length > 0) throw new Error(`ALREADY_ISSUED:${existing.map((e) => e.studentProfileId).join(',')}`);

            const out = [];
            for (const s of students) {
                const creditPoints = creditsForHours(s.creditHours);
                const cred = await tx.studentCredential.create({
                    data: {
                        studentProfileId: s.studentProfileId,
                        challengeTitle: challenge.title,
                        challengeDistrict: challenge.district,
                        sdgTags: challenge.sdgTags,
                        hoursContributed: s.creditHours,
                        creditPoints,
                        nepCompliant: true,
                        hashValue: computeCredentialHash(s.studentProfileId, challenge.id, creditPoints, issuedAt),
                        issuedAt,
                    },
                });
                await tx.studentProfile.update({
                    where: { id: s.studentProfileId },
                    data: {
                        credits: { increment: creditPoints },
                        ...(s.overallRating !== undefined ? { rating: s.overallRating } : {}),
                    },
                });
                out.push(cred);
            }
            return out;
        });
    } catch (err) {
        if (err instanceof Error && err.message.startsWith('ALREADY_ISSUED:')) {
            return fail('Credentials were already issued to some of these students for this challenge.', 409);
        }
        console.error('Credential issuance failed:', err);
        return fail('Credentials could not be saved. Nothing was issued — please try again.', 503);
    }

    return NextResponse.json({
        success: true,
        data: {
            credentialIds: created.map((c) => c.id),
            pdfUrls: created.map((c) => `/api/hei/credentials/${c.id}/pdf`),
            credentials: created,
            challengeTitle: challenge.title,
            challengeDistrict: challenge.district,
            issuedAt: issuedAt.toISOString(),
        },
        timestamp: new Date().toISOString(),
    });
}

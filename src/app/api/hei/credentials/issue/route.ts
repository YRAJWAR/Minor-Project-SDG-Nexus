import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';
import { computeCredentialHash, creditsForHours, isProjectComplete, blendedRating } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

interface StudentIssuePayload {
    studentProfileId: string;
    overallRating?: number; // the faculty rating, 1–5
}

const fail = (error: string, status: number) =>
    NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });

// Issues credentials for members of a completed project. All-or-nothing: either every listed
// student gets a saved credential, or nothing is written and an error explains why.
export async function POST(request: NextRequest) {
    const faculty = await requireUser(request, ['FACULTY']);
    if (faculty instanceof NextResponse) return faculty;

    const body = await request.json().catch(() => null);
    const projectId: unknown = body?.projectId;
    const students: StudentIssuePayload[] = Array.isArray(body?.students) ? body.students : [];

    if (typeof projectId !== 'string' || !projectId) return fail('projectId is required', 400);
    if (students.length === 0) return fail('No students specified', 400);

    let team;
    try {
        team = await prisma.projectTeam.findFirst({
            where: { OR: [{ id: projectId }, { proposalId: projectId }] },
            include: { proposal: { include: { challenge: true } }, members: true, milestones: { include: { hours: true } } },
        });
    } catch (dbErr) {
        console.error('DB error loading project for credential issuance:', dbErr);
        return fail('Credential issuing is temporarily unavailable.', 503);
    }

    if (!team) return fail(`No project found for "${projectId}"`, 404);
    if (team.heiId !== faculty.heiId) return fail("Only faculty of this team's university can issue its credentials.", 403);
    if (!isProjectComplete(team.milestones, team.proposal.challenge.status)) {
        return fail('Credentials can only be issued once the project is resolved: every milestone paid and the report closed by the officer.', 409);
    }

    const challenge = team.proposal.challenge;
    const memberIds = new Set(team.members.map((m) => m.studentProfileId));
    // Hours come only from the logs on this project's milestones (all verified and paid by now), never from this request.
    const verifiedHours = new Map<string, number>();
    for (const h of team.milestones.flatMap((m) => m.hours)) verifiedHours.set(h.studentProfileId, (verifiedHours.get(h.studentProfileId) ?? 0) + h.hours);
    const ngoRating = new Map(team.members.map((m) => [m.studentProfileId, m.ngoRating]));

    for (const s of students) {
        if (!memberIds.has(s.studentProfileId)) return fail(`Student ${s.studentProfileId} is not a member of this team.`, 400);
        if ((verifiedHours.get(s.studentProfileId) ?? 0) < 30) {
            return fail('Every student needs at least 30 verified field hours (one credit) on this project\'s milestones.', 409);
        }
        if (s.overallRating !== undefined && !(s.overallRating >= 1 && s.overallRating <= 5)) {
            return fail('Ratings must be between 1 and 5.', 400);
        }
    }

    const issuedAt = new Date();
    let created;
    try {
        created = await prisma.$transaction(async (tx) => {
            // Once per student per report (older credentials, issued before challengeId existed, match by title).
            const existing = await tx.studentCredential.findMany({
                where: { studentProfileId: { in: students.map((s) => s.studentProfileId) }, OR: [{ challengeId: challenge.id }, { challengeId: null, challengeTitle: challenge.title }] },
                select: { studentProfileId: true },
            });
            if (existing.length > 0) throw new Error(`ALREADY_ISSUED:${existing.map((e) => e.studentProfileId).join(',')}`);

            const out = [];
            for (const s of students) {
                const hours = verifiedHours.get(s.studentProfileId)!;
                const creditPoints = creditsForHours(hours);
                const cred = await tx.studentCredential.create({
                    data: {
                        studentProfileId: s.studentProfileId,
                        challengeId: challenge.id,
                        challengeTitle: challenge.title,
                        challengeDistrict: challenge.district,
                        sdgTags: challenge.sdgTags,
                        hoursContributed: hours,
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
                        ...(s.overallRating !== undefined ? { rating: blendedRating(s.overallRating, challenge.citizenRating, ngoRating.get(s.studentProfileId)) } : {}),
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

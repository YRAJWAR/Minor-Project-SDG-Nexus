import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';
import { canTransitionStatus } from '@/middleware/challengeStatus';
import { NotificationTriggers } from '@/lib/notifications';

const fail = (error: string, status: number) =>
    NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });

// Forms the team for a challenge that was routed to the faculty member's university.
// Every listed student must exist and belong to that university; all writes happen together or not at all.
export async function POST(request: NextRequest) {
    // The faculty lead and the university are the signed-in user — never taken from the request body.
    const faculty = await requireUser(request, ['FACULTY']);
    if (faculty instanceof NextResponse) return faculty;
    if (!faculty.heiId) return fail('Your account is not linked to a university.', 403);
    const facultyName = faculty.full_name;
    const facultyEmail = faculty.email;

    const body = await request.json().catch(() => null);
    const { challengeId, teamName, backupLead, members } = body ?? {};

    if (typeof challengeId !== 'string' || !challengeId) return fail('Challenge ID is required', 400);
    if (typeof teamName !== 'string' || teamName.trim().length < 2) return fail('Team name is required (minimum 2 characters)', 400);
    if (!Array.isArray(members) || members.length < 2 || members.length > 8) return fail('A team needs 2–8 students', 400);
    const memberIds: string[] = members.map((m: { studentProfileId?: unknown }) => String(m?.studentProfileId ?? ''));
    if (new Set(memberIds).size !== memberIds.length) return fail('A student can only be added once', 400);

    let result;
    try {
        const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
        if (!challenge) return fail(`No challenge found with ID "${challengeId}"`, 404);
        const transition = canTransitionStatus(challenge.status, 'TEAM_FORMED', 'HEI');
        if (!transition.allowed) return fail(`A team cannot be formed while the challenge is ${challenge.status}.`, 409);

        const proposal = await prisma.challengeProposal.findFirst({
            where: { challengeId, heiId: faculty.heiId, team: null },
        });
        if (!proposal) return fail('This challenge has not been assigned to your university, or a team already exists.', 409);

        const students = await prisma.studentProfile.findMany({
            where: { id: { in: memberIds } },
            include: { user: { select: { heiId: true } } },
        });
        const valid = new Set(students.filter((s) => s.user.heiId === faculty.heiId).map((s) => s.id));
        const invalid = memberIds.filter((id) => !valid.has(id));
        if (invalid.length > 0) return fail(`These students are not registered at your university: ${invalid.join(', ')}`, 400);

        const hei = await prisma.hEI.findUniqueOrThrow({ where: { id: faculty.heiId! } });

        result = await prisma.$transaction(async (tx) => {
            const team = await tx.projectTeam.create({
                data: {
                    proposalId: proposal.id,
                    heiId: hei.id,
                    facultyName: facultyName.trim(),
                    facultyEmail: facultyEmail.trim(),
                    backupLead: typeof backupLead === 'string' && backupLead.trim() ? backupLead.trim() : null,
                    members: {
                        create: members.map((m: { studentProfileId: string; role?: string }) => ({
                            studentProfileId: m.studentProfileId,
                            role: typeof m.role === 'string' && m.role.trim() ? m.role.trim().slice(0, 60) : 'Member',
                        })),
                    },
                },
                include: { members: true },
            });
            const updated = await tx.challenge.update({ where: { id: challenge.id }, data: { status: 'TEAM_FORMED' } });
            return { team, updated, hei, challenge };
        });
    } catch (dbErr) {
        console.error('Failed to create project team:', dbErr);
        return fail('The team could not be saved. Nothing was changed — please try again.', 503);
    }

    try {
        await NotificationTriggers.teamFormed({ id: result.challenge.id, title: result.challenge.title }, result.hei.name);
    } catch (notifErr) {
        console.warn('Failed to send notification for team formation:', notifErr);
    }

    return NextResponse.json({
        success: true,
        data: {
            teamId: result.team.id,
            teamName: teamName.trim(),
            challengeId: result.updated.id,
            status: result.updated.status,
            proposalId: result.team.proposalId,
            facultyMentor: facultyName.trim(),
            membersCount: result.team.members.length,
        },
        timestamp: new Date().toISOString(),
    });
}

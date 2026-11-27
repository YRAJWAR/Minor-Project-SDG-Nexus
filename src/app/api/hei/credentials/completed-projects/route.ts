import { requireUser } from '@/server/middleware/auth';
import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { creditsForHours, isProjectComplete } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

// Projects whose milestones are all approved, i.e. ready for credentials.
export async function GET(req: NextRequest) {
    const user = await requireUser(req, ['FACULTY']);
    if (user instanceof NextResponse) return user;
    let teams;
    try {
        teams = await prisma.projectTeam.findMany({
            // Only the signed-in faculty member's own university.
            where: { proposal: { status: 'ACCEPTED' }, heiId: user.heiId ?? '-' },
            include: {
                proposal: { include: { challenge: true, ngoPartner: { select: { name: true } } } },
                hei: true,
                members: { include: { student: { include: { user: true } } } },
                milestones: { include: { hours: true } },
            },
        });
    } catch (dbErr) {
        console.error('DB error fetching completed projects:', dbErr);
        return NextResponse.json(
            { success: false, error: 'Projects are temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    const completed = teams.filter((t) => isProjectComplete(t.milestones, t.proposal.challenge.status));

    let existing;
    try {
        existing = await prisma.studentCredential.findMany({
            where: { studentProfileId: { in: completed.flatMap((t) => t.members.map((m) => m.studentProfileId)) } },
        });
    } catch (dbErr) {
        console.error('DB error fetching existing credentials:', dbErr);
        return NextResponse.json(
            { success: false, error: 'Projects are temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    const data = completed.map((t) => {
        const challenge = t.proposal.challenge;
        const hoursOf = (id: string) => t.milestones.flatMap((m) => m.hours).filter((h) => h.studentProfileId === id).reduce((a, h) => a + h.hours, 0);
        return {
            id: t.id,
            proposalId: t.proposalId,
            challengeId: challenge.id,
            challengeTitle: challenge.title,
            district: challenge.district,
            category: challenge.category,
            sdgTags: challenge.sdgTags,
            csrFunder: t.proposal.fundingSource,
            timelineWeeks: t.proposal.timelineWeeks,
            facultyName: t.facultyName,
            facultyEmail: t.facultyEmail,
            universityName: t.hei.name,
            allMilestonesApproved: true,
            citizenRating: challenge.citizenRating,
            ngoPartner: t.proposal.ngoPartner?.name ?? null,
            teamMembers: t.members.map((m) => ({
                studentProfileId: m.studentProfileId,
                studentName: m.student.user.full_name,
                email: m.student.user.email,
                branch: m.student.branch,
                year: m.student.year,
                role: m.role,
                skills: m.student.skills,
                defaultHours: hoursOf(m.studentProfileId), // verified hours logged on the milestones
                defaultCredits: creditsForHours(hoursOf(m.studentProfileId)),
                ngoRating: m.ngoRating,
            })),
            existingCredentials: existing
                .filter((c) => c.challengeTitle === challenge.title && t.members.some((m) => m.studentProfileId === c.studentProfileId))
                .map((c) => ({
                    id: c.id,
                    studentProfileId: c.studentProfileId,
                    hoursContributed: c.hoursContributed,
                    creditPoints: c.creditPoints,
                    hashValue: c.hashValue,
                    issuedAt: c.issuedAt.toISOString(),
                })),
        };
    });

    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() });
}

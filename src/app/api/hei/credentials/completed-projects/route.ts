import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { creditsForHours, isProjectComplete } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

// Projects whose milestones are all approved, i.e. ready for credentials.
// ponytail: lists every university's projects until Phase 1 scopes requests to the signed-in user's university.
export async function GET() {
    let teams;
    try {
        teams = await prisma.projectTeam.findMany({
            where: { proposal: { status: 'ACCEPTED' } },
            include: {
                proposal: { include: { challenge: true } },
                hei: true,
                members: { include: { student: { include: { user: true } } } },
                milestones: true,
            },
        });
    } catch (dbErr) {
        console.error('DB error fetching completed projects:', dbErr);
        return NextResponse.json(
            { success: false, error: 'Projects are temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    const completed = teams.filter((t) => isProjectComplete(t.milestones));

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
        const defaultHours = t.proposal.timelineWeeks * 10;
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
            teamMembers: t.members.map((m) => ({
                studentProfileId: m.studentProfileId,
                studentName: m.student.user.full_name,
                email: m.student.user.email,
                branch: m.student.branch,
                year: m.student.year,
                role: m.role,
                skills: m.student.skills,
                defaultHours,
                defaultCredits: creditsForHours(defaultHours),
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

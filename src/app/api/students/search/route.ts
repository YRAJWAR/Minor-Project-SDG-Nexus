import { requireUser } from '@/server/middleware/auth';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Searches students of the requesting faculty member's university only.
export async function GET(request: NextRequest) {
    const faculty = await requireUser(request, ['FACULTY']);
    if (faculty instanceof NextResponse) return faculty;
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';

    let students;
    try {
        if (!faculty.heiId) {
            return NextResponse.json(
                { success: false, error: 'Your account is not linked to a university.', timestamp: new Date().toISOString() },
                { status: 403 }
            );
        }
        const contains = { contains: query, mode: 'insensitive' as const };
        students = await prisma.studentProfile.findMany({
            where: {
                user: { heiId: faculty.heiId },
                ...(query
                    ? {
                        OR: [
                            { user: { full_name: contains } },
                            { user: { email: contains } },
                            { branch: contains },
                            { skills: { has: query } },
                        ],
                    }
                    : {}),
            },
            include: {
                user: { select: { full_name: true, email: true } },
                _count: { select: { teamMembers: { where: { team: { proposal: { status: 'ACCEPTED', challenge: { status: { in: ['TEAM_FORMED', 'FUNDED', 'IN_PROGRESS'] } } } } } } } },
            },
            orderBy: { user: { full_name: 'asc' } },
            take: 50,
        });
    } catch (dbErr) {
        console.error('Student search error:', dbErr);
        return NextResponse.json(
            { success: false, error: 'Student search is temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    return NextResponse.json({
        success: true,
        data: students.map((sp) => ({
            id: sp.id,
            userId: sp.userId,
            name: sp.user.full_name,
            email: sp.user.email,
            branch: sp.branch,
            year: sp.year,
            skills: sp.skills.slice(0, 4),
            rating: sp.rating,
            credits: sp.credits,
            activeProjects: sp._count.teamMembers, // at most 3 at a time
        })).sort((a, b) => a.activeProjects - b.activeProjects),
        timestamp: new Date().toISOString(),
    });
}

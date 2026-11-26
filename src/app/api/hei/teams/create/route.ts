import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/middleware/auth';

// Obsolete endpoint: teams are now formed inside proposals and created when the district officer selects a proposal.
export async function POST(request: NextRequest) {
    const faculty = await requireUser(request, ['FACULTY']);
    if (faculty instanceof NextResponse) return faculty;

    return NextResponse.json(
        {
            success: false,
            error: "Teams are now formed by submitting a proposal with a team; the district officer's selection creates the project.",
            timestamp: new Date().toISOString(),
        },
        { status: 410 }
    );
}

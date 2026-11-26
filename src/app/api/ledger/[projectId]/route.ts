import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeMerkleRoot } from '@/lib/merkle';

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await context.params;
    const now = new Date().toISOString();

    let team;
    try {
        // A project is addressed by its team id, proposal id, or challenge id.
        team = await prisma.projectTeam.findFirst({
            where: {
                OR: [{ id: projectId }, { proposalId: projectId }, { proposal: { challengeId: projectId } }],
            },
            include: {
                hei: true,
                proposal: { include: { challenge: true } },
                milestones: { orderBy: { dueDate: 'asc' } },
            },
        });
    } catch (dbErr) {
        console.error('DB lookup failed in ledger route:', dbErr);
        return NextResponse.json(
            { success: false, error: 'The ledger is temporarily unavailable. Please try again shortly.', timestamp: now },
            { status: 503 }
        );
    }

    if (!team) {
        return NextResponse.json(
            { success: false, error: `No project found for "${projectId}".`, timestamp: now },
            { status: 404 }
        );
    }

    const ch = team.proposal.challenge;
    const milestones = team.milestones.map((m) => ({
        id: m.id,
        teamId: m.teamId,
        title: m.title,
        description: m.description,
        dueDate: m.dueDate.toISOString(),
        status: m.status,
        proofUrls: m.proofUrls,
        proofVideoUrl: m.proofVideoUrl,
        // Only the hash stored at submission counts; an unsealed milestone shows null.
        hashValue: m.hashValue,
        gpsLat: m.gpsLat,
        gpsLng: m.gpsLng,
        exifTimestamp: m.exifTimestamp ? m.exifTimestamp.toISOString() : null,
        verifierCode: m.verifierCode,
        fundReleased: m.fundReleased,
        createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json({
        success: true,
        data: {
            project: {
                id: team.id,
                teamId: team.id,
                title: ch.title,
                district: ch.district,
                sdgTags: ch.sdgTags,
                status: ch.status,
                universityName: team.hei.name,
                facultyLead: team.facultyName,
            },
            milestones,
            merkleRoot: computeMerkleRoot(milestones.map((m) => m.hashValue ?? '').filter(Boolean)),
        },
        timestamp: now,
    });
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';


function computeEntityLink(
    entityType?: string | null,
    entityId?: string | null,
    challengeId?: string | null
): string | undefined {
    const type = (entityType || '').toUpperCase();
    const effectiveChallengeId = challengeId || entityId || '';

    if (type === 'CHALLENGE') {
        return `/track/${effectiveChallengeId}`;
    }
    if (type === 'MILESTONE') {
        return '/dashboard/hei/milestones';
    }
    if (type === 'PROPOSAL') {
        return `/dashboard/hei/proposal/${effectiveChallengeId}`;
    }
    if (type === 'CREDENTIAL') {
        return '/dashboard/hei/credentials';
    }
    if (type === 'RISK_FLAG') {
        return effectiveChallengeId ? `/track/${effectiveChallengeId}` : '/dashboard/government';
    }
    return effectiveChallengeId ? `/track/${effectiveChallengeId}` : undefined;
}


export async function GET(req: NextRequest) {
    try {
        const user = await requireUser(req);
        if (user instanceof NextResponse) return user;
        const userId = user.id;

        let notifications;
        try {
            notifications = await prisma.notification.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 10,
                include: { challenge: { select: { id: true, title: true, district: true } } },
            });
        } catch (dbErr) {
            console.error('Database query for notifications failed:', dbErr);
            return NextResponse.json(
                { success: false, error: 'Notifications are temporarily unavailable.', timestamp: new Date().toISOString() },
                { status: 503 }
            );
        }

        const formatted = notifications.map((n) => ({
            id: n.id,
            userId: n.userId,
            message: n.message,
            priority: n.priority || 'P2',
            read: n.read,
            entityType: n.entityType,
            entityId: n.entityId,
            challengeId: n.challengeId,
            createdAt: n.createdAt.toISOString(),
            link: computeEntityLink(n.entityType, n.entityId, n.challengeId),
        }));

        return NextResponse.json({
            success: true,
            data: formatted,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Error fetching notifications:', error);
        return NextResponse.json(
            { success: false, error: 'Notifications are temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }
}

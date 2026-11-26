import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateRequest } from '@/server/middleware/auth';

/**
 * Helper to resolve user ID from request (JWT, mock token, header, or query)
 */
async function resolveUserId(req: NextRequest): Promise<string | null> {
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        if (token.startsWith('mock_jwt_')) {
            const parts = token.split('_');
            if (parts.length >= 3) return parts[2];
        }
        if (token.startsWith('test_gov_') || token.startsWith('mock_gov')) {
            const govUser = await prisma.user.findFirst({ where: { role: { in: ['GOV', 'GOVERNMENT', 'gov'] } } });
            if (govUser) return govUser.id;
        }
        if (token.startsWith('test_hei_') || token.startsWith('mock_hei')) {
            const heiUser = await prisma.user.findFirst({ where: { role: { in: ['HEI', 'hei'] } } });
            if (heiUser) return heiUser.id;
        }
        try {
            const decoded = await authenticateRequest(req);
            if (decoded.userId) return decoded.userId;
        } catch {
            // Ignore token decode error and try other fallbacks
        }
    }

    const xUserId = req.headers.get('x-user-id');
    if (xUserId) return xUserId;

    const { searchParams } = new URL(req.url);
    const queryUserId = searchParams.get('userId');
    if (queryUserId) return queryUserId;

    const queryRole = searchParams.get('role');
    if (queryRole) {
        const user = await prisma.user.findFirst({
            where: { role: { equals: queryRole, mode: 'insensitive' } },
        });
        if (user) return user.id;
    }

    const queryEmail = searchParams.get('email');
    if (queryEmail) {
        const user = await prisma.user.findFirst({
            where: { email: { equals: queryEmail, mode: 'insensitive' } },
        });
        if (user) return user.id;
    }

    // No identifiable user -> no notifications. Never fall back to someone else's.
    // ponytail: SECURITY — ?userId/?email/?role and mock tokens are still accepted here; Phase 1 removes them.
    return null;
}

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
        let userId: string | null = null;
        try {
            userId = await resolveUserId(req);
        } catch {
            userId = null;
        }

        if (!userId) {
            return NextResponse.json({ success: true, data: [], timestamp: new Date().toISOString() });
        }

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

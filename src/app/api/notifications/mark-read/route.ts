import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateRequest } from '@/server/middleware/auth';

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
            // Ignore error
        }
    }

    const xUserId = req.headers.get('x-user-id');
    if (xUserId) return xUserId;

    const { searchParams } = new URL(req.url);
    const queryUserId = searchParams.get('userId');
    if (queryUserId) return queryUserId;

    return null;
}

export async function POST(req: NextRequest) {
    try {
        let body: any = {};
        try {
            body = await req.json();
        } catch {
            body = {};
        }

        const { notificationIds, notificationId } = body;
        const userId = await resolveUserId(req);

        // Only ever touch the requesting user's own notifications.
        // ponytail: SECURITY — userId still comes from mock tokens / x-user-id / ?userId until Phase 1.
        if (!userId) {
            return NextResponse.json(
                { success: false, error: 'Sign in to update notifications.', timestamp: new Date().toISOString() },
                { status: 401 }
            );
        }

        const targetIds: string[] = Array.isArray(notificationIds)
            ? notificationIds.filter((id: unknown): id is string => typeof id === 'string')
            : typeof notificationId === 'string' ? [notificationId] : [];

        const result = await prisma.notification.updateMany({
            where: targetIds.length > 0 ? { userId, id: { in: targetIds } } : { userId, read: false },
            data: { read: true },
        });
        const updatedCount = result.count;

        return NextResponse.json({
            success: true,
            data: { markedCount: updatedCount },
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Error marking notifications read:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to mark notifications read',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}

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

export async function GET(req: NextRequest) {
    try {
        const userId = await resolveUserId(req);

        // No identifiable user -> 0. Never count other users' notifications.
        const count = userId ? await prisma.notification.count({ where: { userId, read: false } }) : 0;

        return NextResponse.json({
            success: true,
            data: { count },
            count,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Error fetching unread notification count:', error);
        return NextResponse.json(
            { success: false, error: 'Unread count is temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }
}

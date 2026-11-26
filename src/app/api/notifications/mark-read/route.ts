import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';


export async function POST(req: NextRequest) {
    try {
        let body: any = {};
        try {
            body = await req.json();
        } catch {
            body = {};
        }

        const { notificationIds, notificationId } = body;
        const user = await requireUser(req);
        if (user instanceof NextResponse) return user;
        const userId = user.id;
        // Only ever touch the requesting user's own notifications.

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

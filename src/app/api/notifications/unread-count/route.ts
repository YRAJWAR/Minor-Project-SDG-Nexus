import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';


export async function GET(req: NextRequest) {
    try {
        const user = await requireUser(req);
        if (user instanceof NextResponse) return user;
        const userId = user.id;

        const count = await prisma.notification.count({ where: { userId, read: false } });

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

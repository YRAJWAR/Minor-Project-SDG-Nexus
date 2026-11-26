import { requireUser } from '@/server/middleware/auth';
import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

// CSR partners registered on the platform (used for the "preferred CSR partner" choice in proposals).
export async function GET(req: NextRequest) {
    const user = await requireUser(req, ['FACULTY']);
    if (user instanceof NextResponse) return user;
    let orgs;
    try {
        orgs = await prisma.organization.findMany({
            where: { type: 'CORPORATE' },
            select: { id: true, name: true, registration_number: true, state: true, district: true },
            orderBy: { name: 'asc' },
        });
    } catch (dbErr) {
        console.error('Prisma query failed in /api/corporate/list:', dbErr);
        return NextResponse.json(
            { success: false, error: 'CSR partners are temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    return NextResponse.json({ success: true, data: orgs, timestamp: new Date().toISOString() });
}

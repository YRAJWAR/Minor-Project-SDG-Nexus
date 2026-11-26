import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Unresolved risk flags, newest first. An empty list means there are none — nothing is invented.
export async function GET() {
    let flags;
    try {
        flags = await prisma.riskFlag.findMany({
            where: { resolved: false },
            include: { organization: { select: { id: true, name: true, type: true, district: true, state: true } } },
            orderBy: { created_at: 'desc' },
            take: 50,
        });
    } catch (dbErr) {
        console.error('Prisma error in /api/government/risk-flags:', dbErr);
        return NextResponse.json(
            { success: false, error: 'Risk flags are temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    return NextResponse.json({
        success: true,
        data: { riskFlags: flags, totalActive: flags.length },
        timestamp: new Date().toISOString(),
    });
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Public liveness check. The sign-in page calls it on load so a sleeping database is awake by the time someone signs in.
export async function GET() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: false }, { status: 503 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/middleware/auth';
import { publicUser } from '@/server/auth/publicUser';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const user = await requireUser(req);
    if (user instanceof NextResponse) return user;
    return NextResponse.json({ success: true, data: publicUser(user) });
}

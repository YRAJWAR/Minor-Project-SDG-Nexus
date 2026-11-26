import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/server/middleware/auth';

export async function POST() {
    return clearSessionCookie(NextResponse.json({ success: true }));
}

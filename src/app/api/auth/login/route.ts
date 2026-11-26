import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { loadUser, setSessionCookie, signSession } from '@/server/middleware/auth';
import { rateLimitSensitive } from '@/server/middleware/rateLimit';
import { AppError, handleApiError } from '@/server/middleware/errorHandler';
import { publicUser } from '@/server/auth/publicUser';

export async function POST(req: NextRequest) {
    try {
        rateLimitSensitive(req); // ponytail: in-memory limit per server instance; a DB-backed limit comes with abuse protection in Phase 2

        const body = await req.json().catch(() => null);
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body?.password === 'string' ? body.password : '';
        if (!email || !password) throw AppError.badRequest('Email and password are required');

        let user;
        try {
            user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, password_hash: true } });
        } catch (dbErr) {
            console.error('Login lookup failed:', dbErr);
            throw new AppError('Sign-in is temporarily unavailable.', 503, 'SERVICE_UNAVAILABLE');
        }

        // Same message for unknown email and wrong password, so accounts can't be probed.
        const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
        if (!user || !ok) throw new AppError('Email or password is incorrect.', 401, 'AUTH_INVALID_CREDENTIALS');

        const full = await loadUser(user.id);
        if (!full) throw new AppError('Sign-in failed.', 500, 'INTERNAL_ERROR');
        return setSessionCookie(NextResponse.json({ success: true, data: publicUser(full) }), signSession(user));
    } catch (error) {
        return handleApiError(error);
    }
}

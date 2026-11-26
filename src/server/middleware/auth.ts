// ──────────────────────────────────────────────────────────────
// SDG Nexus — Authentication & authorisation
// Session = signed JWT in an httpOnly cookie. Every protected route calls
// requireUser(req, roles) and gets either the user (loaded fresh from the DB)
// or a ready 401/403 response. No test tokens, headers or query params are trusted.
// ──────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import prisma from '@/lib/prisma';

export const SESSION_COOKIE = 'sdg_session';
const SESSION_DAYS = 7;

export interface SessionClaims {
    sub: string; // user id
    role: Role;
}

// Fail closed in production: no default signing secret.
function secret(): string {
    const s = process.env.JWT_SECRET;
    if (s && s.length >= 32) return s;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set (at least 32 characters) in production');
    }
    return 'sdg-nexus-local-development-secret-not-for-production';
}

export function signSession(user: { id: string; role: Role }): string {
    return jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: `${SESSION_DAYS}d` });
}

export function readSession(token: string | undefined): SessionClaims | null {
    if (!token) return null;
    try {
        const claims = jwt.verify(token, secret()) as SessionClaims;
        return claims.sub && claims.role ? { sub: claims.sub, role: claims.role } : null;
    } catch {
        return null;
    }
}

export function setSessionCookie(res: NextResponse, token: string): NextResponse {
    res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
    return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
    res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return res;
}

const sessionUserSelect = {
    id: true,
    full_name: true,
    email: true,
    role: true,
    created_at: true,
    heiId: true,
    organizationId: true,
    districtId: true,
    hei: { select: { id: true, name: true } },
    organization: { select: { id: true, name: true, verification_status: true } },
    district: { select: { id: true, name: true, state: { select: { name: true } } } },
} as const;

export type SessionUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

/** Loads a user with the fields every permission check needs. */
export function loadUser(id: string) {
    return prisma.user.findUnique({ where: { id }, select: sessionUserSelect });
}

/** The signed-in user (fresh from the DB), or null. Never throws for a bad/missing cookie. */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
    const claims = readSession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!claims) return null;
    return loadUser(claims.sub);
}

const deny = (status: 401 | 403, error: string) =>
    NextResponse.json({ success: false, error, timestamp: new Date().toISOString() }, { status });

/**
 * Use at the top of a route:
 *   const user = await requireUser(req, ['OFFICER', 'ADMIN']);
 *   if (user instanceof NextResponse) return user;
 * An empty role list means "any signed-in user".
 */
export async function requireUser(req: NextRequest, roles: Role[] = []): Promise<SessionUser | NextResponse> {
    let user: SessionUser | null;
    try {
        user = await getSessionUser(req);
    } catch (err) {
        console.error('Session lookup failed:', err);
        return NextResponse.json(
            { success: false, error: 'Sign-in is temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }
    if (!user) return deny(401, 'Please sign in to continue.');
    if (roles.length > 0 && !roles.includes(user.role)) {
        return deny(403, 'Your role is not allowed to do this.');
    }
    return user;
}

/** Officers act only inside their district; admins act everywhere. */
export function inJurisdiction(user: SessionUser, challengeDistrict: string): boolean {
    if (user.role === 'ADMIN') return true;
    return user.role === 'OFFICER' && !!user.district &&
        user.district.name.trim().toLowerCase() === challengeDistrict.trim().toLowerCase();
}

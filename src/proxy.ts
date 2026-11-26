// Page guard (Next.js 16 "proxy", runs on Node.js).
// Signed-out visitors go to /login; users in the wrong role go back to /dashboard,
// which forwards them to their own workspace. API routes enforce permissions themselves —
// this only keeps people out of pages they cannot use.
import { NextRequest, NextResponse } from 'next/server';
import type { Role } from '@prisma/client';
import { SESSION_COOKIE, readSession } from '@/server/middleware/auth';

// First matching prefix wins, so more specific paths come first.
const RULES: { prefix: string; exact?: boolean; roles: Role[] }[] = [
    { prefix: '/dashboard/government', roles: ['OFFICER', 'ADMIN'] },
    { prefix: '/dashboard/hei/milestones', roles: ['FACULTY', 'STUDENT'] },
    { prefix: '/dashboard/hei/credentials', roles: ['FACULTY', 'STUDENT'] },
    { prefix: '/dashboard/hei', roles: ['FACULTY'] },
    { prefix: '/dashboard/ngo', roles: ['NGO'] },
    { prefix: '/dashboard/corporate', roles: ['CSR'] },
    { prefix: '/dashboard', roles: [] }, // shared pages: any signed-in user
    { prefix: '/citizen/submit', roles: ['CITIZEN', 'ADMIN'] },
];

export function proxy(req: NextRequest) {
    const path = req.nextUrl.pathname;
    const rule = RULES.find((r) => path === r.prefix || path.startsWith(r.prefix + '/'));
    if (!rule) return NextResponse.next();

    const session = readSession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
        const url = new URL('/login', req.url);
        url.searchParams.set('next', path);
        return NextResponse.redirect(url);
    }
    if (rule.roles.length > 0 && !rule.roles.includes(session.role)) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
}

export const config = {
    matcher: ['/dashboard/:path*', '/citizen/:path*'],
};

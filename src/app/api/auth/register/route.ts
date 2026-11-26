import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Prisma, type Role } from '@prisma/client';
import prisma from '@/lib/prisma';
import config from '@/server/config';
import { loadUser, setSessionCookie, signSession } from '@/server/middleware/auth';
import { rateLimitSensitive } from '@/server/middleware/rateLimit';
import { AppError, handleApiError } from '@/server/middleware/errorHandler';
import { publicUser } from '@/server/auth/publicUser';

// Who may self-register, and how they are linked:
//   CITIZEN          → active immediately
//   FACULTY, STUDENT → join a university with its invite code
//   NGO, CSR         → create their organisation, which stays PENDING until an admin verifies it
//   OFFICER, ADMIN   → never self-registered (created by an admin / the seed)
const SELF_SERVE: Role[] = ['CITIZEN', 'FACULTY', 'STUDENT', 'NGO', 'CSR'];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function POST(req: NextRequest) {
    try {
        rateLimitSensitive(req);
        const b = await req.json().catch(() => null);
        if (!b || typeof b !== 'object') throw AppError.badRequest('Invalid request body');

        const name = str(b.name, 100);
        const email = str(b.email, 254).toLowerCase();
        const password = typeof b.password === 'string' ? b.password : '';
        const role = b.role as Role;

        const errors: string[] = [];
        if (name.length < 2) errors.push('name: at least 2 characters');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email: must be a valid address');
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
            errors.push('password: at least 8 characters with a letter and a number');
        }
        if (!SELF_SERVE.includes(role)) errors.push('role: this role cannot be self-registered');

        const inviteCode = str(b.inviteCode, 64);
        const branch = str(b.branch, 80);
        const year = Number(b.year);
        const orgName = str(b.organizationName, 150);
        const orgState = str(b.state, 80);
        const orgDistrict = str(b.district, 80) || null;
        if ((role === 'FACULTY' || role === 'STUDENT') && !inviteCode) errors.push('inviteCode: required to join a university');
        if (role === 'STUDENT' && (!branch || !Number.isInteger(year) || year < 1 || year > 6)) {
            errors.push('branch and year (1–6): required for students');
        }
        if ((role === 'NGO' || role === 'CSR') && (orgName.length < 2 || !orgState)) {
            errors.push('organizationName and state: required for NGOs and CSR partners');
        }
        if (errors.length) throw AppError.badRequest('Validation failed', errors);

        let userId: string;
        try {
            const hei = inviteCode ? await prisma.hEI.findUnique({ where: { inviteCode }, select: { id: true } }) : null;
            if ((role === 'FACULTY' || role === 'STUDENT') && !hei) throw AppError.badRequest('That university invite code is not valid.');
            if (orgState && !(await prisma.state.findUnique({ where: { name: orgState } }))) {
                throw AppError.badRequest('Please choose a state from the list.');
            }

            const password_hash = await bcrypt.hash(password, config.bcryptSaltRounds);
            const user = await prisma.$transaction(async (tx) => {
                const org = role === 'NGO' || role === 'CSR'
                    ? await tx.organization.create({
                        data: { name: orgName, type: role === 'NGO' ? 'NGO' : 'CORPORATE', state: orgState, district: orgDistrict, verification_status: 'PENDING' },
                    })
                    : null;
                const created = await tx.user.create({
                    data: { full_name: name, email, password_hash, role, heiId: hei?.id ?? null, organizationId: org?.id ?? null },
                });
                if (role === 'STUDENT') {
                    await tx.studentProfile.create({ data: { userId: created.id, branch, year, skills: [] } });
                }
                return created;
            });
            userId = user.id;
        } catch (err) {
            if (err instanceof AppError) throw err;
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                throw AppError.conflict('An account with this email already exists.');
            }
            console.error('Registration failed:', err);
            throw new AppError('Registration is temporarily unavailable.', 503, 'SERVICE_UNAVAILABLE');
        }

        const full = await loadUser(userId);
        if (!full) throw new AppError('Registration failed.', 500, 'INTERNAL_ERROR');
        return setSessionCookie(
            NextResponse.json({ success: true, data: publicUser(full) }, { status: 201 }),
            signSession(full)
        );
    } catch (error) {
        return handleApiError(error);
    }
}

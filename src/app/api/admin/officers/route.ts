import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';
import { appendLedger } from '@/server/ledger';
import config from '@/server/config';

// District officers are never self-registered: the admin creates them, one district each.
export async function GET(req: NextRequest) {
    const user = await requireUser(req, ['ADMIN']);
    if (user instanceof NextResponse) return user;
    try {
        const officers = await prisma.user.findMany({
            where: { role: 'OFFICER' },
            select: { id: true, full_name: true, email: true, created_at: true, district: { select: { name: true, state: { select: { name: true } } } } },
            orderBy: { created_at: 'desc' },
        });
        return NextResponse.json({ success: true, data: officers.map((o) => ({ id: o.id, name: o.full_name, email: o.email, district: o.district?.name ?? null, state: o.district?.state.name ?? null, createdAt: o.created_at })) });
    } catch (err) {
        console.error('Admin officers failed:', err);
        return NextResponse.json({ success: false, error: 'Officers are temporarily unavailable.' }, { status: 503 });
    }
}

// { name, email, state, district, password } — the admin hands the first password to the officer.
export async function POST(req: NextRequest) {
    const user = await requireUser(req, ['ADMIN']);
    if (user instanceof NextResponse) return user;
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (name.length < 3 || name.length > 80) return NextResponse.json({ success: false, error: 'Name must be 3–80 characters.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ success: false, error: 'The first password must be at least 8 characters.' }, { status: 400 });
    try {
        const district = await prisma.district.findFirst({ where: { name: String(body.district ?? ''), state: { name: String(body.state ?? '') } }, select: { id: true, name: true } });
        if (!district) return NextResponse.json({ success: false, error: 'Choose a district from the list for the selected state.' }, { status: 400 });
        if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
            return NextResponse.json({ success: false, error: 'An account with this email already exists.' }, { status: 409 });
        }
        const password_hash = await bcrypt.hash(password, config.bcryptSaltRounds);
        const officer = await prisma.$transaction(async (tx) => {
            const o = await tx.user.create({ data: { full_name: name, email, password_hash, role: 'OFFICER', districtId: district.id }, select: { id: true } });
            await appendLedger({ actor_id: user.id, actor_role: user.role, action: 'OFFICER_CREATED', entity_type: 'User', entity_id: o.id, new_value: { district: district.name, state: body.state } }, tx);
            return o;
        });
        return NextResponse.json({ success: true, data: { id: officer.id } }, { status: 201 });
    } catch (err) {
        console.error('Creating officer failed:', err);
        return NextResponse.json({ success: false, error: 'Could not create the officer right now. Nothing was saved.' }, { status: 503 });
    }
}

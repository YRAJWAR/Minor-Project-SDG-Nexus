import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';
import { appendLedger } from '@/server/ledger';

// NGO and CSR organisations with their verification status (pending first). Admin only.
export async function GET(req: NextRequest) {
    const user = await requireUser(req, ['ADMIN']);
    if (user instanceof NextResponse) return user;
    try {
        const orgs = await prisma.organization.findMany({
            where: { type: { in: ['NGO', 'CORPORATE'] } },
            select: { id: true, name: true, type: true, state: true, district: true, registration_number: true, verification_status: true, created_at: true, _count: { select: { members: true } } },
            orderBy: [{ created_at: 'desc' }],
        });
        const order: Record<string, number> = { PENDING: 0, REJECTED: 1, VERIFIED: 2 };
        orgs.sort((a, b) => (order[a.verification_status] ?? 3) - (order[b.verification_status] ?? 3));
        return NextResponse.json({ success: true, data: orgs.map(({ _count, ...o }) => ({ ...o, members: _count.members })) });
    } catch (err) {
        console.error('Admin organisations failed:', err);
        return NextResponse.json({ success: false, error: 'Organisations are temporarily unavailable.' }, { status: 503 });
    }
}

// { id, status: 'VERIFIED' | 'REJECTED' } — the decision is written to the ledger.
export async function PATCH(req: NextRequest) {
    const user = await requireUser(req, ['ADMIN']);
    if (user instanceof NextResponse) return user;
    const { id, status } = await req.json().catch(() => ({}));
    if (typeof id !== 'string' || !['VERIFIED', 'REJECTED'].includes(status)) {
        return NextResponse.json({ success: false, error: 'Send an organisation id and VERIFIED or REJECTED.' }, { status: 400 });
    }
    try {
        const org = await prisma.organization.findUnique({ where: { id }, select: { type: true, verification_status: true } });
        if (!org || !['NGO', 'CORPORATE'].includes(org.type)) return NextResponse.json({ success: false, error: 'Organisation not found.' }, { status: 404 });
        if (org.verification_status === status) return NextResponse.json({ success: true });
        await prisma.$transaction(async (tx) => {
            await tx.organization.update({ where: { id }, data: { verification_status: status } });
            await appendLedger({ actor_id: user.id, actor_role: user.role, action: `ORGANIZATION_${status}`, entity_type: 'Organization', entity_id: id, previous_value: { status: org.verification_status }, new_value: { status } }, tx);
        });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Organisation decision failed:', err);
        return NextResponse.json({ success: false, error: 'Could not save right now. Nothing was changed.' }, { status: 503 });
    }
}

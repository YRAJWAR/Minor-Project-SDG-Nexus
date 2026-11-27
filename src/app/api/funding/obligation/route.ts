import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';
import { financialYear, csrObligation } from '@/lib/csr';

// A CSR partner's 2% obligation for the current financial year: what is required, what it committed and released.
export async function GET(req: NextRequest) {
    const user = await requireUser(req, ['CSR']);
    if (user instanceof NextResponse) return user;
    if (!user.organizationId) return NextResponse.json({ success: false, error: 'Your account is not linked to a CSR organisation.' }, { status: 403 });
    try {
        const fy = financialYear(new Date());
        const inFy = { gte: fy.start, lt: fy.end };
        const [org, released, committed] = await Promise.all([
            prisma.organization.findUnique({ where: { id: user.organizationId }, select: { avgNetProfit: true } }),
            prisma.milestone.aggregate({ where: { releasedByOrgId: user.organizationId, releasedAt: inFy }, _sum: { fundReleased: true } }),
            prisma.fundingCommitment.aggregate({ where: { csrOrgId: user.organizationId, createdAt: inFy }, _sum: { amount: true } }),
        ]);
        const releasedThisYear = released._sum.fundReleased ?? 0;
        return NextResponse.json({
            success: true,
            data: { financialYear: fy.label, avgNetProfit: org?.avgNetProfit ?? null, committedThisYear: committed._sum.amount ?? 0, releasedThisYear, obligation: csrObligation(org?.avgNetProfit ?? null, releasedThisYear) },
        });
    } catch (err) {
        console.error('CSR obligation failed:', err);
        return NextResponse.json({ success: false, error: 'CSR figures are temporarily unavailable.' }, { status: 503 });
    }
}

// The partner enters its average net profit of the last three financial years (₹).
export async function PATCH(req: NextRequest) {
    const user = await requireUser(req, ['CSR']);
    if (user instanceof NextResponse) return user;
    if (!user.organizationId) return NextResponse.json({ success: false, error: 'Your account is not linked to a CSR organisation.' }, { status: 403 });
    const { avgNetProfit } = await req.json().catch(() => ({}));
    if (typeof avgNetProfit !== 'number' || !Number.isFinite(avgNetProfit) || avgNetProfit < 0 || avgNetProfit > 1e13) {
        return NextResponse.json({ success: false, error: 'Enter the average net profit in rupees (0 or more).' }, { status: 400 });
    }
    try {
        await prisma.organization.update({ where: { id: user.organizationId }, data: { avgNetProfit: Math.round(avgNetProfit) } });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Saving net profit failed:', err);
        return NextResponse.json({ success: false, error: 'Could not save right now. Please try again.' }, { status: 503 });
    }
}

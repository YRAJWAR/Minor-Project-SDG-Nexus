import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';

// The signed-in person's own reports and the ones they support ("me too"), with what is waiting on them.
export async function GET(req: NextRequest) {
    const user = await requireUser(req, ['CITIZEN', 'NGO']);
    if (user instanceof NextResponse) return user;
    try {
        const select = {
            id: true, title: true, district: true, state: true, status: true, createdAt: true, updatedAt: true, submitterId: true,
            confirmedAt: true, rejectReason: true, mergedIntoId: true, verifiedBeneficiaries: true,
            _count: { select: { endorsements: true } },
            proposals: { where: { status: 'ACCEPTED' as const }, select: { hei: { select: { name: true } } } },
        };
        const [mine, supported] = await Promise.all([
            prisma.challenge.findMany({ where: { submitterId: user.id }, select, orderBy: { updatedAt: 'desc' } }),
            prisma.challenge.findMany({ where: { endorsements: { some: { userId: user.id } }, NOT: { submitterId: user.id } }, select, orderBy: { updatedAt: 'desc' } }),
        ]);
        const shape = (c: (typeof mine)[number]) => ({
            id: c.id, title: c.title, place: [c.district, c.state].filter(Boolean).join(', '), status: c.status,
            createdAt: c.createdAt, updatedAt: c.updatedAt, supporters: c._count.endorsements,
            university: c.proposals[0]?.hei.name ?? null, rejectReason: c.rejectReason, mergedIntoId: c.mergedIntoId,
            verifiedBeneficiaries: c.verifiedBeneficiaries,
            // Only the reporter can confirm or dispute, once the work is paid for.
            needsYou: c.submitterId === user.id && c.status === 'COMPLETED' && !c.confirmedAt,
        });
        return NextResponse.json({ success: true, data: { reported: mine.map(shape), supported: supported.map(shape) } });
    } catch (err) {
        console.error('My reports failed:', err);
        return NextResponse.json({ success: false, error: 'Your reports are temporarily unavailable.' }, { status: 503 });
    }
}

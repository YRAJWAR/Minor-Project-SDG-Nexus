import { requireUser } from '@/server/middleware/auth';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const parseJson = (v: string | null) => {
    if (!v) return null;
    try { return JSON.parse(v); } catch { return v; }
};

// Real audit log entries only, in the shape the government Audit Trail table reads.
// ponytail: entries are plain rows, not hash-chained; the tamper-evident ledger arrives in Phase 2.
export async function GET(request: NextRequest) {
    const user = await requireUser(request, ['OFFICER', 'ADMIN']);
    if (user instanceof NextResponse) return user;
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const actionFilter = searchParams.get('action');

    const created: { gte?: Date; lte?: Date } = {};
    if (dateFrom && !Number.isNaN(Date.parse(dateFrom))) created.gte = new Date(dateFrom);
    if (dateTo && !Number.isNaN(Date.parse(dateTo))) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        created.lte = to;
    }

    let logs;
    try {
        logs = await prisma.auditLog.findMany({
            where: {
                ...(actionFilter && actionFilter !== 'ALL' ? { action: actionFilter } : {}),
                ...(created.gte || created.lte ? { created_at: created } : {}),
            },
            orderBy: { created_at: 'desc' },
            take: 100,
        });
    } catch (dbErr) {
        console.error('Prisma error in /api/government/audit:', dbErr);
        return NextResponse.json(
            { success: false, error: 'The audit trail is temporarily unavailable.', timestamp: new Date().toISOString() },
            { status: 503 }
        );
    }

    const data = logs.map((log) => ({
        id: log.id,
        created_at: log.created_at.toISOString(),
        actor: { email: log.actor_id, role: log.actor_role },
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        district: null,
        details: { previous: parseJson(log.previous_value), new: parseJson(log.new_value) },
    }));

    return NextResponse.json({ success: true, data: { logs: data, total: data.length }, timestamp: new Date().toISOString() });
}

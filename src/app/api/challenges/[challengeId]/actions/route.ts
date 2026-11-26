import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/middleware/auth';
import { transition, LifecycleError, type Action } from '@/server/lifecycle';

// POST { action: 'VERIFY'|'REJECT'|'MERGE'|'ASSIGN'|'ENDORSE'|'SELECT_PROPOSAL'|'COMMIT_FUNDS', reason?, targetId?, heiId?, sdgTags?, proposalId?, amount? }
// All rules live in src/server/lifecycle.ts; this route only passes the request through.
export async function POST(req: NextRequest, context: { params: Promise<{ challengeId: string }> }) {
    const user = await requireUser(req);
    if (user instanceof NextResponse) return user;
    const { challengeId } = await context.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== 'string') return NextResponse.json({ success: false, error: 'action is required' }, { status: 400 });

    try {
        const result = await transition(challengeId, body.action.toUpperCase() as Action, user, {
            reason: typeof body.reason === 'string' ? body.reason : undefined,
            targetId: typeof body.targetId === 'string' ? body.targetId : undefined,
            heiId: typeof body.heiId === 'string' ? body.heiId : undefined,
            sdgTags: Array.isArray(body.sdgTags) ? body.sdgTags.map(Number) : undefined,
            proposalId: typeof body.proposalId === 'string' ? body.proposalId : undefined,
            amount: body.amount !== undefined ? Number(body.amount) : undefined,
        });
        return NextResponse.json({ success: true, data: result });
    } catch (err) {
        if (err instanceof LifecycleError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
        console.error('Challenge action failed:', err);
        return NextResponse.json({ success: false, error: 'The change could not be saved. Nothing was updated — please try again.' }, { status: 503 });
    }
}

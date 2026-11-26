import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/middleware/auth';
import { verifyLedger } from '@/server/ledger';

// Recomputes the hash chain over every audit entry and reports the first one that does not match.
export async function GET(req: NextRequest) {
    const user = await requireUser(req);
    if (user instanceof NextResponse) return user;
    try {
        return NextResponse.json({ success: true, data: await verifyLedger() });
    } catch (err) {
        console.error('Ledger chain check failed:', err);
        return NextResponse.json({ success: false, error: 'The ledger check is temporarily unavailable.' }, { status: 503 });
    }
}

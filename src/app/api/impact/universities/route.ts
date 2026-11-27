import { NextResponse } from 'next/server';
import { computeUniversityScores } from '@/server/trackRecord';

// Public: university impact scores from resolved projects only, with the breakdown behind each number.
export async function GET() {
    try {
        return NextResponse.json({ success: true, data: await computeUniversityScores() });
    } catch (err) {
        console.error('University scores failed:', err);
        return NextResponse.json({ success: false, error: 'Scores are temporarily unavailable.' }, { status: 503 });
    }
}

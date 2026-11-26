import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// All states/UTs with their districts, for every location picker. Public, cacheable reference data.
export async function GET() {
    try {
        const states = await prisma.state.findMany({
            orderBy: { name: 'asc' },
            select: { name: true, districts: { orderBy: { name: 'asc' }, select: { name: true } } },
        });
        return NextResponse.json(
            { success: true, data: states.map((s) => ({ name: s.name, districts: s.districts.map((d) => d.name) })) },
            { headers: { 'Cache-Control': 'public, s-maxage=86400' } }
        );
    } catch (err) {
        console.error('Regions query failed:', err);
        return NextResponse.json({ success: false, error: 'Regions are temporarily unavailable.' }, { status: 503 });
    }
}

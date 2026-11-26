import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildStudentCredentialPDF } from '@/lib/credentialPdf';

export const dynamic = 'force-dynamic';

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ credentialId: string }> }
) {
    const { credentialId } = await context.params;

    let cred;
    try {
        cred = await prisma.studentCredential.findUnique({
            where: { id: credentialId },
            include: { student: { include: { user: { include: { hei: true } } } } },
        });
    } catch (dbErr) {
        console.error(`DB error fetching credential for PDF ${credentialId}:`, dbErr);
        return new NextResponse('Certificate service is temporarily unavailable.', { status: 503 });
    }

    if (!cred) {
        return new NextResponse(`No credential exists with ID "${credentialId}".`, { status: 404 });
    }

    const doc = buildStudentCredentialPDF({
        credentialId: cred.id,
        studentName: cred.student.user.full_name,
        branch: cred.student.branch,
        year: cred.student.year,
        universityName: cred.student.user.hei?.name ?? null,
        challengeTitle: cred.challengeTitle,
        district: cred.challengeDistrict,
        sdgTags: cred.sdgTags,
        hoursContributed: cred.hoursContributed,
        creditPoints: cred.creditPoints,
        hashValue: cred.hashValue,
        issuedAt: cred.issuedAt,
    });

    const safeStudentName = cred.student.user.full_name.replace(/[^a-zA-Z0-9]/g, '_');
    return new NextResponse(Buffer.from(doc.output('arraybuffer')), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="Credential_${safeStudentName}_${credentialId.slice(0, 8)}.pdf"`,
            'Cache-Control': 'private, max-age=300',
        },
    });
}

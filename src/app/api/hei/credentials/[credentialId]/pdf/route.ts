import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildStudentCredentialPDF } from '@/lib/credentialPdf';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
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

    // The verify address printed (and encoded in the QR) is this deployment's own, unless NEXT_PUBLIC_APP_URL overrides it.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const qrDataUrl = await QRCode.toDataURL(`${appUrl}/verify/credential/${cred.id}`, { margin: 1, width: 240 });

    const doc = buildStudentCredentialPDF({
        appUrl,
        qrDataUrl,
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

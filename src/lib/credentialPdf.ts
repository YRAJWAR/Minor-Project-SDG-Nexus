import jsPDF from 'jspdf';
import { SDG_INFO } from '@/data/mockData';

export interface CredentialPDFData {
    credentialId: string;
    studentName: string;
    branch: string;
    year: number | string;
    universityName: string | null;
    challengeTitle: string;
    district: string;
    sdgTags: number[];
    hoursContributed: number;
    creditPoints: number;
    hashValue: string;
    issuedAt: string | Date;
    appUrl?: string;
}

/**
 * Builds the student achievement certificate PDF.
 * Only prints fields that are actually stored on the credential.
 */
export function buildStudentCredentialPDF(data: CredentialPDFData): jsPDF {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    const issuedDateStr = typeof data.issuedAt === 'string'
        ? new Date(data.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
        : data.issuedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    const baseUrl = data.appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/verify/credential/${data.credentialId}`;

    // 1. Background styling
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Decorative outer double border (Navy & Gold)
    doc.setDrawColor(30, 58, 138); // Navy
    doc.setLineWidth(1.2);
    doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);

    doc.setDrawColor(217, 119, 6); // Gold / Amber
    doc.setLineWidth(0.4);
    doc.rect(margin + 2.5, margin + 2.5, pageWidth - (margin + 2.5) * 2, pageHeight - (margin + 2.5) * 2);

    // Corner ornaments
    const drawCorner = (x: number, y: number, angle: number) => {
        doc.setFillColor(217, 119, 6);
        doc.circle(x, y, 1.5, 'F');
    };
    drawCorner(margin + 2.5, margin + 2.5, 0);
    drawCorner(pageWidth - (margin + 2.5), margin + 2.5, 0);
    drawCorner(margin + 2.5, pageHeight - (margin + 2.5), 0);
    drawCorner(pageWidth - (margin + 2.5), pageHeight - (margin + 2.5), 0);

    // 2. Top Header Banner
    doc.setFillColor(30, 58, 138); // Deep Royal Blue
    doc.rect(margin + 3, margin + 3, pageWidth - (margin + 3) * 2, 26, 'F');

    // Platform emblem (left)
    doc.setFillColor(255, 255, 255);
    doc.circle(margin + 16, margin + 16, 9.5, 'F');
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.6);
    doc.circle(margin + 16, margin + 16, 9.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 138);
    doc.text('SDG', margin + 16, margin + 17, { align: 'center' });

    // Header Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('SDG NEXUS', margin + 32, margin + 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(224, 231, 255);
    doc.text('Community problems, university solutions, verified impact', margin + 32, margin + 20.5);

    // 3. Certificate Title
    let y = margin + 37;
    doc.setFont('times', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text('Student Achievement Certificate', pageWidth / 2, y, { align: 'center' });

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Experiential learning credit (30 field hours = 1 credit)', pageWidth / 2, y, { align: 'center' });

    // 4. Certifies That
    y += 10;
    doc.setFont('times', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    doc.text('This is to certify that', pageWidth / 2, y, { align: 'center' });

    // Student Name
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(data.studentName.toUpperCase(), pageWidth / 2, y, { align: 'center' });

    // Academic details
    y += 5.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 58, 138);
    const branchYearText = `${data.branch} • Year ${data.year}`;
    doc.text(branchYearText, pageWidth / 2, y, { align: 'center' });

    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(data.universityName ?? '', pageWidth / 2, y, { align: 'center' });

    // 5. Societal Challenge Resolution Description
    y += 8;
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text('has successfully contributed to the resolution of a documented societal challenge:', pageWidth / 2, y, { align: 'center' });

    // Challenge Box
    y += 4;
    const boxX = margin + 8;
    const boxW = pageWidth - (margin + 8) * 2;
    const boxH = 46;

    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.4);
    doc.roundedRect(boxX, y, boxW, boxH, 2, 2, 'FD');

    let boxY = y + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    const splitTitle = doc.splitTextToSize(`Challenge: ${data.challengeTitle}`, boxW - 12);
    doc.text(splitTitle, boxX + 6, boxY);
    boxY += (splitTitle.length * 4.5) + 1;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`District: ${data.district}`, boxX + 6, boxY);

    // Format SDGs
    const sdgNames = data.sdgTags.map((tag) => {
        const found = SDG_INFO.find((s) => s.id === tag);
        return `SDG ${tag}${found ? ` (${found.name})` : ''}`;
    }).join(' • ');
    boxY += 4.5;
    doc.text(`SDGs Addressed: ${sdgNames}`, boxX + 6, boxY);

    // Key metrics grid inside box
    boxY += 5.5;
    doc.setFillColor(238, 242, 255); // indigo-50
    doc.roundedRect(boxX + 5, boxY, boxW - 10, 16, 1.5, 1.5, 'F');

    const colW = (boxW - 10) / 2;
    const metricY = boxY + 5;

    // Col 1: Field Hours
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 138);
    doc.text(`${data.hoursContributed} Hours`, boxX + 5 + colW * 0.5, metricY, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('FIELD CONTRIBUTION', boxX + 5 + colW * 0.5, metricY + 4.5, { align: 'center' });

    // Col 2: Academic Credits
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(16, 185, 129); // emerald-600
    doc.text(`${data.creditPoints} Credits`, boxX + 5 + colW * 1.5, metricY, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('ACADEMIC CREDITS', boxX + 5 + colW * 1.5, metricY + 4.5, { align: 'center' });

    y += boxH + 6;

    // 7. Cryptographic Verification & Tamper-Evident Footer Box
    const cryptoBoxH = 34;
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(boxX, y, boxW, cryptoBoxH, 2, 2, 'FD');

    let cY = y + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('INTEGRITY CHECK', boxX + 5, cY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text('Recompute this hash at the address below to confirm the certificate has not been altered.', boxX + 5, cY + 3.8);

    cY += 8.5;
    doc.setFont('courier', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 58, 138);
    doc.text(`SHA-256: ${data.hashValue}`, boxX + 5, cY);

    cY += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(`Verify Online: ${verifyUrl}`, boxX + 5, cY);

    cY += 4.5;
    doc.text(`Issued On: ${issuedDateStr} • SDG Nexus`, boxX + 5, cY);

    // 8. Signature line for the issuing institution
    y += cryptoBoxH + 14;
    const sigLineW = 70;
    const sigX = pageWidth / 2 - sigLineW / 2;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.4);
    doc.line(sigX, y, sigX + sigLineW, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Authorised signatory${data.universityName ? `, ${data.universityName}` : ''}`, pageWidth / 2, y + 4.5, { align: 'center' });

    return doc;
}

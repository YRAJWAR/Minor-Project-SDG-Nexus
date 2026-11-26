// Seeds reference data (all states/UTs and districts, the 17 SDGs) and one fictional demo
// account per role. Every person, university, NGO and company here is made up.
// Safe to re-run: it wipes the tables first. The demo story (challenges, projects) comes in Phase 5.
import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

// Shared by every demo account; also shown on the landing page.
const DEMO_PASSWORD = 'Demo@1234';

const SDGS = [
    'No Poverty', 'Zero Hunger', 'Good Health and Well-being', 'Quality Education', 'Gender Equality',
    'Clean Water and Sanitation', 'Affordable and Clean Energy', 'Decent Work and Economic Growth',
    'Industry, Innovation and Infrastructure', 'Reduced Inequalities', 'Sustainable Cities and Communities',
    'Responsible Consumption and Production', 'Climate Action', 'Life Below Water', 'Life on Land',
    'Peace, Justice and Strong Institutions', 'Partnerships for the Goals',
];

async function main() {
    // Children before parents.
    await prisma.$transaction([
        prisma.notification.deleteMany(), prisma.studentCredential.deleteMany(), prisma.milestone.deleteMany(),
        prisma.teamMember.deleteMany(), prisma.projectTeam.deleteMany(), prisma.challengeProposal.deleteMany(),
        prisma.challenge.deleteMany(), prisma.studentProfile.deleteMany(), prisma.auditLog.deleteMany(),
        prisma.riskFlag.deleteMany(), prisma.cSRAllocation.deleteMany(), prisma.impactScore.deleteMany(),
        prisma.projectActivity.deleteMany(), prisma.projectSDG.deleteMany(), prisma.project.deleteMany(),
        prisma.user.deleteMany(), prisma.organization.deleteMany(), prisma.hEI.deleteMany(),
        prisma.district.deleteMany(), prisma.state.deleteMany(), prisma.sDG.deleteMany(),
    ]);

    await prisma.sDG.createMany({ data: SDGS.map((name, i) => ({ id: i + 1, name })) });

    const regions: { states: { name: string; districts: string[] }[] } = JSON.parse(
        readFileSync(join(__dirname, 'data', 'india-regions.json'), 'utf8'),
    );
    for (const s of regions.states) {
        await prisma.state.create({
            data: { name: s.name, districts: { createMany: { data: [...new Set(s.districts)].map((name) => ({ name })) } } },
        });
    }
    const districtCount = await prisma.district.count();
    console.log(`✓ ${regions.states.length} states/UTs, ${districtCount} districts, 17 SDGs`);

    const nalgonda = await prisma.district.findFirstOrThrow({ where: { name: 'Nalgonda', state: { name: 'Telangana' } } });

    const uni = await prisma.hEI.create({
        data: {
            name: 'Krishna Valley Institute of Technology', ugcId: 'DEMO-HEI-001', state: 'Telangana', district: 'Nalgonda',
            lat: 17.05, lng: 79.27, inviteCode: 'KVIT-DEMO-2026', naacGrade: 'A',
            departments: ['Computer Science', 'Civil Engineering', 'Electrical Engineering'], sdgExpertise: [4, 6, 7, 9],
        },
    });
    const ngo = await prisma.organization.create({
        data: { name: 'Neer Sahayog Foundation', type: 'NGO', state: 'Telangana', district: 'Nalgonda', verification_status: 'VERIFIED' },
    });
    const csr = await prisma.organization.create({
        data: { name: 'Deccan Polymers Ltd (CSR)', type: 'CORPORATE', state: 'Telangana', district: 'Hyderabad', verification_status: 'VERIFIED' },
    });

    const password_hash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const account = (email: string, full_name: string, role: Role, link: { districtId?: number; heiId?: string; organizationId?: string } = {}) =>
        prisma.user.create({ data: { email, full_name, role, password_hash, ...link } });

    await account('admin@demo.sdgnexus.in', 'Platform Admin', 'ADMIN');
    await account('officer.nalgonda@demo.sdgnexus.in', 'Sunitha Rao', 'OFFICER', { districtId: nalgonda.id });
    await account('citizen@demo.sdgnexus.in', 'Lakshmi Reddy', 'CITIZEN');
    await account('faculty@demo.sdgnexus.in', 'Dr. Anil Varma', 'FACULTY', { heiId: uni.id });
    const student = await account('student@demo.sdgnexus.in', 'Kavya Nair', 'STUDENT', { heiId: uni.id });
    await prisma.studentProfile.create({ data: { userId: student.id, branch: 'Computer Science', year: 3, skills: ['GIS', 'Python', 'Field surveys'] } });
    await account('ngo@demo.sdgnexus.in', 'Ravi Teja', 'NGO', { organizationId: ngo.id });
    await account('csr@demo.sdgnexus.in', 'Meera Iyer', 'CSR', { organizationId: csr.id });
    console.log('✓ 7 demo accounts, 1 university, 1 NGO, 1 CSR partner');
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());

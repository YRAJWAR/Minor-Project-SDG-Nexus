// Seeds reference data (all states/UTs and districts, the 17 SDGs) and a believable pan-India demo:
// universities, NGOs, CSR partners, district officers, students, ~40 citizen problems at every stage,
// proposals, teams, milestones (hash-sealed, one deliberately tampered), credentials, NGO projects.
// Every person, university, NGO and company here is FICTIONAL. Safe to re-run: it wipes the tables first.
// Hashes use the same helpers as the app, so ledger and credential verification work on seeded data.
import { PrismaClient, type Role, type ChallengeStatus, type MilestoneStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeMilestoneHash } from '../src/lib/merkle';
import { computeCredentialHash, creditsForHours } from '../src/lib/credentials';
import { appendLedger, type LedgerEntry } from '../src/server/ledger';

const prisma = new PrismaClient();

// Shared by every demo account; also shown on the landing page.
const DEMO_PASSWORD = 'Demo@1234';
const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY);

// Deterministic randomness so every run produces the same story.
let rngState = 20261126;
const rand = () => {
    rngState = (rngState + 0x6d2b79f5) | 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const jitter = (v: number, by = 0.08) => Number((v + (rand() - 0.5) * by).toFixed(5));

const SDGS = [
    'No Poverty', 'Zero Hunger', 'Good Health and Well-being', 'Quality Education', 'Gender Equality',
    'Clean Water and Sanitation', 'Affordable and Clean Energy', 'Decent Work and Economic Growth',
    'Industry, Innovation and Infrastructure', 'Reduced Inequalities', 'Sustainable Cities and Communities',
    'Responsible Consumption and Production', 'Climate Action', 'Life Below Water', 'Life on Land',
    'Peace, Justice and Strong Institutions', 'Partnerships for the Goals',
];

// District centres used for map points (approximate).
const PLACES: Record<string, { state: string; lat: number; lng: number }> = {
    Nalgonda: { state: 'Telangana', lat: 17.05, lng: 79.27 },
    Khammam: { state: 'Telangana', lat: 17.25, lng: 80.15 },
    Warangal: { state: 'Telangana', lat: 17.97, lng: 79.59 },
    Hyderabad: { state: 'Telangana', lat: 17.39, lng: 78.49 },
    Pune: { state: 'Maharashtra', lat: 18.52, lng: 73.86 },
    Nashik: { state: 'Maharashtra', lat: 19.99, lng: 73.79 },
    Gadchiroli: { state: 'Maharashtra', lat: 20.18, lng: 80.0 },
    'Kamrup Metro': { state: 'Assam', lat: 26.14, lng: 91.74 },
    Dhubri: { state: 'Assam', lat: 26.02, lng: 89.98 },
    Koraput: { state: 'Odisha', lat: 18.81, lng: 82.71 },
    Khordha: { state: 'Odisha', lat: 20.18, lng: 85.62 },
    Barmer: { state: 'Rajasthan', lat: 25.75, lng: 71.39 },
    Jaipur: { state: 'Rajasthan', lat: 26.91, lng: 75.79 },
    Wayanad: { state: 'Kerala', lat: 11.69, lng: 76.13 },
    Ernakulam: { state: 'Kerala', lat: 9.98, lng: 76.28 },
    Varanasi: { state: 'Uttar Pradesh', lat: 25.32, lng: 82.97 },
    Bahraich: { state: 'Uttar Pradesh', lat: 27.57, lng: 81.6 },
    Gaya: { state: 'Bihar', lat: 24.79, lng: 85.0 },
    Jhabua: { state: 'Madhya Pradesh', lat: 22.77, lng: 74.59 },
    Ramanathapuram: { state: 'Tamil Nadu', lat: 9.37, lng: 78.83 },
    Chennai: { state: 'Tamil Nadu', lat: 13.08, lng: 80.27 },
    Chamoli: { state: 'Uttarakhand', lat: 30.4, lng: 79.32 },
    Dehradun: { state: 'Uttarakhand', lat: 30.32, lng: 78.03 },
    Kachchh: { state: 'Gujarat', lat: 23.73, lng: 69.86 },
};

const UNIVERSITIES = [
    { key: 'kvit', name: 'Krishna Valley Institute of Technology', district: 'Nalgonda', code: 'KVIT-DEMO-2026', naac: 'A', perf: 0.81, sdg: [4, 6, 7, 9], depts: ['Computer Science', 'Civil Engineering', 'Electrical Engineering'] },
    { key: 'scer', name: 'Sahyadri College of Engineering & Research', district: 'Pune', code: 'SCER-DEMO-2026', naac: 'A+', perf: 0.86, sdg: [6, 9, 11, 13], depts: ['Civil Engineering', 'Environmental Science', 'Computer Science'] },
    { key: 'bvu', name: 'Brahmaputra Valley University', district: 'Kamrup Metro', code: 'BVU-DEMO-2026', naac: 'B++', perf: 0.68, sdg: [3, 6, 13, 15], depts: ['Public Health', 'Geography', 'Civil Engineering'] },
    { key: 'urti', name: 'Utkal Rural Technology Institute', district: 'Khordha', code: 'URTI-DEMO-2026', naac: 'A', perf: 0.74, sdg: [2, 6, 7, 15], depts: ['Agricultural Engineering', 'Electrical Engineering'] },
    { key: 'tias', name: 'Thar Institute of Applied Sciences', district: 'Jaipur', code: 'TIAS-DEMO-2026', naac: 'A', perf: 0.77, sdg: [6, 7, 13], depts: ['Renewable Energy', 'Hydrology', 'Computer Science'] },
    { key: 'mist', name: 'Malabar Institute of Science & Technology', district: 'Ernakulam', code: 'MIST-DEMO-2026', naac: 'A+', perf: 0.84, sdg: [3, 4, 14], depts: ['Biomedical Engineering', 'Marine Science', 'Computer Science'] },
    { key: 'kpu', name: 'Kashi Polytechnic University', district: 'Varanasi', code: 'KPU-DEMO-2026', naac: 'B+', perf: 0.63, sdg: [1, 3, 4, 8], depts: ['Social Work', 'Electronics', 'Computer Science'] },
];

const FACULTY: Record<string, string> = {
    kvit: 'Dr. Anil Varma', scer: 'Dr. Smita Kulkarni', bvu: 'Dr. Pranjal Bora', urti: 'Dr. Sasmita Mohanty',
    tias: 'Dr. Vikram Rathore', mist: 'Dr. Anjali Menon', kpu: 'Dr. Alok Tiwari',
};
const STUDENTS: Record<string, string[]> = {
    kvit: ['Kavya Nair', 'Sai Charan Goud', 'Harika Reddy', 'Mohammed Faizan', 'Sneha Yadav', 'Bhanu Prakash'],
    scer: ['Aditya Deshpande', 'Rutuja Patil', 'Omkar Jadhav', 'Sana Shaikh', 'Pratik More'],
    bvu: ['Rituparna Das', 'Bikash Kalita', 'Ananya Baruah', 'Jyotishman Saikia'],
    urti: ['Subhashree Nayak', 'Ritesh Behera', 'Pooja Sahoo', 'Debasish Pradhan'],
    tias: ['Kunal Shekhawat', 'Priyanka Meena', 'Harsh Choudhary', 'Nikita Joshi'],
    mist: ['Aswin Thomas', 'Fathima Nasrin', 'Gokul Krishnan', 'Neha Pillai'],
    kpu: ['Shivam Mishra', 'Ayesha Khan', 'Rohit Pandey', 'Kajal Verma'],
};
const SKILLS = ['GIS', 'Python', 'Field surveys', 'IoT sensors', 'AutoCAD', 'Water testing', 'Data analysis', 'Solar PV design', 'Community outreach', 'React', 'Public health', 'Hydrology'];

const NGOS = [
    { name: 'Neer Sahayog Foundation', district: 'Nalgonda', sdg: [6, 3], demo: true },
    { name: 'Gramin Shiksha Abhiyan Trust', district: 'Gaya', sdg: [4, 5] },
    { name: 'Hariyali Van Sanrakshan Samiti', district: 'Chamoli', sdg: [15, 13] },
    { name: 'Swasthya Setu Collective', district: 'Jhabua', sdg: [3, 2] },
    { name: 'Sagar Tat Mitra', district: 'Ramanathapuram', sdg: [14, 1] },
    { name: 'Marusthal Jal Kendra', district: 'Barmer', sdg: [6, 2] },
    { name: 'Nari Udyam Network', district: 'Nashik', sdg: [5, 8] },
    { name: 'Surya Gram Urja Sangh', district: 'Koraput', sdg: [7, 1] },
    { name: 'Digital Saathi Foundation', district: 'Bahraich', sdg: [4, 9] },
    { name: 'Wayanad Tribal Health Mission', district: 'Wayanad', sdg: [3, 10] },
    { name: 'Brahmaputra Flood Relief Forum', district: 'Dhubri', sdg: [13, 11], pending: true },
    { name: 'Godavari Krishi Mitra', district: 'Khammam', sdg: [2, 12], pending: true },
];
// avgNetProfit: fictional average net profit of the last three financial years (₹); 2% of it is the CSR obligation.
const CSRS = [
    { name: 'Deccan Polymers Ltd', district: 'Hyderabad', demo: true, avgNetProfit: 15_00_00_000 },
    { name: 'Westcoast Infra Holdings', district: 'Pune', avgNetProfit: 48_00_00_000 },
    { name: 'Narmada Agro Industries', district: 'Kachchh', avgNetProfit: 9_50_00_000 },
    { name: 'Eastern Grid Power Co.', district: 'Khordha', avgNetProfit: 64_00_00_000 },
    { name: 'Sahyog FinServ Ltd', district: 'Chennai', avgNetProfit: 15_00_00_000 },
];
const OFFICERS: [string, string][] = [
    ['Nalgonda', 'Sunitha Rao'], ['Pune', 'Rahul Bhosale'], ['Barmer', 'Mahendra Singh Bhati'],
    ['Koraput', 'Itishree Panda'], ['Gaya', 'Ravi Ranjan Sinha'], ['Chamoli', 'Deepika Negi'],
];
const CITIZENS = ['Lakshmi Reddy', 'Venkatesh Naik', 'Shabana Begum', 'Ramesh Pawar', 'Geeta Devi', 'Sunil Oraon', 'Manjula Hegde', 'Abdul Rasheed', 'Kamala Bai', 'Prakash Mandal'];

// [title, description, district, category, SDGs, status, days ago, university key (for assigned+)]
type Seed = [string, string, string, string, number[], ChallengeStatus, number, string?];
const CHALLENGES: Seed[] = [
    // Nalgonda: the demo officer's district, one at every stage.
    ['High fluoride in Marriguda handpump water', 'Three handpumps used by about 400 families taste salty and children show brown teeth stains. A 2024 test by the panchayat found fluoride far above the safe limit. We need a low-cost filter or a safe source.', 'Nalgonda', 'Drinking Water & Sanitation', [6, 3], 'IN_PROGRESS', 64, 'kvit'],
    ['Solar pumps for Chandur farm tanks', 'Diesel pumps cost farmers in Chandur ₹900 a week. Power cuts make night irrigation unsafe. Looking for a shared solar pump design for small tanks.', 'Nalgonda', 'Clean Energy & Power', [7, 2], 'COMPLETED', 210, 'kvit'],
    ['No girls’ toilet at ZPHS Munugode', 'The high school has 180 girls and one broken toilet with no water line. Attendance drops during periods. Need a design and maintenance plan the school can afford.', 'Nalgonda', 'Drinking Water & Sanitation', [6, 5, 4], 'TEAM_FORMED', 30, 'kvit'],
    ['Broken culvert cuts off Kattangur hamlet in monsoon', 'Every July the culvert floods and the hamlet is cut off for 2–3 weeks; children miss school and patients cannot reach the PHC.', 'Nalgonda', 'Infrastructure & Connectivity', [9, 11], 'UNIVERSITY_ASSIGNED', 18, 'kvit'],
    ['Anganwadi children underweight in Devarakonda tanda', 'Growth charts show most children under 3 are underweight. Mothers say the take-home ration is often skipped. Need a simple tracking and nutrition plan.', 'Nalgonda', 'Rural Healthcare & Nutrition', [2, 3], 'VALIDATED', 9],
    ['Sewage overflow near Miryalaguda bus stand', 'Open drain overflows onto the road after any rain. Shops and a school are next to it.', 'Nalgonda', 'Drinking Water & Sanitation', [6, 11], 'AI_PROCESSED', 4],
    ['Street lights off on Nakrekal–Kattangur road', 'About 2 km of the road has had no working lights for 5 months. Two accidents this year.', 'Nalgonda', 'Infrastructure & Connectivity', [11, 7], 'SUBMITTED', 2],
    ['Women SHG needs market for millet snacks', 'Our self-help group of 14 women makes millet laddoos but sells only in the village. We need packaging, FSSAI help and a way to sell in towns.', 'Nalgonda', 'Women Empowerment & Livelihood', [5, 8], 'SUBMITTED', 1],
    ['Digital classroom unused at Chityal school', 'A smart TV and tablets were given 2 years ago but teachers were never trained and there is no content in Telugu.', 'Nalgonda', 'Education & Digital Literacy', [4], 'VALIDATED', 12],
    ['Krishna canal tail-end farms get no water', 'Farmers at the tail end of the minor canal receive water for only 3 of 10 planned days.', 'Nalgonda', 'Agriculture & Food Security', [2, 6], 'AI_PROCESSED', 6],

    // Rest of India.
    ['Tanker-dependent wadis in Purandar taluka', 'Five wadis depend on tankers from February to June. Old percolation tanks are silted.', 'Pune', 'Drinking Water & Sanitation', [6, 13], 'COMPLETED', 240, 'scer'],
    ['Plastic waste burning near Hadapsar canal', 'Mixed waste is dumped and burnt along the canal every evening; residents report breathing problems.', 'Pune', 'Forest & Environment', [11, 12, 3], 'IN_PROGRESS', 75, 'scer'],
    ['Tribal ashram school without science lab', 'Ashram school in Igatpuri has no lab equipment; class 10 science results are poor.', 'Nashik', 'Education & Digital Literacy', [4, 10], 'TEAM_FORMED', 26, 'scer'],
    ['Malaria cases rising in Bhamragad villages', 'Health workers report more fever cases each month; bed nets are old and torn.', 'Gadchiroli', 'Rural Healthcare & Nutrition', [3], 'VALIDATED', 15],
    ['Flood early warning for char villages', 'River islands get no warning before floods; families lose cattle and grain every year.', 'Dhubri', 'Infrastructure & Connectivity', [13, 11], 'IN_PROGRESS', 90, 'bvu'],
    ['Arsenic test kits for Dhubri handpumps', 'Villagers do not know which handpumps are safe; no testing done in 4 years.', 'Dhubri', 'Drinking Water & Sanitation', [6, 3], 'UNIVERSITY_ASSIGNED', 20, 'bvu'],
    ['Waterlogging in Guwahati Anil Nagar lanes', 'Lanes stay waterlogged 2–3 days after heavy rain; dengue cases rise every season.', 'Kamrup Metro', 'Infrastructure & Connectivity', [11, 3], 'AI_PROCESSED', 5],
    ['Millet processing unit for Koraput women', 'Women collect ragi but sell raw at low price; a small processing unit could double income.', 'Koraput', 'Women Empowerment & Livelihood', [5, 2, 8], 'COMPLETED', 200, 'urti'],
    ['Solar micro-grid for Lamtaput hamlets', 'Three hamlets still have no grid connection; children study by kerosene lamp.', 'Koraput', 'Clean Energy & Power', [7, 4], 'IN_PROGRESS', 80, 'urti'],
    ['Cyclone shelter in poor repair at Balipatna', 'The shelter roof leaks and the generator does not work; it housed 600 people in the last cyclone.', 'Khordha', 'Infrastructure & Connectivity', [13, 11], 'VALIDATED', 11],
    ['Taanka rainwater tanks cracked in Barmer dhanis', 'Most household taankas in two dhanis are cracked and lose stored rainwater.', 'Barmer', 'Drinking Water & Sanitation', [6, 13], 'COMPLETED', 260, 'tias'],
    ['Solar cold storage for Barmer vegetable growers', 'Farmers throw away tomatoes in peak season because there is no cold storage nearby.', 'Barmer', 'Agriculture & Food Security', [2, 7, 12], 'TEAM_FORMED', 35, 'tias'],
    ['Old city heritage lane drains blocked', 'Drains in the walled city lanes overflow during monsoon, damaging old homes.', 'Jaipur', 'Infrastructure & Connectivity', [11], 'SUBMITTED', 3],
    ['Sickle cell screening for Wayanad tribal hamlets', 'Many families have never been screened; several young deaths in the last two years.', 'Wayanad', 'Rural Healthcare & Nutrition', [3, 10], 'IN_PROGRESS', 70, 'mist'],
    ['Fishing boats lack weather alerts in Kochi', 'Small boat fishermen go out without reliable weather alerts in Malayalam.', 'Ernakulam', 'Infrastructure & Connectivity', [14, 13], 'UNIVERSITY_ASSIGNED', 22, 'mist'],
    ['Ghat-side waste in Varanasi', 'Flowers and plastic from rituals collect on the ghats; boatmen say the river edge is choking.', 'Varanasi', 'Forest & Environment', [6, 12, 14], 'IN_PROGRESS', 85, 'kpu'],
    ['Weavers losing income to power-loom copies', 'Handloom weavers in Lohta earn less each year; they need direct online sales.', 'Varanasi', 'Women Empowerment & Livelihood', [8, 1], 'VALIDATED', 14],
    ['No mobile signal at Bahraich forest villages', 'Villages near the sanctuary have no signal; ASHA workers cannot call ambulances.', 'Bahraich', 'Infrastructure & Connectivity', [9, 3], 'AI_PROCESSED', 7],
    ['Girls drop out after class 8 in Gaya villages', 'There is no secondary school within 6 km and no safe transport for girls.', 'Gaya', 'Education & Digital Literacy', [4, 5], 'VALIDATED', 16],
    ['Groundwater falling in Gaya paddy belt', 'Borewells now go below 300 ft; small farmers cannot afford deeper pumps.', 'Gaya', 'Agriculture & Food Security', [2, 6, 13], 'SUBMITTED', 2],
    ['Anaemia among adolescent girls in Jhabua', 'School screening found most girls anaemic; iron tablets are not taken regularly.', 'Jhabua', 'Rural Healthcare & Nutrition', [3, 5], 'TEAM_FORMED', 28, 'kpu'],
    ['Mangrove loss near Ramanathapuram coast', 'Fishers say crab catch has fallen since mangroves were cut for salt pans.', 'Ramanathapuram', 'Forest & Environment', [14, 15], 'UNIVERSITY_ASSIGNED', 19, 'mist'],
    ['Landslide-prone path to Chamoli school', 'The only path to the school slides every monsoon; children walk on loose rock.', 'Chamoli', 'Infrastructure & Connectivity', [11, 13, 4], 'VALIDATED', 10],
    ['Forest fires near Joshimath villages', 'Pine needle fires spread every summer; villagers have no early warning or fire lines.', 'Chamoli', 'Forest & Environment', [15, 13], 'AI_PROCESSED', 8],
    ['Salinity in Kachchh farm wells', 'Wells near the coast are turning saline; cotton yields are falling.', 'Kachchh', 'Agriculture & Food Security', [2, 6], 'SUBMITTED', 1],
    ['Warangal textile park effluent in tank', 'Coloured water reaches the village tank; cattle refuse to drink it.', 'Warangal', 'Drinking Water & Sanitation', [6, 12], 'VALIDATED', 13],
    ['Khammam tribal students lack hostel lighting', 'Girls’ hostel has 4 working bulbs for 120 students; study hours end at sunset.', 'Khammam', 'Clean Energy & Power', [7, 4, 5], 'SUBMITTED', 3],
];

// Milestone plan per project (4 steps), % of budget released at each.
const MILESTONE_PLAN = [
    ['Baseline survey & site study', 'Household survey, site photos and water/soil tests where relevant.', 0.2],
    ['Prototype and community review', 'Working prototype shown to the gram sabha; feedback recorded.', 0.3],
    ['Installation / roll-out', 'Installed at the agreed sites with local caretakers trained.', 0.3],
    ['Handover and 30-day impact check', 'Before/after numbers and a handover note signed by the panchayat.', 0.2],
] as const;

// A complete proposal plan in the shape the app validates (validatePlan in src/server/lifecycle.ts).
function planFor(facultyId: string, members: string[], budget: number, weeks: number) {
    const amounts = MILESTONE_PLAN.map(([, , share]) => Math.round(budget * share));
    amounts[amounts.length - 1] += budget - amounts.reduce((a, b) => a + b, 0); // rounding goes to the last tranche
    return {
        teamPlan: { facultyId, members: members.map((id, i) => ({ studentProfileId: id, role: i === 0 ? 'Team Lead' : 'Member' })) },
        milestonePlan: MILESTONE_PLAN.map(([title], i) => ({ title, week: Math.max(1, Math.round(((i + 1) * weeks) / 4)), amount: amounts[i] })),
        amounts,
    };
}

const STAGE: Record<ChallengeStatus, number> = {
    SUBMITTED: 0, AI_PROCESSED: 1, VALIDATED: 2, UNIVERSITY_ASSIGNED: 3, TEAM_FORMED: 4, IN_PROGRESS: 5, COMPLETED: 6, DEPLOYED: 7,
};

// NITI Aayog SDG India Index 2023-24, composite score per State/UT (official dashboard sdgindiaindex.niti.gov.in, released 12 Jul 2024).
// Real reference data, not demo data: used for the "area need" part of the priority and university scores.
const SDG_INDEX: Record<string, number> = {
    Kerala: 79, Uttarakhand: 79, 'Tamil Nadu': 78, Goa: 77, 'Himachal Pradesh': 77, Punjab: 76, Sikkim: 76, Karnataka: 75,
    'Andhra Pradesh': 74, Gujarat: 74, Telangana: 74, Maharashtra: 73, Haryana: 72, Manipur: 72, Mizoram: 72, Tripura: 71,
    'West Bengal': 70, Chhattisgarh: 67, 'Madhya Pradesh': 67, Rajasthan: 67, 'Uttar Pradesh': 67, Odisha: 66,
    'Arunachal Pradesh': 65, Assam: 65, Meghalaya: 63, Nagaland: 63, Jharkhand: 62, Bihar: 57,
    Chandigarh: 77, 'Jammu and Kashmir': 74, Puducherry: 74, 'Andaman and Nicobar Islands': 70, Delhi: 70,
    'Dadra and Nagar Haveli and Daman and Diu': 66, Lakshadweep: 66, Ladakh: 65,
};

async function main() {
    // Children before parents.
    await prisma.$transaction([
        prisma.fundingCommitment.deleteMany(), prisma.endorsement.deleteMany(), prisma.notification.deleteMany(), prisma.studentCredential.deleteMany(), prisma.milestone.deleteMany(),
        prisma.teamMember.deleteMany(), prisma.projectTeam.deleteMany(), prisma.challengeProposal.deleteMany(),
        prisma.challenge.deleteMany(), prisma.studentProfile.deleteMany(), prisma.auditLog.deleteMany(),
        prisma.riskFlag.deleteMany(), prisma.cSRAllocation.deleteMany(), prisma.impactScore.deleteMany(),
        prisma.projectActivity.deleteMany(), prisma.projectSDG.deleteMany(), prisma.project.deleteMany(),
        prisma.user.deleteMany(), prisma.organization.deleteMany(), prisma.hEI.deleteMany(),
        prisma.district.deleteMany(), prisma.state.deleteMany(), prisma.sDG.deleteMany(),
    ]);

    // ── Reference data ──────────────────────────────────────
    await prisma.sDG.createMany({ data: SDGS.map((name, i) => ({ id: i + 1, name })) });
    const regions: { states: { name: string; districts: string[] }[] } = JSON.parse(
        readFileSync(join(__dirname, 'data', 'india-regions.json'), 'utf8'),
    );
    for (const s of regions.states) {
        if (!(s.name in SDG_INDEX)) throw new Error(`No SDG India Index score for ${s.name}`);
        await prisma.state.create({
            data: { name: s.name, sdgIndex: SDG_INDEX[s.name], districts: { createMany: { data: [...new Set(s.districts)].map((name) => ({ name })) } } },
        });
    }
    for (const [name, p] of Object.entries(PLACES)) {
        const { count } = await prisma.district.updateMany({ where: { name, state: { name: p.state } }, data: { lat: p.lat, lng: p.lng } });
        if (count !== 1) throw new Error(`District "${name}, ${p.state}" is not in the regions dataset`);
    }
    console.log(`✓ ${regions.states.length} states/UTs, ${await prisma.district.count()} districts, 17 SDGs`);

    // ── Organisations ───────────────────────────────────────
    const unis: Record<string, { id: string; district: string }> = {};
    for (const [i, u] of UNIVERSITIES.entries()) {
        const p = PLACES[u.district];
        const hei = await prisma.hEI.create({
            data: {
                name: u.name, ugcId: `DEMO-HEI-${String(i + 1).padStart(3, '0')}`, state: p.state, district: u.district,
                lat: p.lat, lng: p.lng, inviteCode: u.code, naacGrade: u.naac, pastPerformanceScore: u.perf,
                departments: u.depts, sdgExpertise: u.sdg, isNewlyOnboarded: u.key === 'kpu',
            },
        });
        unis[u.key] = { id: hei.id, district: u.district };
    }
    const orgByName: Record<string, string> = {};
    for (const n of NGOS) {
        const o = await prisma.organization.create({
            data: {
                name: n.name, type: 'NGO', state: PLACES[n.district].state, district: n.district,
                verification_status: n.pending ? 'PENDING' : 'VERIFIED', created_at: ago(400 - Object.keys(orgByName).length * 20),
                registration_number: `DEMO-NGO-${Object.keys(orgByName).length + 101}`,
            },
        });
        orgByName[n.name] = o.id;
    }
    for (const c of CSRS) {
        const o = await prisma.organization.create({
            data: { name: c.name, type: 'CORPORATE', state: PLACES[c.district].state, district: c.district, verification_status: 'VERIFIED', avgNetProfit: c.avgNetProfit, created_at: ago(380) },
        });
        orgByName[c.name] = o.id;
    }

    // ── People ──────────────────────────────────────────────
    const password_hash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const slug = (s: string) => s.toLowerCase().replace(/^dr\.\s*/, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
    const account = (email: string, full_name: string, role: Role, link: { districtId?: number; heiId?: string; organizationId?: string } = {}) =>
        prisma.user.create({ data: { email, full_name, role, password_hash, created_at: ago(300), ...link } });

    const admin = await account('admin@demo.sdgnexus.in', 'Platform Admin', 'ADMIN');
    const officers: Record<string, string> = {};
    for (const [district, name] of OFFICERS) {
        const d = await prisma.district.findFirstOrThrow({ where: { name: district, state: { name: PLACES[district].state } } });
        const email = district === 'Nalgonda' ? 'officer.nalgonda@demo.sdgnexus.in' : `officer.${slug(district)}@demo.sdgnexus.in`;
        officers[district] = (await account(email, name, 'OFFICER', { districtId: d.id })).id;
    }
    const citizenIds: string[] = [];
    for (const [i, name] of CITIZENS.entries()) {
        citizenIds.push((await account(i === 0 ? 'citizen@demo.sdgnexus.in' : `${slug(name)}@demo.sdgnexus.in`, name, 'CITIZEN')).id);
    }
    const facultyIds: Record<string, string> = {};
    for (const u of UNIVERSITIES) {
        const email = u.key === 'kvit' ? 'faculty@demo.sdgnexus.in' : `${slug(FACULTY[u.key])}@demo.sdgnexus.in`;
        facultyIds[u.key] = (await account(email, FACULTY[u.key], 'FACULTY', { heiId: unis[u.key].id })).id;
    }
    const students: Record<string, { profileId: string; userId: string; name: string }[]> = {};
    for (const u of UNIVERSITIES) {
        students[u.key] = [];
        for (const [i, name] of STUDENTS[u.key].entries()) {
            const email = u.key === 'kvit' && i === 0 ? 'student@demo.sdgnexus.in' : `${slug(name)}@demo.sdgnexus.in`;
            const user = await account(email, name, 'STUDENT', { heiId: unis[u.key].id });
            const skills = [...new Set([pick(SKILLS), pick(SKILLS), pick(SKILLS)])];
            const sp = await prisma.studentProfile.create({
                data: { userId: user.id, branch: pick(UNIVERSITIES.find((x) => x.key === u.key)!.depts), year: 2 + (i % 3), skills, rating: Number((3.6 + rand() * 1.3).toFixed(1)) },
            });
            students[u.key].push({ profileId: sp.id, userId: user.id, name });
        }
    }
    const ngoUser = await account('ngo@demo.sdgnexus.in', 'Ravi Teja', 'NGO', { organizationId: orgByName['Neer Sahayog Foundation'] });
    const csrUser = await account('csr@demo.sdgnexus.in', 'Meera Iyer', 'CSR', { organizationId: orgByName['Deccan Polymers Ltd'] });
    for (const n of NGOS.filter((x) => !x.demo)) await account(`team@${slug(n.name).replace(/\./g, '')}.demo.sdgnexus.in`, `${n.name} coordinator`, 'NGO', { organizationId: orgByName[n.name] });
    for (const c of CSRS.filter((x) => !x.demo)) await account(`csr@${slug(c.name).replace(/\./g, '')}.demo.sdgnexus.in`, `${c.name} CSR lead`, 'CSR', { organizationId: orgByName[c.name] });
    console.log(`✓ ${await prisma.user.count()} users (7 universities, ${NGOS.length} NGOs, ${CSRS.length} CSR partners, ${OFFICERS.length} officers)`);

    // ── Challenges → proposals → teams → milestones → credentials ──
    let tampered = false;
    const ledger: LedgerEntry[] = []; // appended in time order at the end, so the hash chain is valid
    const URGENT = /fluoride|malaria|sickle|landslide|flood|arsenic|cyclone|anaemia|culvert/i;
    const csrIds = CSRS.map((c) => orgByName[c.name]);
    for (const [ci, [title, description, district, category, sdgTags, status, daysAgo, uniKey]] of CHALLENGES.entries()) {
        const place = PLACES[district];
        const anonymous = ci % 7 === 3;
        // Finished projects are resolved (citizen confirmed, officer closed) — except one, left COMPLETED and waiting
        // for the demo citizen's confirmation so the closing step can be shown live.
        const awaitingConfirmation = status === 'COMPLETED' && ci === 10;
        const submitter = ci === 0 || ci === 6 || awaitingConfirmation ? CITIZENS[0] : pick(CITIZENS);
        const created = ago(daysAgo);
        const resolved = status === 'COMPLETED' && !awaitingConfirmation;
        const completedAt = status === 'COMPLETED' ? ago(awaitingConfirmation ? 4 : Math.max(20, daysAgo - 140)) : null;
        const closure = resolved
            ? { status: 'DEPLOYED' as const, completedAt, confirmedAt: ago(Math.max(15, daysAgo - 145)), citizenRating: 3 + (ci % 3), verifiedBeneficiaries: 250 + ci * 37 }
            : { status, completedAt };
        const challenge = await prisma.challenge.create({
            data: {
                title, description, state: place.state, district, category, sdgTags, ...closure,
                gpsLat: jitter(place.lat), gpsLng: jitter(place.lng), photoUrls: [], videoUrls: [],
                aiConfidence: STAGE[status] >= 1 ? Number((0.72 + rand() * 0.25).toFixed(2)) : null,
                submittedBy: anonymous ? 'Anonymous Citizen' : submitter, submitterType: 'CITIZEN', isAnonymous: anonymous,
                submitterId: citizenIds[CITIZENS.indexOf(submitter)],
                urgency: URGENT.test(title) ? (ci % 2 ? 'CRITICAL' : 'HIGH') : ci % 3 ? 'MODERATE' : 'NORMAL',
                gpVerified: STAGE[status] >= 2, submittedVia: ci % 4 === 0 ? 'mobile' : 'web',
                createdAt: created, updatedAt: ago(Math.max(0, daysAgo - 3)),
            },
        });
        const submitterId = citizenIds[CITIZENS.indexOf(submitter)];
        ledger.push({ actor_id: submitterId, actor_role: 'CITIZEN', action: 'CHALLENGE_SUBMITTED', entity_type: 'Challenge', entity_id: challenge.id, new_value: { status: 'AI_PROCESSED', district, state: place.state }, at: created });
        if (STAGE[status] >= 2) {
            ledger.push({ actor_id: officers[district] ?? admin.id, actor_role: officers[district] ? 'OFFICER' : 'ADMIN', action: 'CHALLENGE_VERIFY', entity_type: 'Challenge', entity_id: challenge.id, previous_value: { status: 'AI_PROCESSED' }, new_value: { status: 'VALIDATED' }, at: ago(daysAgo - 2) });
        }
        if (STAGE[status] >= 3 && uniKey) {
            ledger.push({ actor_id: officers[district] ?? admin.id, actor_role: officers[district] ? 'OFFICER' : 'ADMIN', action: 'CHALLENGE_ASSIGN', entity_type: 'Challenge', entity_id: challenge.id, previous_value: { status: 'VALIDATED' }, new_value: { status: 'UNIVERSITY_ASSIGNED', heiId: unis[uniKey].id }, at: ago(daysAgo - 5) });
        }
        // Other citizens saying "this affects me too".
        if (STAGE[status] < 6) {
            const endorsers = citizenIds.filter((id) => id !== submitterId).slice(0, Math.floor(rand() * 7));
            if (endorsers.length) await prisma.endorsement.createMany({ data: endorsers.map((userId) => ({ challengeId: challenge.id, userId })) });
        }
        // A proposal waiting for the officer on some validated challenges.
        if (status === 'VALIDATED' && ci % 2 === 0) {
            const near = UNIVERSITIES.find((u) => PLACES[u.district].state === place.state) ?? UNIVERSITIES[ci % UNIVERSITIES.length];
            const bidders = district === 'Nalgonda' ? [near, UNIVERSITIES.find((u) => u.key === 'scer')!] : [near];
            for (const [bi, uni] of bidders.entries()) {
                const budget = 300000 + Math.round(rand() * 6) * 50000;
                const weeks = 10 + bi * 4;
                const pool = students[uni.key];
                const plan = planFor(facultyIds[uni.key], [pool[(ci + 3) % pool.length].profileId, pool[(ci + 4) % pool.length].profileId, pool[(ci + 5) % pool.length].profileId], budget, weeks);
                await prisma.challengeProposal.create({
                    data: {
                        challengeId: challenge.id, heiId: unis[uni.key].id, status: 'SUBMITTED', timelineWeeks: weeks,
                        approach: bi === 0
                            ? `Field survey with the panchayat, then a low-cost pilot designed by ${uni.depts[0]} students, reviewed by the community before roll-out. Local caretakers are trained so it keeps working after handover.`
                            : `A larger study across nearby villages first, then a design that can be replicated district-wide, built by ${uni.depts.slice(0, 2).join(' and ')} students with a remote monitoring dashboard.`,
                        budgetRequested: budget, fundingSource: 'CSR', ipDeclaration: 'Open design; the community and district may reuse it freely.',
                        aiQualityScore: Number((0.65 + rand() * 0.25).toFixed(2)), createdAt: ago(daysAgo - 4 + bi),
                        teamPlan: plan.teamPlan, milestonePlan: plan.milestonePlan,
                    },
                });
            }
        }
        if (!uniKey) continue;

        const uni = UNIVERSITIES.find((u) => u.key === uniKey)!;
        const budget = 400000 + Math.round(rand() * 10) * 50000;
        // A verified NGO in the same state joins as field partner (it confirms milestones and rates the students).
        const partner = NGOS.find((n) => !n.pending && PLACES[n.district].state === place.state);
        const proposal = await prisma.challengeProposal.create({
            data: {
                challengeId: challenge.id, heiId: unis[uniKey].id, status: 'ACCEPTED', timelineWeeks: 12 + (ci % 3) * 2,
                ngoPartnerId: partner ? orgByName[partner.name] : null,
                approach: `Baseline survey, then a prototype built with ${uni.depts.slice(0, 2).join(' and ')} students, installed with local caretakers and checked 30 days after handover.`,
                budgetRequested: budget, fundingSource: 'CSR', ipDeclaration: 'Open design; the community and district may reuse it freely.',
                aiQualityScore: Number((0.74 + rand() * 0.22).toFixed(2)), createdAt: ago(daysAgo - 5),
            },
        });
        if (STAGE[status] < 4) continue;

        const pool = students[uniKey];
        const isHero = ci === 0 || ci === 1; // the demo student is on both Nalgonda projects
        const members = isHero ? [pool[0], pool[1], pool[2]] : [pool[ci % pool.length], pool[(ci + 1) % pool.length], pool[(ci + 2) % pool.length]];
        const team = await prisma.projectTeam.create({
            data: {
                proposalId: proposal.id, heiId: unis[uniKey].id, facultyName: FACULTY[uniKey],
                facultyEmail: uniKey === 'kvit' ? 'faculty@demo.sdgnexus.in' : `${slug(FACULTY[uniKey])}@demo.sdgnexus.in`,
                members: { create: [...new Map(members.map((m) => [m.profileId, m])).values()].map((m, i) => ({ studentProfileId: m.profileId, role: i === 0 ? 'Team Lead' : pick(['Field Lead', 'Design', 'Data & Reporting']) })) },
            },
        });
        const agreed = planFor(facultyIds[uniKey], [...new Map(members.map((m) => [m.profileId, m])).keys()], budget, proposal.timelineWeeks);
        await prisma.challengeProposal.update({ where: { id: proposal.id }, data: { teamPlan: agreed.teamPlan, milestonePlan: agreed.milestonePlan } });
        // Who funds it: Deccan Polymers in Telangana (the demo CSR), otherwise another partner.
        const funderId = place.state === 'Telangana' ? orgByName['Deccan Polymers Ltd'] : csrIds[1 + (ci % (csrIds.length - 1))];
        if (STAGE[status] === 4) {
            // Plan selected, waiting for money: milestones planned, 40% committed by another partner, the rest open.
            for (const [mi, [mTitle, mDesc]] of MILESTONE_PLAN.entries()) {
                await prisma.milestone.create({ data: { teamId: team.id, title: mTitle, description: mDesc, status: 'PENDING', proofUrls: [], amount: agreed.amounts[mi], dueDate: new Date(NOW + agreed.milestonePlan[mi].week * 7 * DAY) } });
            }
            await prisma.fundingCommitment.create({ data: { challengeId: challenge.id, csrOrgId: orgByName['Westcoast Infra Holdings'], amount: Math.round(budget * 0.4), createdAt: ago(daysAgo - 8) } });
            continue;
        }
        await prisma.fundingCommitment.create({ data: { challengeId: challenge.id, csrOrgId: funderId, amount: budget, released: 0, createdAt: ago(daysAgo - 8) } });

        // How far each project has got: completed = all released; in progress varies.
        const plan: MilestoneStatus[] =
            STAGE[status] >= 6 ? ['CSR_APPROVED', 'CSR_APPROVED', 'CSR_APPROVED', 'CSR_APPROVED']
                : ci === 0 ? ['CSR_APPROVED', 'GP_VERIFIED', 'SUBMITTED', 'PENDING'] // hero: something waiting for CSR and for the officer
                    : pick([['CSR_APPROVED', 'SUBMITTED', 'PENDING', 'PENDING'], ['CSR_APPROVED', 'CSR_APPROVED', 'GP_VERIFIED', 'PENDING'], ['GP_VERIFIED', 'PENDING', 'PENDING', 'PENDING']] as MilestoneStatus[][]);
        const span = daysAgo - 10;
        const logged = new Map<string, number>(); // hours per student on this project, for the credentials below
        for (const [mi, [mTitle, mDesc, share]] of MILESTONE_PLAN.entries()) {
            const st = plan[mi];
            const createdAt = ago(daysAgo - 10 - Math.round((span * (mi + 1)) / 5));
            const lat = jitter(place.lat, 0.04);
            const lng = jitter(place.lng, 0.04);
            const sealed = st !== 'PENDING';
            let hashValue = sealed ? computeMilestoneHash('', createdAt, lat, lng) : null;
            // One deliberately altered record so the ledger's tamper check has something to catch.
            if (sealed && !tampered && status === 'COMPLETED' && ci !== 1 && mi === 2) {
                hashValue = createHash('sha256').update('edited after sealing').digest('hex');
                tampered = true;
            }
            const attested = partner && (st === 'GP_VERIFIED' || st === 'CSR_APPROVED');
            await prisma.milestone.create({
                data: {
                    teamId: team.id, title: mTitle, description: mDesc, status: st, proofUrls: [],
                    ngoAttestedAt: attested ? new Date(createdAt.getTime() + 2 * DAY) : null,
                    ngoAttestation: attested ? pick(['Visited the site with the panchayat secretary; the work is in place and in use.', 'Checked on the ground with two villagers; matches the photos submitted.', 'Our field worker saw the installation working during the weekly visit.']) : null,
                    dueDate: new Date(NOW - (daysAgo - 10) * DAY + ((mi + 1) * (proposal.timelineWeeks * 7 * DAY)) / 4),
                    hashValue, gpsLat: sealed ? lat : null, gpsLng: sealed ? lng : null, createdAt,
                    verifierCode: st === 'GP_VERIFIED' || st === 'CSR_APPROVED' ? `GP-${district.slice(0, 3).toUpperCase()}-${100 + ci * 4 + mi}` : null,
                    fundReleased: st === 'CSR_APPROVED' ? agreed.amounts[mi] : null,
                    releasedAt: st === 'CSR_APPROVED' ? new Date(createdAt.getTime() + 4 * DAY) : null,
                    releasedByOrgId: st === 'CSR_APPROVED' ? funderId : null,
                    amount: agreed.amounts[mi],
                },
            });
        }

        // Hours each student logged per sealed milestone.
        for (const ms of await prisma.milestone.findMany({ where: { teamId: team.id, status: { not: 'PENDING' } }, select: { id: true } })) {
            const rows = [...new Set(members.map((m) => m.profileId))].map((id) => ({ milestoneId: ms.id, studentProfileId: id, hours: 15 + Math.round(rand() * 6) * 5 }));
            await prisma.milestoneHours.createMany({ data: rows });
            for (const row of rows) logged.set(row.studentProfileId, (logged.get(row.studentProfileId) ?? 0) + row.hours);
        }
        if (partner && resolved) await prisma.teamMember.updateMany({ where: { teamId: team.id }, data: { ngoRating: 4 + (ci % 2) } });

        const released = (await prisma.milestone.aggregate({ where: { teamId: team.id, status: 'CSR_APPROVED' }, _sum: { fundReleased: true } }))._sum.fundReleased ?? 0;
        await prisma.fundingCommitment.update({ where: { challengeId_csrOrgId: { challengeId: challenge.id, csrOrgId: funderId } }, data: { released } });

        if (status === 'COMPLETED') {
            const officerId = officers[district] ?? admin.id, officerRole = officers[district] ? 'OFFICER' : 'ADMIN';
            ledger.push({ actor_id: csrUser.id, actor_role: 'CSR', action: 'CHALLENGE_COMPLETE', entity_type: 'Challenge', entity_id: challenge.id, previous_value: { status: 'IN_PROGRESS' }, new_value: { status: 'COMPLETED' }, at: completedAt! });
            if (resolved) {
                ledger.push({ actor_id: submitterId, actor_role: 'CITIZEN', action: 'CHALLENGE_CONFIRM', entity_type: 'Challenge', entity_id: challenge.id, previous_value: { status: 'COMPLETED' }, new_value: { citizenRating: closure.citizenRating }, at: closure.confirmedAt! });
                ledger.push({ actor_id: officerId, actor_role: officerRole, action: 'CHALLENGE_CLOSE', entity_type: 'Challenge', entity_id: challenge.id, previous_value: { status: 'COMPLETED' }, new_value: { status: 'DEPLOYED', verifiedBeneficiaries: closure.verifiedBeneficiaries }, at: new Date(closure.confirmedAt!.getTime() + DAY) });
            }
        }

        if (resolved) {
            const issuedAt = ago(Math.max(5, daysAgo - 150));
            for (const m of new Map(members.map((x) => [x.profileId, x])).values()) {
                const hours = logged.get(m.profileId) ?? 0; // = the verified hours logged on the milestones
                const creditPoints = creditsForHours(hours);
                await prisma.studentCredential.create({
                    data: {
                        studentProfileId: m.profileId, challengeId: challenge.id, challengeTitle: title, challengeDistrict: district, sdgTags,
                        hoursContributed: hours, creditPoints, issuedAt,
                        hashValue: computeCredentialHash(m.profileId, challenge.id, creditPoints, issuedAt),
                    },
                });
                await prisma.studentProfile.update({ where: { id: m.profileId }, data: { credits: { increment: creditPoints } } });
            }
        }
    }
    // One rejected and one merged report in Nalgonda, so the officer's history shows both outcomes.
    const streetLights = await prisma.challenge.findFirstOrThrow({ where: { title: { startsWith: 'Street lights off' } } });
    const extra = [
        { title: 'Neighbour built wall on my land in Chandur', description: 'My neighbour has built a compound wall two feet into my plot. I want the government to remove it.', status: 'REJECTED' as const, rejectReason: 'This is a private land dispute, not a public problem. Please approach the Tahsildar office or the civil court.', mergedIntoId: null, category: 'Infrastructure & Connectivity', sdg: [16], days: 20 },
        { title: 'Dark stretch on Kattangur road, no lights', description: 'Street lights on the road from Nakrekal to Kattangur have not worked for months; walking at night is unsafe.', status: 'MERGED' as const, rejectReason: null, mergedIntoId: streetLights.id, category: 'Infrastructure & Connectivity', sdg: [11, 7], days: 1 },
    ];
    for (const [i, x] of extra.entries()) {
        const submitterId = citizenIds[3 + i];
        const c = await prisma.challenge.create({
            data: {
                title: x.title, description: x.description, state: 'Telangana', district: 'Nalgonda', category: x.category, sdgTags: x.sdg, status: x.status,
                gpsLat: jitter(PLACES.Nalgonda.lat), gpsLng: jitter(PLACES.Nalgonda.lng), photoUrls: [], videoUrls: [], aiConfidence: 0.8,
                submittedBy: CITIZENS[3 + i], submitterId, submitterType: 'CITIZEN', rejectReason: x.rejectReason, mergedIntoId: x.mergedIntoId,
                createdAt: ago(x.days), updatedAt: ago(Math.max(0, x.days - 1)),
            },
        });
        ledger.push({ actor_id: submitterId, actor_role: 'CITIZEN', action: 'CHALLENGE_SUBMITTED', entity_type: 'Challenge', entity_id: c.id, new_value: { status: 'AI_PROCESSED', district: 'Nalgonda', state: 'Telangana' }, at: ago(x.days) });
        ledger.push({ actor_id: officers.Nalgonda, actor_role: 'OFFICER', action: x.status === 'REJECTED' ? 'CHALLENGE_REJECT' : 'CHALLENGE_MERGE', entity_type: 'Challenge', entity_id: c.id, previous_value: { status: 'AI_PROCESSED' }, new_value: { status: x.status, rejectReason: x.rejectReason, mergedIntoId: x.mergedIntoId }, at: ago(Math.max(0, x.days - 0.5)) });
        if (x.status === 'MERGED') await prisma.endorsement.upsert({ where: { challengeId_userId: { challengeId: streetLights.id, userId: submitterId } }, create: { challengeId: streetLights.id, userId: submitterId }, update: {} });
    }
    ledger.sort((a, b) => a.at!.getTime() - b.at!.getTime());
    for (const e of ledger) await appendLedger(e, prisma);

    console.log(`✓ ${CHALLENGES.length + extra.length} challenges, ${await prisma.endorsement.count()} endorsements, ${ledger.length} ledger entries, ${await prisma.challengeProposal.count()} proposals, ${await prisma.projectTeam.count()} teams, ${await prisma.milestone.count()} milestones, ${await prisma.studentCredential.count()} credentials`);

    // ── NGO projects, field activity, impact scores, CSR funding ──
    const PROJECT_IDEAS: Record<number, string[]> = {
        1: ['Village savings groups', 'Livelihood kits for landless families'],
        2: ['Kitchen gardens for anganwadis', 'Millet seed bank'],
        3: ['Mobile health camps', 'Anaemia screening drive'],
        4: ['Evening learning centres', 'Digital literacy for school girls'],
        5: ['Women’s legal aid desk', 'Menstrual hygiene in schools'],
        6: ['Handpump repair and testing', 'Rainwater harvesting for schools'],
        7: ['Solar lights for hostels', 'Clean cookstove distribution'],
        8: ['Skill training for rural youth', 'Artisan e-commerce onboarding'],
        9: ['Community internet kiosks', 'Repair skills for youth'],
        10: ['Tribal health worker training', 'Disability inclusion survey'],
        11: ['Ward waste segregation', 'Safe street audits'],
        12: ['Farm waste composting', 'Plastic-free markets'],
        13: ['Flood-safe grain storage', 'Heat action plans for villages'],
        14: ['Mangrove replanting', 'Fisher safety training'],
        15: ['Fire lines and village fire crews', 'Native tree nurseries'],
    };
    let projectCount = 0;
    for (const [ni, n] of NGOS.entries()) {
        const orgId = orgByName[n.name];
        const place = PLACES[n.district];
        const projects = [];
        for (const [pi, sdg] of n.sdg.entries()) {
            for (const [ii, idea] of (PROJECT_IDEAS[sdg] ?? []).slice(0, pi === 0 ? 2 : 1).entries()) {
                const budget = (8 + Math.round(rand() * 30)) * 100000;
                const status = n.pending ? 'DRAFT' : ii === 1 && pi === 0 ? 'COMPLETED' : rand() < 0.15 ? 'DRAFT' : 'ACTIVE';
                const utilized = status === 'COMPLETED' ? budget * (0.88 + rand() * 0.1) : status === 'ACTIVE' ? budget * (0.25 + rand() * 0.5) : 0;
                const beneficiaries = status === 'DRAFT' ? 0 : 300 + Math.round(rand() * 40) * 100;
                const project = await prisma.project.create({
                    data: {
                        organization_id: orgId, title: `${idea} — ${n.district}`,
                        description: `${idea} run by ${n.name} with the panchayats of ${n.district} district, ${place.state}.`,
                        budget_allocated: budget, budget_utilized: Math.round(utilized), beneficiaries_count: beneficiaries,
                        outcome_metric_value: status === 'DRAFT' ? null : Math.round(35 + rand() * 50),
                        latitude: jitter(place.lat), longitude: jitter(place.lng), status, created_at: ago(330 - ni * 15 - pi * 10),
                        sdg_tags: { create: [...new Set([sdg, ...n.sdg])].map((s, k) => ({ sdg_id: s, ai_confidence_score: k === 0 ? 0.92 : 0.71 })) },
                    },
                });
                projects.push(project);
                projectCount++;
                if (status !== 'DRAFT') {
                    for (let a = 0; a < 3 + Math.floor(rand() * 3); a++) {
                        const at = ago(300 - ni * 15 - a * 25);
                        const lat = jitter(place.lat, 0.05);
                        const lng = jitter(place.lng, 0.05);
                        const activity_title = pick(['Field visit', 'Community meeting', 'Distribution drive', 'Training session', 'Monitoring visit']);
                        const description = `${activity_title} for ${idea.toLowerCase()} in ${n.district}.`;
                        await prisma.projectActivity.create({
                            data: {
                                project_id: project.id, activity_title, description, latitude: lat, longitude: lng, created_at: at,
                                hash_value: createHash('sha256').update(`${description}|${at.toISOString()}|${lat},${lng}|${project.id}`).digest('hex'),
                            },
                        });
                    }
                }
                if (status !== 'DRAFT' && rand() < 0.7) {
                    const committed = Math.round(budget * (0.4 + rand() * 0.5));
                    await prisma.cSRAllocation.create({
                        data: {
                            corporate_org_id: n.demo ? orgByName['Deccan Polymers Ltd'] : pick(csrIds), project_id: project.id,
                            amount_committed: committed, amount_disbursed: Math.round(committed * (status === 'COMPLETED' ? 1 : 0.3 + rand() * 0.5)),
                            financial_year: rand() < 0.5 ? '2025-26' : '2026-27',
                        },
                    });
                }
            }
        }
        if (n.pending) continue;
        // Impact score from the organisation's own numbers (same five parts the app shows).
        const live = projects.filter((p) => p.status !== 'DRAFT');
        const ben = live.reduce((s, p) => s + p.beneficiaries_count, 0);
        const bud = live.reduce((s, p) => s + p.budget_allocated, 0);
        const used = live.reduce((s, p) => s + p.budget_utilized, 0);
        const outcome = live.reduce((s, p) => s + (p.outcome_metric_value ?? 0), 0) / Math.max(1, live.length);
        const scale = Math.min(100, (Math.log10(ben + 1) / 4.5) * 100);
        const efficiency = Math.min(100, (ben / Math.max(1, bud / 100000)) * 4);
        const geo = 55 + rand() * 40;
        const transparency = Math.min(100, 50 + live.length * 12 + (used / Math.max(1, bud)) * 20);
        const final = (scale * 0.25 + outcome * 0.25 + efficiency * 0.2 + geo * 0.15 + transparency * 0.15) * 10;
        await prisma.impactScore.create({
            data: {
                organization_id: orgId, scale_score: scale, outcome_score: outcome, efficiency_score: efficiency, geographic_need_score: geo,
                transparency_score: transparency, final_score: Math.round(final), raw_scale_value: ben, raw_efficiency_value: used, raw_outcome_value: outcome,
            },
        });
        if (ni === 4 || ni === 7) {
            await prisma.riskFlag.create({
                data: {
                    organization_id: orgId, risk_type: ni === 4 ? 'UTILISATION_LAG' : 'MISSING_PROOF', risk_level: ni === 4 ? 'MEDIUM' : 'HIGH',
                    description: ni === 4 ? 'Less than 40% of committed CSR funds used after 9 months.' : 'Two recent field activities have no photo proof attached.',
                },
            });
        }
    }
    console.log(`✓ ${projectCount} NGO projects, ${await prisma.projectActivity.count()} field activities, ${await prisma.cSRAllocation.count()} CSR allocations`);

    // ── Notifications for the demo accounts ──
    const hero = await prisma.challenge.findFirstOrThrow({ where: { title: CHALLENGES[0][0] } });
    const notes: [string, string, string, string?][] = [
        [officers.Nalgonda, 'New problem reported in Nalgonda: “Street lights off on Nakrekal–Kattangur road”.', 'P1'],
        [officers.Nalgonda, 'Milestone “Installation / roll-out” submitted for the Marriguda fluoride project — needs your verification.', 'P1', hero.id],
        [officers.Nalgonda, 'A university proposal is waiting for review on “Anganwadi children underweight in Devarakonda tanda”.', 'P2'],
        [facultyIds.kvit, 'Your proposal for “Broken culvert cuts off Kattangur hamlet” was accepted by the district officer.', 'P2'],
        [facultyIds.kvit, 'Milestone “Prototype and community review” was verified by the Nalgonda district officer.', 'P2', hero.id],
        [students.kvit[0].userId, 'You earned a credential for “Solar pumps for Chandur farm tanks”.', 'P2'],
        [students.kvit[0].userId, 'Milestone “Prototype and community review” was verified. Next: installation.', 'P3', hero.id],
        [csrUser.id, 'Milestone “Prototype and community review” (Marriguda fluoride project) is verified and ready for fund release.', 'P1', hero.id],
        [ngoUser.id, 'Your impact score was recalculated from your latest field activity.', 'P3'],
        [citizenIds[0], 'Your report “High fluoride in Marriguda handpump water” is now in progress with Krishna Valley Institute of Technology.', 'P2', hero.id],
        [citizenIds[0], 'Your report “Street lights off on Nakrekal–Kattangur road” was received by the district office.', 'P3'],
        [citizenIds[0], 'The university says “Tanker-dependent wadis in Purandar taluka” is fixed. Please confirm or dispute it.', 'P1', (await prisma.challenge.findFirstOrThrow({ where: { status: 'COMPLETED' } })).id],
        [admin.id, '2 organisations are waiting for verification.', 'P2'],
    ];
    for (const [i, [userId, message, priority, challengeId]] of notes.entries()) {
        await prisma.notification.create({
            data: { userId, message, priority, entityType: challengeId ? 'Challenge' : 'System', entityId: challengeId ?? 'system', challengeId: challengeId ?? null, read: i % 4 === 3, createdAt: ago(i * 0.7) },
        });
    }
    console.log(`✓ ${notes.length} notifications; demo accounts: see README`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());

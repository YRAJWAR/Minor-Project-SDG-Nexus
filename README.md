# SDG Nexus — SIH 2026
### Problem Statement SIH26043 | Government of Jharkhand | Smart Education Theme

**SDG Nexus** is a multi-stakeholder collaborative innovation platform connecting 
communities, universities, industry (CSR), NGOs, and government around Jharkhand's 
documented societal challenges.

## Live Demo
🌐 **https://sdg-nexus-sih2026.vercel.app**

## Demo Accounts (Password for all: `Demo@1234`)
| Role | Email |
|------|-------|
| Citizen | citizen@jharkhand.gov.in |
| Government | collector@jharkhand.gov.in |
| University/HEI | faculty@nitjsr.ac.in |
| CSR Company | csr@tatasteel.com |
| NGO | admin@pradan.net |
| Student | student@nitjsr.ac.in |

## Tech Stack
- **Frontend/Backend**: Next.js 16.1.6 (App Router + Turbopack)
- **Language**: TypeScript 5.9
- **Database**: PostgreSQL via Prisma ORM 7.4
- **Styling**: Tailwind CSS 4.2
- **Maps**: Leaflet + React-Leaflet
- **Auth**: JWT + bcryptjs
- **AI**: OpenAI GPT API with keyword fallback
- **Reports**: jsPDF

## Local Setup
Needs Node 20+ and PostgreSQL 16.
```bash
git clone https://github.com/YRAJWAR/Minor-Project-SDG-Nexus.git
cd Minor-Project-SDG-Nexus
npm install
cp .env.example .env         # set DATABASE_URL and a JWT_SECRET of 32+ characters
npx prisma migrate deploy    # creates the tables
npx prisma db seed           # all states/districts, SDGs, demo accounts
npm run check                # integrity + access-rule tests
npm run dev
```

### Demo data
`npx prisma db seed` builds a fictional, pan-India demo: 7 universities, 12 NGOs, 5 CSR partners, 6 district officers,
33 students, 37 citizen problems at every stage, 14 university project teams with hash-sealed milestones (one deliberately
tampered so the ledger check has something to catch), 12 credentials, 36 NGO projects with field activity and CSR funding.
Re-run it any time to reset the demo.

### Demo accounts
All are fictional and share the password set in `prisma/seed.ts` (`DEMO_PASSWORD`). The login page has one-click buttons.

| Role | Email |
|---|---|
| Admin | admin@demo.sdgnexus.in |
| District officer (Nalgonda, Telangana) | officer.nalgonda@demo.sdgnexus.in |
| Citizen | citizen@demo.sdgnexus.in |
| Faculty | faculty@demo.sdgnexus.in |
| Student | student@demo.sdgnexus.in |
| NGO | ngo@demo.sdgnexus.in |
| CSR partner | csr@demo.sdgnexus.in |

New faculty and students join the demo university with invite code `KVIT-DEMO-2026`.

District list: [KTBsomen/Indian-state-district-json](https://github.com/KTBsomen/Indian-state-district-json) (MIT, from igod.gov.in), 36 states/UTs, 784 districts.

### Five-minute demo
1. **Citizen** — report a problem: pick state → district, describe it; it is tagged with SDGs and checked for duplicates.
2. **District officer (Nalgonda)** — see the India map and the district's queue at every stage; click a district for its numbers; verify the submitted Marriguda milestone.
3. **Faculty** — inbox of matched problems with match scores, proposals, teams, milestones.
4. **CSR partner** — real portfolio numbers; release funds for verified milestones; NGO recommendations.
5. **Student** — their projects, milestone board and verifiable credentials.
6. **Ledger** — open a project ledger and verify hashes; one record is tampered and shows as failing.


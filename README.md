# SDG Nexus

**Local problems, verified solutions — district by district.** A pan-India platform where citizens report what is
broken where they live, district officers verify it, universities propose a plan (student team + milestones + budget),
CSR partners fund it, and money is released milestone by milestone only after the officer verifies each one. The
citizen confirms the fix, students earn verifiable credentials, and every step is written to a hash-chained ledger.

B.Tech minor project, Dev Bhoomi Uttarakhand University, 2026.

## How a report moves
1. **Reported** — a citizen (or NGO) picks state → district, describes the problem; it is tagged with SDGs and checked for duplicates.
2. **Verified** — the district officer confirms the SDGs and verifies, rejects (with a reason) or merges it.
3. **Plan chosen** — universities submit plans (2–8 students, 2–6 milestones that add up to the budget); the officer picks one.
4. **Funded** — CSR partners commit money until the budget is covered.
5. **In the field** — the team submits proof per milestone; the officer verifies; the funder releases exactly that tranche.
6. **Fixed** — when every tranche is paid, the reporting citizen confirms (rates 1–5) or disputes it.
7. **Resolved** — the officer closes it with the verified number of people helped; students get credentials.

All rules live in one place, `src/server/lifecycle.ts`; every action is appended to the ledger (`src/server/ledger.ts`).

## Run it locally
Needs Node 20+ and PostgreSQL 16+.
```bash
npm install
cp .env.example .env         # set DATABASE_URL and a JWT_SECRET of 32+ characters
npx prisma migrate deploy    # create the tables
npx prisma db seed           # pan-India regions, SDGs and the fictional demo story (re-run to reset)
npm run check                # unit tests: integrity, access rules, lifecycle, scores
npm run dev                  # http://localhost:3000
npm run smoke                # (with the app running) drives one report through the whole story via the API
```

## Demo accounts
Every person and organisation in the demo is fictional. Password for all: `Demo@1234` (set in `prisma/seed.ts`).
The sign-in page has one-click buttons.

| Role | Email |
|---|---|
| Citizen | citizen@demo.sdgnexus.in |
| District officer (Nalgonda, Telangana) | officer.nalgonda@demo.sdgnexus.in |
| Faculty (Krishna Valley Institute of Technology) | faculty@demo.sdgnexus.in |
| Student | student@demo.sdgnexus.in |
| NGO | ngo@demo.sdgnexus.in |
| CSR partner | csr@demo.sdgnexus.in |
| Admin (all districts) | admin@demo.sdgnexus.in |

New faculty and students join the demo university with invite code `KVIT-DEMO-2026`.

### Five-minute demo
1. **Landing page** — the India sheet: live reports per district, the route with counts per stage, the latest ledger hashes.
2. **Citizen** — report a problem (state → district); open *Tanker-dependent wadis in Purandar taluka* from the notification and confirm the fix.
3. **District officer** — Work queue: verify (confirm SDGs), reject or merge; *Compare proposals* and select a plan; verify a milestone.
4. **Faculty** — inbox of matched problems; *Write a proposal* with a team and milestones that add up to the budget.
5. **CSR partner** — *University projects needing funding*: commit funds; release the tranche for a verified milestone.
6. **Student** — milestone tracker and credentials; open a credential's public verify page.
7. **Ledger** — anyone can check the hash chain; one seeded milestone is deliberately tampered and fails verification.

## Deploy (Vercel + hosted PostgreSQL)
1. Create a PostgreSQL database on a host such as Neon or Supabase and copy its connection string.
2. Import this GitHub repository as a **new** Vercel project.
3. In Vercel → Settings → Environment Variables add `DATABASE_URL` (the connection string) and `JWT_SECRET` (any random
   string of 32+ characters). The app refuses to start in production without them (`src/instrumentation.ts`).
4. Deploy. Vercel runs `npm run vercel-build`, which applies the migrations and builds.
5. Load the demo data once, from your machine, pointed at the hosted database:
   `DATABASE_URL="<hosted connection string>" npx prisma db seed`
6. Optional: `BASE_URL=https://<your-app>.vercel.app npm run smoke` (adds one test report to that database).

## Project map
- `prisma/schema.prisma`, `prisma/migrations/` — data model (never edit an existing migration), `prisma/seed.ts` — demo data
- `src/server/` — auth (`middleware/auth.ts`), lifecycle rules, ledger; `src/proxy.ts` — page guard by role
- `src/app/api/` — API routes (every non-public route checks the session and role)
- `src/app/` — pages; `src/components/` — shared UI; design system in `DESIGN.md`, product context in `PRODUCT.md`
- `HANDOFF.md` — status and log for whoever continues the work; `REBUILD_PLAN.md` — the full plan

## Tech
Next.js 16 (App Router), TypeScript, Prisma 6, PostgreSQL, Tailwind CSS 4, Leaflet, Recharts, jsPDF.
Fonts: Anek Latin and Mukta by Ek Type. District list: [KTBsomen/Indian-state-district-json](https://github.com/KTBsomen/Indian-state-district-json)
(MIT, from igod.gov.in), 36 states/UTs, 784 districts. Basemap © Esri.

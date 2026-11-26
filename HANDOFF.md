# HANDOFF — read this before changing anything

This project is built by more than one AI assistant (Claude Code, Google Antigravity) taking turns.
This file is the shared memory between them. **Read it fully, follow `AGENTS.md`, and add an entry
to the log at the bottom before you stop.**

## What this is
SDG Nexus: a pan-India platform where citizens report local problems, district officers verify them,
universities (faculty + students) solve them as projects, CSR partners fund milestones, NGOs run field
projects, and every step is recorded in a tamper-evident ledger. B.Tech minor project (DBUU, Nov 2026).
The full design is in `REBUILD_PLAN.md` (sections 5–6 = lifecycle and business rules, 15 = phases).

## Run it
```
npm install
npx prisma migrate deploy   # tables
npx prisma db seed          # resets ALL data to the fictional demo story
npm run check               # tests (node:test via tsx)
npm run build               # must pass before every commit
npm run dev                 # http://localhost:3000
```
- Database: local PostgreSQL **19** on port **5434**, database `sdg_nexus`. The connection string is in
  `.env` (git-ignored, never commit it, never print the password).
- Demo accounts: see README ("Demo accounts"). The login page has one-click demo buttons.

## Stack and where things are
- Next.js 16 App Router, TypeScript, Prisma 6, PostgreSQL. Next 16 uses `src/proxy.ts` (not middleware.ts).
- `prisma/schema.prisma` — the data model. `prisma/migrations/` — never edit an existing migration.
- `prisma/seed.ts` — the ONLY place demo data lives. Fictional people/organisations only.
- `src/server/middleware/auth.ts` — sessions (JWT in httpOnly cookie `sdg_session`), `requireUser(req, roles)`,
  `inJurisdiction(user, district)`.
- `src/proxy.ts` — page guard by role. API routes enforce permissions themselves.
- `src/lib/AuthContext.tsx` — client auth (`/api/auth/me`). `src/lib/DataContext.tsx` — shared dashboard data
  from `/api/overview`.
- `src/lib/merkle.ts`, `src/lib/credentials.ts` — hashing used by ledger and credential verification.
- `src/components/Map.tsx` — India map (OpenStreetMap + bubbles from `/api/government/challenge-density`).
- `src/components/dashboard/MilestoneQueue.tsx` — officer verify / CSR release.
- Roles (Prisma enum `Role`): CITIZEN, OFFICER, FACULTY, STUDENT, NGO, CSR, ADMIN.
  UI role keys: citizen, government, hei, student, ngo, corporate, admin.

## Git
- `main` = latest working state. Phase work happens on a branch, merged to `main` when build + check pass.
- Tags: `demo-ready` = the state shown to the mentor (27 Nov 2026). If anything breaks badly:
  `git checkout demo-ready` to see it, or `git diff demo-ready` to see what changed since.
- Each assistant works on its own branch, e.g. `antigravity/phase-2`, and commits after every finished step.

## Phase status
| Phase | Status |
|---|---|
| 0 Clean-up | done |
| 1 Foundation (schema, auth, guards, regions) | done |
| 5 Demo seed | pulled forward, done (smoke script still to do) |
| 2 Lifecycle core | in progress — see log |
| 3 Proposals, funding, milestones | not started |
| 4 Closure, credentials, scores | not started |
| 6 Design (use `.claude/skills/impeccable` guidance) | not started |
| 7 Ship | not started |

## Log (newest last — every assistant adds an entry before stopping)
Format: date · who · branch · what changed (files) · what is unfinished · anything the next one must know.

- 2026-11-26 · Claude Code · main · Phases 0–1, demo seed, one-click demo login, real dashboards, India map,
  approvals queue. DB moved to local PostgreSQL 19 (5434). Tagged `demo-ready`. Next: Phase 2.

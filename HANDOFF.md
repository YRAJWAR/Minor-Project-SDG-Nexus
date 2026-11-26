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
| 2 Lifecycle core | done |
| 3 Proposals, funding, milestones | not started |
| 4 Closure, credentials, scores | not started |
| 6 Design (use `.claude/skills/impeccable` guidance) | not started |
| 7 Ship | not started |

## Log (newest last — every assistant adds an entry before stopping)
Format: date · who · branch · what changed (files) · what is unfinished · anything the next one must know.

- 2026-11-26 · Claude Code · main · Phases 0–1, demo seed, one-click demo login, real dashboards, India map,
  approvals queue. DB moved to local PostgreSQL 19 (5434). Tagged `demo-ready`. Next: Phase 2.
- 2026-11-26 · Claude Code · phase-2-lifecycle → merged to main · Phase 2 core.
  - Added: `src/server/lifecycle.ts` (the ONLY place challenge status changes: `transition()`, `allowedActions()`,
    `priority()`), `src/server/ledger.ts` (hash-chained audit log, ordered by `seq`; `appendLedger()` / `verifyLedger()`),
    `POST /api/challenges/[id]/actions` (VERIFY, REJECT, MERGE, ASSIGN, ENDORSE), `GET /api/ledger/chain`,
    `src/server/lifecycle.test.ts`. Migrations `lifecycle_core`, `ledger_sequence` (the second was hand-written because
    `prisma migrate dev` refuses non-interactive runs for it; apply with `npx prisma migrate deploy`).
  - Changed: validate route uses `transition()`; submit stores `submitterId`, `urgency` and writes the ledger in the same
    transaction; `notifyUsersByRole` is scoped per challenge (`audienceWhere`); officer queue returns priority, overdue,
    endorsements, `allowedActions` and is sorted needs-action-first; officer cards show Verify/Reject/Merge from
    `allowedActions`; track page shows reject/merge outcome, endorsement count, "This affects me too", stage dates from the ledger.
    Seed: submitters, urgency, endorsements, one REJECTED + one MERGED report, ledger history appended in time order.
  - DECISION: status names were kept (SUBMITTED, AI_PROCESSED, VALIDATED = verified/open for proposals, ...) and REJECTED,
    MERGED were added, instead of renaming to the plan's OPEN_FOR_PROPOSALS etc. Renaming would break every screen; do it
    only together with the Phase 3 proposal rework, if at all.
  - Rule for everyone: any new status change MUST go through `transition()` in `src/server/lifecycle.ts`, and any new audit
    entry through `appendLedger()` — never `prisma.challenge.update({ status })` or `prisma.auditLog.create` directly.
  - Phase 2 still open: (1) submit form "endorse instead" on the duplicate warning (call ENDORSE on the similar report);
    (2) tighter submission rules from REBUILD_PLAN §6 (title 5–120, description 30–2000, rate limit, honeypot);
    (3) let the officer edit SDG tags before Verify (API already accepts `sdgTags`); (4) funnel chips for REJECTED, MERGED,
    OVERDUE (counts already returned by the API); (5) `hei/teams/create` still sets TEAM_FORMED directly — move into
    `transition()` when Phase 3 reworks teams into proposals.
- 2026-11-26 · Claude Code · phase-2-finish → merged to main · Phase 2 open items 1–4 done (Antigravity prompts 2–5 are
  therefore no longer needed; next is Prompt 8 = Phase 3).
  - Citizen form: on a duplicate warning, "support that report" calls ENDORSE on the existing report and blocks filing a new
    one (the old "merge and file anyway" path and its isDuplicate flag were removed from the form).
  - Submit API: title 5–120, description 30–2000, max 5 reports per user per 24 h (429, admins exempt), honeypot field `website`.
  - Officer cards: "Verify…" opens an SDG checklist (1–5) and sends `sdgTags` with VERIFY; filter chips Overdue / Rejected /
    Merged next to the funnel.
  - Still open (moves to Phase 3): `hei/teams/create` sets TEAM_FORMED directly — fold into `transition()` with the proposal rework.


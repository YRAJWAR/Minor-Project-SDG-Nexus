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
| 5 Demo seed + checks | done (`npm run smoke` passes end to end) |
| 2 Lifecycle core | done |
| 3 Proposals, funding, milestones | done |
| 4 Closure, credentials, scores | done |
| 6 Design (use `.claude/skills/impeccable` guidance) | done — see DESIGN.md |
| 7 Ship | done — live at https://sdg-nexus-delta.vercel.app |
| 8 Plan gaps (QR, SDG Index, CSR 2%, hours, NGO sign-off, admin) | done |
| 9 Connected roles + crowded demo world | done |

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
- 2026-11-26 · Claude Code · phase-3-funding (NOT merged to main) · Phase 3 mostly built, stopped before testing.
  - Done and committed: schema migration `proposals_funding` (FUNDED status, proposal `teamPlan`/`milestonePlan` JSON,
    `Milestone.amount`, `FundingCommitment`); lifecycle actions SELECT_PROPOSAL, COMMIT_FUNDS, START, COMPLETE and
    `validatePlan()` (+ tests, 15 pass); ASSIGN now creates an empty DRAFT proposal (an invitation);
    proposals API saves/validates the plan; officer ACCEPT goes through SELECT_PROPOSAL; milestone submit fills a planned
    milestone (only when FUNDED/IN_PROGRESS) and the first one STARTs the project; release must equal the tranche and
    fit the funder's commitment, last paid tranche COMPLETEs; APIs `GET /api/challenges/[id]/proposals`,
    `GET /api/funding/open`; components `ProposalsPanel` (officer), `FundingQueue` (CSR), `ProposalPlanEditor` (builder).
  - Committed as WIP (typecheck passes, NOT yet run): `prisma/seed.ts` Phase 3 demo data (`planFor()` helper, competing
    Nalgonda proposals, planned milestones with amounts, commitments; TEAM_FORMED projects 40% funded by Westcoast Infra);
    milestone tracker "Planned milestone" picker.
  - NEXT, in order: (1) `npx prisma migrate deploy` then `npx prisma db seed` and fix any seed error; (2) `npm run check`;
    (3) browser test of the full flow (faculty builds + submits plan → officer "Compare proposals" → select → CSR "Commit
    funds" until FUNDED → student submits proof for a planned milestone → officer verifies → CSR releases each tranche →
    report COMPLETED; ledger chain still valid via GET /api/ledger/chain); (4) `npm run build`; (5) merge to main.
  - Known gaps: `hei/teams/create` (old team-formation page) still sets TEAM_FORMED directly — teams now come from the
    selected proposal, so remove that page from the faculty nav or make the route return 410; proof files are still data
    URLs (hash covers their content); CSR compliance (2% of profit) and NGO attestation not started.
- 2026-11-26 · Google Antigravity · phase-3-funding → merged to main · Phase 3 verified, fixed, and merged.
  - Verified: `npx prisma migrate deploy`, `npx prisma db seed` (all ✓ lines), `npm run check` (15/15), and end-to-end API flow
    (officer `SELECT_PROPOSAL` → CSR `COMMIT_FUNDS` → faculty `milestone/submit` → officer `GP_VERIFIED` → CSR `CSR_APPROVED`
    exact tranche check → `GET /api/ledger/chain` `valid:true`), then reset DB with `npx prisma db seed`.
  - Fixed: `src/app/api/challenges/[challengeId]/actions/route.ts` now forwards `proposalId` and `amount` to `transition()`.
  - Retired obsolete team-formation flow: removed "Team Formation" from `src/components/ui/Sidebar.tsx` and
    `src/app/dashboard/hei/layout.tsx`, updated `src/app/dashboard/hei/page.tsx` link to `/dashboard/hei/proposal/[challengeId]`,
    and made `POST /api/hei/teams/create` return HTTP 410.
  - Note: Chrome DevTools MCP could not connect to local Chrome (`DevToolsActivePort` missing), so the UI walkthrough was
    verified via API end-to-end + `npm run check` + `npm run build` on `main`. Next: Phase 4 (closure, credentials, scores).
- 2026-11-26 · Claude Code · phase-4-closure → merged to main · Phase 3 screens checked in the browser; Phase 4 done.
  - Phase 3 check: builder (team + milestones, "adds up"), officer "Compare proposals", CSR funding list, student planned-milestone
    picker all work. Fixed labels: "Proposals from:" vs "University:" (only the selected one once chosen), "Invite a university".
  - Phase 4: migration `closure_credentials` (Challenge completedAt, confirmedAt, citizenRating, disputeReason,
    verifiedBeneficiaries; StudentCredential.challengeId). Lifecycle CONFIRM (reporter, rating 1–5), DISPUTE (reporter, reason →
    IN_PROGRESS), CLOSE (officer, after confirmation or 14 days, records verified beneficiaries → DEPLOYED = resolved).
    Credentials only for resolved projects (`isProjectComplete(milestones, challengeStatus)`), linked by challengeId, once per
    student per report, rating 80% faculty + 20% citizen (`blendedRating`). University score `src/lib/universityScore.ts`
    (on time 30, citizen 25, people per ₹ lakh vs median 20, proof 15; parts without data are left out; "area need" has no
    data source yet) → `GET /api/impact/universities` → leaderboard "Universities" table. Track page: confirm/dispute UI,
    stage dates from the ledger for every stage. Officer card: "Close as resolved…".
  - Seed: finished projects are DEPLOYED (rating, beneficiaries, ledger history); "Tanker-dependent wadis in Purandar taluka"
    stays COMPLETED, reported by the demo citizen, who gets a notification to confirm it (live demo of closing).
  - Checks: 17 tests; API flow (too-early close 409, other citizen 403, bad rating 400, confirm → close → ready for
    credentials, scores, chain valid) verified; build passes.
  - Not done / next: Phase 6 design (biggest visible gain), Phase 5 smoke script, Phase 7 ship. Small gaps: CSR dashboard stats
    still count NGO-project allocations, not FundingCommitments; credential QR code not added (no QR library installed);
    NGO attestation of milestones not built.
- 2026-11-26 · Claude Code · phase-6-design → merged to main · Phase 6 design core.
  - User chose the world "Survey map sheet" (Survey of India topo sheet). Written: PRODUCT.md, DESIGN.md (the system as built),
    `.impeccable/briefs/landing.md` (direction contract). Impeccable used as guidance only (no scripts run).
  - Tokens in `src/app/globals.css` (paper/ink/survey/forest/ochre/rust; Tailwind scales remapped so old classes inherit);
    fonts Anek Latin + Mukta (Ek Type) in `src/app/layout.tsx` (Razorpay script removed).
  - Landing `src/app/page.tsx` rebuilt as a server component reading real numbers (no fake stats): title block, India sheet map
    (`src/components/landing/SurveyMap.tsx` + `MapSlot.tsx`), route with live per-stage counts, latest ledger entries, roles legend.
  - App shell: Sidebar (lucide icons, no side-stripe), StatCard (plain sheet figure), dashboard layout, login/register restyled;
    emoji removed from all `src/app` pages; citizen submit, track, verify, explore and project ledger pages converted to light.
  - Dashboard map (`src/components/Map.tsx`) uses the same basemap and palette.
  - Next: re-compose the big legacy dashboards (government page tabs, heatmap, ngo, analytics) in the sheet language;
    Phase 5 smoke script; Phase 7 ship (consider Bhuvan/MapmyIndia tiles for official boundaries).
- 2026-11-26 · Claude Code · phase-6-dashboards → merged to main · Dashboards re-composed.
  - Officer page: tabs Work queue (default) / District map / Partners / Insights / Audit trail; figures are the officer's own desk
    (need your action, overdue, with universities, resolved); plain copy ("Reports in your district"); nav label "District office".
  - Faculty: university layout no longer repeats the sidebar (pass-through `hei/layout.tsx`); inbox opens with a plain heading;
    action "Write a proposal". Consistent page headings and honest subtitles on CSR, NGO, leaderboard, ledger, map, analytics, profile.
  - Gradients, backdrop blur and inline greys swept from dashboard pages/components; StatCard shows numbers directly (no counter).
  - All `initial={{ opacity: 0 ...}}` motion starts changed to opacity 1, so content is visible even when animation frames are paused.
  - Checks: 17 tests, build passes; officer, faculty and map pages checked in the browser.
  - Next: Phase 5 smoke script, Phase 7 ship.
- 2026-11-27 · Claude Code · phase-7-ship → merged to main · Phase 5 checks + Phase 7 ship-ready.
  - `scripts/smoke.ts` (`npm run smoke`, `BASE_URL` for a deployed copy): one report through every stage via the real API as the real
    roles, including refusals (over-commit, wrong tranche, early close); credential verifies; ledger chain valid. Passed on fresh seed.
  - `src/instrumentation.ts`: production refuses to start without DATABASE_URL and JWT_SECRET (32+). `npm run vercel-build` =
    prisma generate + migrate deploy + next build. Removed the `db:push` script (against project rules). `.env.example` trimmed to what is used.
  - README rewritten (story, run, demo accounts, five-minute demo, deploy steps, project map).
  - Remaining owner steps: create a hosted PostgreSQL, a NEW Vercel project from this repo with DATABASE_URL + JWT_SECRET, seed it once.
- 2026-11-27 · Claude Code · main · Live. Vercel project (owner's account) + Neon PostgreSQL (us-east-1, direct connection).
  - First build failed: DATABASE_URL was not set in Vercel (P1012); owner added it and redeployed. Startup env check now skips `next build`.
  - Hosted DB seeded from the local `.env.neon` (git-ignored; never commit or print it). `BASE_URL=https://sdg-nexus-delta.vercel.app npm run smoke`
    passed end to end; live data then reset with the seed.
  - Public link is the production domain; the `-git-main-` preview addresses sit behind Vercel's login (Deployment Protection).
- 2026-11-27 · Claude Code · phase-8-gaps → merged to main · Built the REBUILD_PLAN items that were still missing.
  - Credential QR code (`qrcode` package): verify page and PDF; the PDF prints this deployment's own address.
  - NITI Aayog SDG India Index 2023-24 composite score for all 36 States/UTs in `prisma/seed.ts` (`SDG_INDEX`, copied from the
    official dashboard sdgindiaindex.niti.gov.in). Used by `areaNeed()` in `src/server/lifecycle.ts`: priority's 20% area share
    = half state need + half district backlog; university score gets its 10% "area need" part.
  - Migration `phase8_csr_hours_attestation`: Organization.avgNetProfit; Milestone releasedAt, releasedByOrgId, ngoAttestedAt,
    ngoAttestation; ChallengeProposal.ngoPartnerId; TeamMember.ngoRating; new MilestoneHours model.
  - CSR: `/api/funding/obligation` + `CsrObligation` panel (2% of average net profit vs tranches released this financial year,
    `src/lib/csr.ts`). CSR stats now come from FundingCommitments (not old NGO-project allocations). Unverified CSR orgs cannot COMMIT_FUNDS.
  - Hours: proof submission must log hours per student (cap 40/week of the milestone's span, `milestoneHoursCap`). Credentials
    use only those logged hours (≥30 needed); faculty no longer type hours.
  - NGO field partner: optional on proposals (verified NGOs only). `/api/ngo/attestations` + `NgoAttestations` panel on the NGO
    dashboard: confirm milestones on the ground (ledger entry) and rate students. Rating = faculty 40 + NGO 40 + citizen 20
    (faculty 80 without an NGO). Officer queue shows whether the NGO confirmed.
  - Admin page `/dashboard/admin`: approve/reject NGO and CSR organisations, create district officers (both logged in the ledger).
  - Small fixes: NGO dashboard no longer shows a made-up 847 score; CSR report PDF uses the real organisation name; verify-page
    banners readable (light background).
  - Checks: 18 tests, build passes, `npm run smoke` passes (now logs hours). Browser-checked admin, CSR, NGO, credentials, verify, milestone form.
  - Not done (deliberately): real file uploads (needs the owner's Vercel Blob store and token; proof stays as data URLs, hashed);
    Hindi UI and public pledges (optional stretch items in the plan).
- 2026-11-27 · Claude Code · phase-9-crowded → merged to main · Roles more connected; a much bigger demo world.
  - Connections: `src/server/trackRecord.ts` computes university scores (also behind `/api/impact/universities`) and, on every
    CLOSE, stores them as `HEI.pastPerformanceScore`, which officer suggestions, the faculty inbox and smart matching read
    (neutral 50 until a first resolved project; the old 0.85 / 0 defaults are gone). `audienceWhere` (src/lib/notifications.ts)
    now scopes STUDENT to the selected team, NGO to the field partner, CSR to the funders. Lifecycle notifications reach
    everyone on a report (team students, NGO partner, funders), and supporters ("me too") hear at VERIFY and CLOSE.
    Milestone-verified notices go to the team's students only (was every student of the university); tranche releases reach
    the team; new proposals notify only the officer (CSR partners hear once a plan is selected).
  - Bug fixed: NUL-character placeholders in Prisma filters (`?? '\u0000'`) crash PostgreSQL ("invalid byte sequence");
    replaced with `'-'` in 8 places.
  - Seed: `prisma/data/demo-world.ts` (54 more real districts with local localities and their typical problems, 15 universities,
    19 NGOs, 10 CSR companies, 14 officers, regional name pools). Status follows age (a working year), FUNDED stage seeded,
    competing bids from the best-placed universities, home-state / SDG-focus funders, every fifth project co-funded,
    local residents report and support their own district, more rejected/merged outcomes, a busier notification bell.
    Ledger rows are hashed in memory and bulk-inserted (same `entryHash`), track records computed at the end.
    Result: 714 users, ~220 reports, ~900 endorsements, ~815 ledger entries, 156 teams, 624 milestones, 228 credentials.
  - Checks: 18 tests, build, `npm run smoke` passes; ledger chain valid; dashboards checked in the browser.

# Prompts for Google Antigravity — continue Phase 3

Work stopped on branch `phase-3-funding` (pushed to GitHub, NOT merged to main). Phase 3 code is written and committed;
the demo seed and the full flow have not been run yet. `HANDOFF.md` (last log entry) has the details.

Paste these one at a time, in order. Wait for each to finish and read its summary before pasting the next.
Prompt 0 starts every session. Prompt 9 ends every session.

---

## Prompt 0: start of every session (always first)

```
You are continuing an existing project that another AI assistant (Claude Code) built. Do not redesign or rewrite it.

Before doing anything else:
1. Read AGENTS.md fully, especially "SDG Nexus project rules". Follow every rule.
2. Read HANDOFF.md fully, especially the LAST entry of the Log. That is exactly where work stopped.
3. Read REBUILD_PLAN.md sections 5 and 6 (lifecycle and business rules).
4. Run: git status, git branch --show-current, git log --oneline -5. If you are not on branch phase-3-funding,
   run: git fetch && git checkout phase-3-funding && git pull
5. Run: npm run check (all tests must pass).

Then reply with a short summary: current branch, last commit, what the HANDOFF log says to do next, and the test
result. Do not change any file in this step.

Hard rules for this whole session:
- Never edit or delete existing files in prisma/migrations/. Never run "prisma migrate reset" or "prisma db push".
  If a schema change is truly needed, add a NEW migration.
- Never edit .env and never print its contents.
- Every challenge status change goes through transition() in src/server/lifecycle.ts. Every audit/ledger entry goes
  through appendLedger() in src/server/ledger.ts. Never prisma.challenge.update({ status }) or prisma.auditLog.create.
- Every non-public API route starts with requireUser(req, [roles]) from src/server/middleware/auth.ts.
- No mock or hardcoded data in pages or API routes. Demo data only in prisma/seed.ts (fictional names only).
- Do not rename or delete existing routes, Prisma fields, enum values or exported functions.
- Do not run scripts in .claude/skills/impeccable (read its guidance only, for UI work).
- Commit after each finished step, only when npm run check and npm run build pass.
- If something is unclear or a rule blocks you, stop and ask me instead of guessing.
```

---

## Prompt 1: apply the database changes and load the demo data

```
Step 1 of the HANDOFF "NEXT" list. Run:
  npx prisma migrate deploy
  npx prisma db seed
If the seed fails, read the error, fix ONLY prisma/seed.ts (do not change the schema or migrations), and run the seed
again until it prints all its "✓" lines. Then run npm run check.
Then verify the hash-chained ledger is valid by running this one-off check and showing me the output:
  echo "import { verifyLedger } from './src/server/ledger'; verifyLedger().then((r) => { console.log(JSON.stringify(r)); process.exit(0); });" > tmp-chain.ts && npx tsx tmp-chain.ts; rm tmp-chain.ts
It must print "valid":true. If you changed seed.ts, commit it ("Fix Phase 3 seed: <what>").
```

---

## Prompt 2: test the whole Phase 3 flow through the API

```
Start the app: npm run dev (wait until it says Ready). Demo password: see DEMO_PASSWORD in prisma/seed.ts.
Write a temporary Node script in the system temp folder (NOT in the repo) that logs in with POST /api/auth/login
(email + password, keep the returned cookie) and checks this flow, printing each HTTP status:
1. officer.nalgonda@demo.sdgnexus.in: GET /api/government/challenges, find a VALIDATED report whose allowedActions
   include SELECT_PROPOSAL and proposalsCount >= 2. GET /api/challenges/{id}/proposals — expect 2 proposals with
   empty "problems". POST /api/challenges/{id}/actions {action:"SELECT_PROPOSAL", proposalId} — expect 200, status TEAM_FORMED.
2. csr@demo.sdgnexus.in: GET /api/funding/open — the report from step 1 appears with a gap. POST
   /api/challenges/{id}/actions {action:"COMMIT_FUNDS", amount: gap+1} — expect 400. Then amount: gap — expect 200, status FUNDED.
3. student@demo.sdgnexus.in: GET /api/hei/milestones/projects, find the new project; GET /api/hei/milestones/{teamId};
   POST /api/hei/milestones/submit {teamId, milestoneId: first PENDING milestone, description:"Survey done", proofUrls: []}
   — expect 200 (only if the student is on that team; otherwise use faculty@demo.sdgnexus.in). The report becomes IN_PROGRESS.
4. officer: PATCH /api/hei/milestones/{teamId} {milestoneId, status:"GP_VERIFIED"} — expect 200.
5. csr: PATCH /api/hei/milestones/{teamId} {milestoneId, status:"CSR_APPROVED", fundReleased: wrong amount} — expect 400;
   with the milestone's exact "amount" — expect 200.
6. GET /api/ledger/chain (any login) — expect valid:true.
Report every result. If a step fails, find the root cause in the code, fix it (one place, the shared function), rerun.
Finally run npx prisma db seed to reset the demo data. Commit any fixes.
```

---

## Prompt 3: test the screens in the browser

```
With npm run dev running and fresh data (npx prisma db seed), use the one-click demo buttons on /login and check:
1. Faculty: open a VALIDATED report from the Challenge Inbox → Proposal Builder. The "Project team" picker and
   "Milestones" editor appear; the total shows "adds up" only when amounts equal the budget; Submit works.
2. District Officer: a Nalgonda card shows "Compare proposals (n)"; it lists each university's plan; "Select this plan" works.
3. CSR Partner: "University projects needing funding" lists the project with a progress bar; "Commit funds" works;
   "Verified milestones ready for fund release" shows a read-only agreed amount.
4. Student: Milestone Tracker shows the "Planned milestone" dropdown for a funded project and submits proof.
List anything broken (page + exact error/console message), fix it, then run npm run check and npm run build and commit.
Reset data with npx prisma db seed at the end.
```

---

## Prompt 4: close the known gap (old team-formation page)

```
From HANDOFF "Known gaps": teams are now created when the officer selects a proposal, so the old flow is obsolete.
1. Remove the "Team Formation" entry from the faculty navigation in src/components/ui/Sidebar.tsx and from the tabs in
   src/app/dashboard/hei/layout.tsx (do not delete the page files).
2. In src/app/api/hei/teams/create/route.ts make POST return 410 with the message
   "Teams are now formed by submitting a proposal with a team; the district officer's selection creates the project."
   Keep requireUser at the top.
3. grep the codebase for links to /dashboard/hei/team-formation and point them to the proposal builder
   (/dashboard/hei/proposal/{challengeId}) instead.
npm run check and npm run build must pass. Commit.
```

---

## Prompt 5: merge Phase 3 into main

```
All Phase 3 checks passed. Merge:
git checkout main && git pull && git merge --no-ff phase-3-funding -m "Merge Phase 3: proposals, funding, milestones"
npm run check && npm run build
If both pass: git push origin main. If anything fails, do not push; tell me what failed.
Update the "Phase status" table in HANDOFF.md: Phase 3 done. Commit and push.
```

---

## Prompt 6: start Phase 4 (only after Phase 3 is merged)

```
Start Phase 4 from REBUILD_PLAN.md section 15 ("Closure, credentials, scores") and section 6 rules "Closure",
"Credentials" and "Impact score". Branch: git checkout main && git pull && git checkout -b phase-4-closure.
Do NOT write code yet. Read src/server/lifecycle.ts, src/lib/credentials.ts, src/app/api/hei/credentials/,
src/services/impactScoring*.ts and prisma/schema.prisma, then send me a step-by-step plan:
- new lifecycle actions (e.g. CONFIRM by the citizen, DISPUTE back to IN_PROGRESS, officer CLOSE after 14 days) using
  the existing statuses COMPLETED → DEPLOYED (= resolved) where possible; any new enum value only via a NEW migration
- credentials only after resolution, hours from verified milestones, the verify page recomputing the hash
- the impact score formula from section 6, shown with its breakdown
Wait for my OK before coding. Then one step per commit, npm run check and npm run build before each commit.
```

---

## Prompt 9: end of every session (always last)

```
We are stopping for now. Before you stop:
1. Make sure npm run check and npm run build pass. Commit everything finished with clear messages. If something is
   half-done, commit it only if the build passes (message starting with "WIP:"); otherwise leave it uncommitted and describe it.
2. git push the current branch.
3. Add a new entry at the bottom of the Log in HANDOFF.md in the same format as the existing entries:
   date · Antigravity · branch · what changed (files) · what is unfinished · what the next assistant must do next, in order.
   Update the Phase status table if a phase changed.
4. Commit and push HANDOFF.md.
Then show me the HANDOFF.md entry you wrote and the output of git log --oneline -5.
```

---

## If something goes wrong

```
Stop. Do not try to fix more. Run git status and git diff --stat and show me. Then undo all uncommitted changes with
git restore . and show me what git clean -nd would delete before deleting anything.
```
Safe points to return to: `git checkout phase-3-funding` (last Claude commit), `git checkout main` (Phase 2, merged and
tested), `git checkout demo-ready` (the version shown to the mentor).

## Coming back to Claude Code
Tell Claude: "continue from branch <branch name>; read the HANDOFF.md log". Claude checks Antigravity's work against
the rules before merging.

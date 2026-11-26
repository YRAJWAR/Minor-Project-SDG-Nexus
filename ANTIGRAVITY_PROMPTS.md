# Prompts for Google Antigravity

Paste these one at a time, in order. Wait for each to finish and check its summary before pasting the next.
Prompt 0 starts every new session. Prompt 9 ends every session.

---

## Prompt 0: start of every session (always first)

```
You are continuing an existing project that another AI assistant (Claude Code) built. Do not redesign or rewrite it.

Before doing anything else:
1. Read AGENTS.md fully, especially the section "SDG Nexus project rules". Follow every rule.
2. Read HANDOFF.md fully, especially the last entry of the Log. That is exactly where work stopped.
3. Read REBUILD_PLAN.md sections 5 and 6 (lifecycle and business rules).
4. Run: git status, git log --oneline -5, git branch -a. Then: npm run check (all tests must pass).

Then reply with a short summary: current branch, last commit, what the HANDOFF log says is still open, and the test
result. Do not change any file in this step.

Hard rules for this whole session:
- Never edit or delete existing files in prisma/migrations/. Never run "prisma migrate reset" or "prisma db push".
- Never edit .env and never print its contents.
- Every challenge status change goes through transition() in src/server/lifecycle.ts. Every audit/ledger entry goes
  through appendLedger() in src/server/ledger.ts. Never write prisma.challenge.update({ status }) or
  prisma.auditLog.create directly.
- Every non-public API route starts with requireUser(req, [roles]) from src/server/middleware/auth.ts.
- No mock or hardcoded data in pages or API routes. Demo data only in prisma/seed.ts.
- Do not rename or delete existing routes, Prisma fields, enum values or exported functions.
- Do not run any scripts in .claude/skills/impeccable (read its guidance only, for UI work).
- If something is unclear or a rule blocks you, stop and ask me instead of guessing.
```

---

## Prompt 1: create your working branch

```
Create a branch for your work from the latest main:
git checkout main && git pull && git checkout -b antigravity/phase-2-finish
Confirm the branch name. Do not change any files yet.
```

---

## Prompt 2: Phase 2 open item 1, "Endorse instead" on duplicate warning

```
Task (HANDOFF.md, Phase 2 open item 1): on the citizen report form (src/app/citizen/submit/page.tsx), when the
duplicate check finds a similar report, add a button "This is the same problem — support it instead".
It must call POST /api/challenges/{similarChallengeId}/actions with body { "action": "ENDORSE" }, show the result
message, and then link to /track/{similarChallengeId}. Do not create the new report in that case.
Use the existing duplicate result object already in that page; do not change the duplicate-check API.
Keep the existing styling of the page.
When done: run npm run check and npm run build (both must pass), then commit with a clear message.
Show me the diff summary.
```

---

## Prompt 3: Phase 2 open item 2, stricter submission rules

```
Task (HANDOFF.md, Phase 2 open item 2): tighten validation in src/app/api/challenges/submit/route.ts per
REBUILD_PLAN.md section 6 "Submission":
- title 5–120 characters, description 30–2000 characters (update the error messages; update the matching limits in
  the form page so the user sees them before submitting)
- at most 5 submissions per user per day: count Challenge rows with submitterId = user.id created in the last 24 hours;
  if 5 or more, return 429 with a friendly message
- a hidden honeypot field named "website" in the form; if the request body has a non-empty "website", return 400
Do not change anything else in the route (it already saves the report and its ledger entry in one transaction).
Add one small test to src/server/lifecycle.test.ts only if you extract a pure function; otherwise no test needed.
When done: npm run check and npm run build must pass, then commit. Show me the diff summary.
```

---

## Prompt 4: Phase 2 open item 3, officer edits SDG tags before Verify

```
Task (HANDOFF.md, Phase 2 open item 3): in src/app/dashboard/government/page.tsx, the Verify button currently calls
runAction(ch, 'VERIFY'). Before verifying, let the officer adjust the SDG tags: show a small inline checklist of
SDGs 1–17 (use SDG_INFO from src/data/mockData.ts for names), pre-ticked with ch.sdgTags, max 5 selected,
and a "Confirm verify" button that calls runAction(ch, 'VERIFY', { sdgTags: [...] }).
The API (POST /api/challenges/[id]/actions) already accepts and validates sdgTags — do not change the API.
Keep it accessible (real checkboxes with labels). When done: npm run check and npm run build must pass, then commit.
```

---

## Prompt 5: Phase 2 open item 4, funnel chips for Rejected / Merged / Overdue

```
Task (HANDOFF.md, Phase 2 open item 4): in src/app/dashboard/government/page.tsx the status funnel shows the 8
pipeline stages. GET /api/government/challenges already returns counts.REJECTED, counts.MERGED and counts.OVERDUE and
supports ?status=REJECTED|MERGED|OVERDUE filtering on the client list. Add three small filter chips next to the
funnel ("Overdue", "Rejected", "Merged") with their counts that filter the card list the same way the existing stage
buttons do. Do not change the API. When done: npm run check and npm run build must pass, then commit.
```

---

## Prompt 6: verify everything in the browser

```
Start the app with npm run dev. Reset the demo data first with: npx prisma db seed
Then, using the one-click demo buttons on /login, check and report (do not fix yet, just report):
1. District Officer: queue loads; Verify, Reject (with reason), Merge work on a SUBMITTED report; new chips filter.
2. Citizen: submit a report; the duplicate "support it instead" path works; /track/{id} shows status and endorse.
3. Faculty, Student, NGO, CSR Partner: their dashboards load with data and no console errors.
List anything broken with the exact page and error. Afterwards run npx prisma db seed again to reset the data.
```

---

## Prompt 7: merge Phase 2 to main (only after Prompt 6 is clean)

```
All Phase 2 items are done and checked. Merge to main:
git checkout main && git pull && git merge --no-ff antigravity/phase-2-finish && npm run check && npm run build
If both pass: git push origin main. If anything fails, do not push; tell me what failed.
```

---

## Prompt 8: Phase 3 (only start after Phase 2 is merged)

```
Start Phase 3 from REBUILD_PLAN.md section 15 ("Proposals, funding, milestones") and section 6 rules "Proposal",
"Funding" and "Milestone proof". Branch: git checkout main && git pull && git checkout -b antigravity/phase-3.
First, do NOT write code. Read the current proposal, team, milestone and CSR code
(src/app/api/hei/proposals, src/app/api/hei/teams/create, src/app/api/hei/milestones, src/components/dashboard/MilestoneQueue.tsx,
prisma/schema.prisma) and send me a step-by-step plan: what schema changes (as a NEW migration), which routes change,
which screens change, and how each status change goes through transition() in src/server/lifecycle.ts
(add new actions there, e.g. SELECT_PROPOSAL, COMMIT_FUNDS). Keep existing status names; only add new ones if needed.
Wait for my OK before coding. Then do one step per commit, running npm run check and npm run build before each commit.
```

---

## Prompt 9: end of every session (always last)

```
We are stopping for now. Before you stop:
1. Make sure npm run check and npm run build pass. Commit everything finished with clear messages.
   If something is half-done, commit it only if the build passes; otherwise leave it uncommitted and describe it.
2. git push the current branch.
3. Add a new entry at the bottom of the Log in HANDOFF.md in the same format as the existing entries:
   date · Antigravity · branch · what changed (files) · what is unfinished · anything the next assistant must know
   (decisions you made, commands you ran, anything risky). Update the Phase status table if a phase changed.
4. Commit and push HANDOFF.md.
Then show me the HANDOFF.md entry you wrote and the output of git log --oneline -5.
```

---

## If something goes wrong

```
Stop. Do not try to fix more. Run git status and git diff --stat and show me. Then undo all uncommitted changes with
git restore . and git clean -nd (show me what clean would delete before deleting anything).
```
To return to the last known-good state: `git checkout main` (latest merged work) or `git checkout demo-ready`
(the version shown to the mentor).

## Coming back to Claude Code
Tell Claude: "continue from branch <branch name>; read the HANDOFF.md log". Claude will check Antigravity's work
against the rules before merging.

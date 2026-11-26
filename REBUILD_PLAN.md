# SDG Nexus — Rebuild Plan (Minor Project)

> From a hackathon demo for one state to a working, pan-India platform where every screen is backed by real data and every number can be traced.

Status: **Phase 0 (clean-up + live security fixes) done — 26 Nov 2026. Next: Phase 1 (foundation).** Written from: a code audit of all 231 tracked files, a review of the live site (`sdg-nexus-sih2026.vercel.app`), and a hands-on walkthrough of every role on a local copy.

### Phase 0 — what was done
- **No more fake answers:** unknown IDs return 404 and database failures return 503 everywhere (credential verify + PDF, tracking, ledger, matching, inbox, notifications, insights, district/density/risk/audit, org profiles). All `FALLBACK_*` / hero datasets in API routes are gone.
- **Fixed false "verified":** credential verify recomputes from stored data only; ledger verify ignores client hashes and treats unsealed milestones as not valid; milestone submit now hashes exactly what it stores (before, every real milestone would have failed verification).
- **Fixed wrong-record bugs:** matching no longer falls back to the oldest challenge; credentials can't go to "the first student in the DB"; milestones can't attach to "the first team"; team formation can't add random students or invent a university; pages no longer swap in the Simdega demo challenge.
- **Fixed logic:** no university self-acceptance of proposals; milestone and proposal status changes follow allowed transitions; credential issuing requires every milestone approved (zero milestones ≠ complete), is all-or-nothing, can't be issued twice, caps hours; NGO project validation (spent ≤ budget, end ≥ start, beneficiary cap); escalation no longer resets the overdue clock; Policy Insights crash fixed (real data, correct shape).
- **Privacy:** notifications no longer show other users' items or count platform-wide; mark-read is scoped to the user; phone numbers stripped from the public challenge list; anonymous submitters stay anonymous; no student email on the public verify API; avatars no longer send emails to a third-party service.
- **Removed:** 55 unused API routes, the donor role (pages, components, APIs, Razorpay stub), 8 dead services, Spline scene, 12 hackathon scripts, packages `rechart`, `natural`, `react-simple-maps`, `d3-geo`, `@splinetool/*`.
- **Copy:** SIH / Jharkhand / Triple-Helix / NEP-compliance wording replaced in the UI; site title updated; fake landing stats and "live challenges" feed removed; internal labels (P8, Screen 3) removed; students get their own menu.
- **Check:** `npm run check` (6 integrity tests: hash round-trips, tamper detection, credits, completion rule, duplicate scoring).

### Deliberately left for Phase 1 (marked `ponytail:` in code)
- Real auth: several routes still accept mock tokens / `?email=` / `x-user-role`; the validate route defaults to GOV. **Do not redeploy the public site until Phase 1 lands.**
- `DataContext` / `mockData.ts` still drive the shared dashboards (stat cards, leaderboard, ledger page, heatmap numbers).
- Jharkhand **data** (district dropdowns, GeoJSON map, demo login emails, district coordinates) — replaced by the pan-India regions table and seed.
- Uploads still stored as data URLs; proof hashed from the URL string (Phase 3).

---

## 1. The goal in one paragraph

**SDG Nexus lets anyone in India report a local problem, and turns it into a funded, student-built, verified fix, with every step on a public record.**
A citizen reports a problem → a district officer verifies it → the platform suggests the best-fit university → a faculty-led student team proposes a solution (optionally with an NGO field partner) → a CSR funder backs it → money is released milestone by milestone, only after proof is checked → the citizen confirms it is fixed → students receive credentials anyone can verify, and every organisation's track record is built from what actually happened.

### What success looks like (the demo test)
An examiner can follow **one problem from report to resolution** across 6 logins, and:
- every number on every screen agrees with every other screen
- every "success" message means something was really saved
- every hash, credential and ledger entry can be checked, and a tampered one is caught
- nothing that looks interactive is a dead button

---

## 2. What we found (all reviews combined)

### 2.1 Critical: product promises that are false today
| # | Finding | Where | Seen on live? |
|---|---|---|---|
| C1 | Any made-up credential ID shows "✅ VERIFIED — CRYPTOGRAPHIC INTEGRITY CONFIRMED" and the response includes the student's email | `api/hei/credentials/[id]`, `verify/credential/[id]` | Yes |
| C2 | Any unknown challenge ID returns a fake "Simdega sanitation" challenge, so tracking your own submission shows someone else's | `api/challenges/[id]/status` | Yes |
| C3 | Ledger verify trusts a hash sent by the browser if the DB has none, and has a special case for `'pakur'`; hashes cover the image **URL**, not the image | `api/ledger/verify`, `lib/merkle.ts` | — |
| C4 | Login is fake: hardcoded users in the browser, `Demo@1234` or `password123` opens any account, the "token" is `mock_jwt_<id>` | `lib/AuthContext.tsx` | — |
| C5 | Server auth can be bypassed with `Bearer test_gov_…` / `mock_…` tokens, `?userId=`, `?email=`, `?role=`, `x-user-id`; only ~15 of ~100 routes check auth | `api/notifications`, `api/challenges/*/transition`, `api/government/challenges` | — |
| C6 | Government "Policy Insights" tab crashes the whole page (API returns an array, the page expects `mostUnderserved.text`) | `dashboard/government/page.tsx:1501` | Yes (shape bug) |
| C7 | "Success" is shown when nothing was saved, and a fake ID like `ch-demo-…` is handed out | citizen submit, gov routing, credential issue | — |
| C8 | NGO project save fails with a 500 and the form resets: the user's input is lost with no message | `dashboard/ngo/create-project` | — |
| C9 | The live DB has junk data (`"eftg"`, `"fvrtgrtggrt"`) with no spam protection, and the government challenge list is public | `api/challenges/submit`, `api/government/challenges` | Yes |

### 2.2 Broken logic and flow
- **Two worlds that never meet:** NGO "Projects" (donations, CSR, scores) and the Challenge → University pipeline share nothing.
- **Data mostly comes from the browser:** `DataContext` + `mockData.ts` drive most dashboards; additions disappear on refresh.
- **Fallback datasets per route:** every route has its own fake list, so the same challenge has different titles and ages on different pages, and Pakur is "Assigned" (gov), "0 projects" (milestones) and "All milestones approved" (credentials) at the same time.
- **Numbers disagree:** 14 vs 11 challenges; 228 NGOs vs 14 organisations listed vs 6 on the leaderboard; ₹8 Cr vs ₹7.6 Cr; the same NGO scores 841 and 847.
- **Wrong record loaded:** accepting "Latehar road" opens team formation for "Simdega sanitation".
- **Wrong order:** Accept → Team → Proposal. Proposals have no milestones or budget split, so money cannot follow progress.
- **Actions shown in the wrong state:** "Validate & Route" on Completed/Deployed; "Accept Challenge" on Deployed/In Progress.
- **Wrong role permissions:** students get the NGO menu and can press faculty's "Accept Challenge"; the government user can "Log Activity".
- **CSR can do nothing:** no fund, review or release action exists, even though the landing page promises it.
- **NGO sees another org's data:** `user.id` is used as the org ID, with a fallback to org `'u1'`.
- **No input validation:** ₹1,000 budget with ₹9,99,999 spent, 90 lakh beneficiaries and an end date before the start date are all accepted.
- **Credential scoring partly hardcoded:** NGO rating fixed at 3.5, community at 3.0; hours uncapped; credentials can be issued twice.
- **Donor role:** sidebar hidden by code (`role === 'donor' ? 'hidden'`), payment is simulated, the donation disappears on refresh, "projects supported" counts donations.
- **Role names spelled 4 ways** (`gov`, `GOV`, `GOVERNMENT`, `COLLECTOR`…); the server type has no HEI/STUDENT/CITIZEN.
- **Area-need score** uses a 16-state "Mock" list with Jharkhand at 87 and loose substring matching.
- **Migrations broken:** `001_init` creates 9 of 38 tables.
- **Serverless issues:** in-memory rate limiter and `setInterval` jobs don't work on Vercel; `/api/cron` is open outside production.
- **Map:** basemap shows "API KEY REQUIRED" (Carto); the heatmap shows 16-state data drawn on Jharkhand district shapes.
- **Audit trail** stuck on "Loading…"; claims "Section 65B Indian Evidence Act compliant".
- **Other:** every API is called 2–4× per page load; the `natural` library throws build warnings; uploads are stored as base64 in the DB; OpenAI model is `gpt-3.5-turbo`.

### 2.3 Design and UX
- The "AI template" look: navy background, cyan gradient text, glowing cards, a row of 6 step cards, "The Operating System for…".
- Public pages are dark, dashboards light: two products.
- Fake detail everywhere: hashes `a1b2c3d4…`, an activity log from "Mumbai, IP 192.168.1.1", random stock photos (raspberries for an education NGO).
- Internal labels shown to users: "P8", "Screen 3", "Phase 3".
- Dead buttons: Edit Profile, Enable 2FA, Upload Document.
- No loading states: stat cards show 0 or blank, then jump; `/dashboard` is blank before redirecting.
- Duplicate navigation (sidebar and top tabs on university pages); two notification bells on the government page.
- Citizen has no dashboard, no logout and no "my reports"; "Live Challenges" goes to an ID box, not a list.
- One 2,138-line government page.
- Emoji icons mixed with lucide icons; `div` buttons; low contrast on fade-in.

### 2.4 Jharkhand / SIH lock-in (~60 files)
District lists, GeoJSON, SDG index, seed data, landing copy ("24 districts", "SIH26043"), "Collector", "Gram Panchayat node", "Mukhiya", "VLE operator", real organisation names (Tata Steel, SAIL, PRADAN, NIT Jamshedpur, BIT Mesra, Reliance), demo emails on `jharkhand.gov.in`.

### 2.5 What is good and worth keeping
- The **core idea and lifecycle** are strong and match a real gap.
- The **Prisma schema** for challenges, proposals, teams, milestones and credentials is a good base.
- The **state machine** idea in `src/middleware/challengeStatus.ts` (transitions + who may do them).
- **Matching** logic (`hei/challenges/inbox` `calculateMatchBreakdown`, `smartMatchingService`) and the **explainability panel**.
- The **SDG classifier** with a keyword fallback (`sdgClassifierService`).
- **Hash helpers** (`lib/merkle.ts`, `lib/credentials.ts`) and **PDF generation** (`credentialPdf.ts`, `pdfGenerator.ts`).
- **Notification** helpers and hook (`lib/notifications.ts`, `useNotifications`).
- The **citizen submission wizard** (category → location → evidence → review) and client-side image compression.
- The **validators / error handler / response** helpers in `src/server/*`.
- Typecheck and production build both pass today.

---

## 3. How I think about it (principles)

1. **One spine.** The `Challenge` is the single record everything hangs off. No parallel "Project" world.
2. **State drives everything.** Status decides which buttons appear, who may press them, what gets notified and what gets written to the ledger, all in one place.
3. **No fake data at runtime.** Demo content lives only in the seed script. If the DB is down, the user sees an error, not invented data.
4. **Unknown means not found.** Every lookup by ID returns 404 when the record doesn't exist.
5. **Success only after commit.** UI confirms only what the server confirms; failed forms keep their input.
6. **Every number is a query.** Counts and totals are computed from the same tables everywhere, so they cannot disagree.
7. **People verify, AI suggests.** AI tags SDGs and ranks universities; an officer confirms. Explanations are always shown.
8. **Money follows proof.** No tranche without a verified milestone; no milestone verified without evidence.
9. **Small and real beats big and fake.** Fewer screens, each one fully working.
10. **Lazy where it's safe, careful where it matters** (per `AGENTS.md`): reuse what exists, but never cut corners on auth, validation, money or data loss.

---

## 4. Roles (7 → 7, but each one now has a real job)

| Role | Who | Signs up how | Core job |
|---|---|---|---|
| **Citizen** | Anyone | Self sign-up, active at once | Report, endorse ("me too"), track, confirm the fix, rate |
| **District Officer** | Government official | Created by Admin; scoped to a district (or state) | Verify reports, merge duplicates, select proposals, verify milestone proof, close out |
| **Faculty** | University staff | Signs up under a university (pending until Admin verifies the university) | Write proposals with a team and milestones, submit proof, issue credentials |
| **Student** | University student | Joins with the university's invite code | Join teams, log hours, upload proof, see credits and credentials |
| **NGO** | Field partner | Org sign-up, pending until verified | Partner on proposals, attest field work, rate students |
| **CSR Funder** | Company CSR team | Org sign-up, pending until verified | Browse proposals needing money, commit funds, release tranches, track the 2% obligation |
| **Admin** | Platform operator | Seeded | Verify organisations, create officers, view the full audit log |

**Dropped:** the standalone **Donor** role (all of it was simulated). Its useful part becomes **citizen endorsements**. Optional stretch: public "pledge support" on a project page.

---

## 5. The lifecycle (redesigned state machine)

```
                 ┌──────────── REJECTED (reason required)
                 │
SUBMITTED ──(officer)──► VERIFIED ──(auto)──► OPEN_FOR_PROPOSALS
     │                                              │
     └──(officer)──► MERGED (into another)          │ faculty submit proposals (with team + milestones)
                                                    ▼
                                            PROPOSAL_SELECTED (officer picks one)
                                                    │ CSR commitments add up to the budget
                                                    ▼
                                                 FUNDED
                                                    │ first milestone started
                                                    ▼
                                               IN_PROGRESS ◄─────────────┐
                                                    │ all milestones VERIFIED   │ (rework)
                                                    ▼                           │
                                                COMPLETED ──(citizen disputes)──► DISPUTED
                                                    │ citizen confirms (or officer after 14 days)
                                                    ▼
                                                RESOLVED ──► credentials can be issued
```

**Key changes from today:**
- **The team is formed inside the proposal**, not as a separate stage. A proposal can't be submitted without a faculty lead and at least 2 students. (This removes the wrong-order bug and two states.)
- **Several universities can propose; the officer picks one.** Competing proposals are part of the story.
- **Funding is its own gate.** Several CSR funders can co-fund until the budget is covered.
- **The citizen closes the loop.** Their confirmation and rating feed the impact score and student credits (replacing the hardcoded 3.0).
- **Disputes exist.** A bad fix goes back into progress instead of being marked done.

### Milestone sub-states
`PLANNED → SUBMITTED (proof + hours) → VERIFIED (officer; NGO attestation recorded if there's a partner) → PAID (CSR releases the tranche)`
`SUBMITTED → REJECTED (reason) → back to PLANNED`

### One transition service
`src/server/lifecycle.ts` (grown from `challengeStatus.ts`) exports a single `transition(challengeId, action, actor, payload)`, which:
1. loads the challenge and checks the **action is allowed from this status**
2. checks the **actor's role and jurisdiction / org membership**
3. checks **preconditions** (for example, FUNDED needs commitments ≥ budget)
4. writes the status change, the **ledger entry** and **notifications** in **one DB transaction**
5. returns the new state plus the list of actions now allowed for this viewer

The API also returns `allowedActions` with every challenge, so **the UI never decides on its own which buttons to show**.

---

## 6. Business rules (the hardening)

**Submission**
- Title 5–120 characters, description 30–2,000, state and district required and must exist in the region table, GPS required (map pin or "use my location").
- Up to 5 photos, JPEG/PNG/WebP, ≤ 2 MB each after compression; SHA-256 computed on the server from the file bytes.
- Rate limit: 5 submissions per citizen per day and 20 per IP per hour, stored in the DB. Plus a hidden honeypot field.
- **Duplicate check before submitting:** an open challenge within 2 km, in the same category, with text similarity ≥ 0.5 → "Is this the same problem? **Endorse it instead**".

**Priority score (the officer's queue order, shown with its breakdown)**
`priority = 35% severity + 25% endorsements (log-scaled) + 20% area need (NITI SDG India Index, state) + 20% waiting time`

**Verification**
- Only an officer whose jurisdiction covers the district can verify, reject or merge.
- SDG tags come from AI; the officer confirms or edits them before verifying.
- **SLA:** a report waiting more than 7 days is flagged "overdue" (computed in a daily cron job, not `setInterval`).

**University matching (suggestions shown when a challenge opens)**
`match = 40% SDG overlap + 25% distance (haversine, same state favoured) + 15% department fit for the category + 15% track record + 5% current-load penalty`
Each score is shown as an explanation (reusing `RoutingExplainabilityPanel`). The top 5 universities are notified.

**Proposal**
- Approach 150–3,000 words, timeline 2–52 weeks, faculty lead + 2–8 students from the **same university**, optional NGO partner.
- **2–6 milestones**, each with a title, due date and **amount**; milestone amounts must **add up exactly** to the requested budget.
- IP declaration required. AI quality preview is advisory only.
- One active proposal per university per challenge.

**Funding**
- A CSR funder can commit any amount up to the remaining gap. The challenge becomes FUNDED when commitments ≥ budget.
- A tranche equals a milestone's amount, released **only** when that milestone is VERIFIED, by a funder who committed.
- Released ≤ committed, always (checked in the transaction).
- CSR compliance: required spend = 2% of average net profit (entered by the funder) vs committed and released this financial year.

**Milestone proof**
- Photos (hashed server-side), optional GPS, a short report, and **hours per student**.
- Hours capped at 40 per student per week of the milestone's duration.
- The officer verifies or rejects with a reason. The NGO partner (if any) gives an attestation plus student ratings.

**Closure**
- The citizen who reported (and endorsers) are asked to confirm and rate 1–5. After 14 days without an answer, the officer can close.
- The officer records the **verified beneficiaries count** at closure; the impact score uses only this, never self-reported numbers.

**Credentials**
- Issued once per (student, challenge), only after RESOLVED.
- Hours = sum of verified milestone hours; credits = floor(hours / 30).
- Rating = 40% faculty + 40% NGO (if no NGO, faculty's weight rises to 80%) + 20% citizen rating.
- Hash = SHA-256 of the canonical credential fields. The public verify page **recomputes** it and shows **Valid / Tampered / Not found**, plus a QR code. Email is never shown publicly; the name is masked.

**Impact score (universities and NGOs, recomputed on each closure)**
`score (0–100) = 30% milestones on time + 25% citizen satisfaction + 20% verified beneficiaries per ₹ lakh (vs median) + 15% proof completeness + 10% area need`
Shown with its breakdown and "based on N resolved challenges". No score before the first resolution.

---

## 7. Ledger and audit (one table, two views)

`LedgerEntry { id, challengeId?, seq, type, actorId, actorRole, payload (JSON), prevHash, hash, public, createdAt }`
- `hash = sha256(prevHash + canonicalJSON(payload) + createdAt)`; `seq` increases per challenge (a hash chain).
- Written **only** by the transition service, inside the same transaction as the change.
- **Public view:** the challenge timeline (submitted, verified, proposal selected, funds committed, milestone verified, tranche released, resolved, credentials issued).
- **Admin view:** the full audit log of all entries, with filters.
- **Verify:** recompute the chain and highlight the first broken link. The seed includes **one deliberately tampered entry** to demo this.
- Drop the "Section 65B compliant" and "immutable" claims; say "tamper-evident".

---

## 8. Data model (38 tables → about 16)

| Model | Purpose |
|---|---|
| `State`, `District` | All Indian states/UTs and districts (from the LGD list), with centroid lat/lng and the state's SDG Index score |
| `User` | name, email, password hash, role, `districtId` (officers), active flag |
| `Organization` | type `UNIVERSITY \| NGO \| CSR`, name, state, district, registration no., verification status, invite code (universities), SDG expertise, departments |
| `Membership` | user ↔ organization (role in org: `FACULTY \| STUDENT \| MEMBER`) |
| `Challenge` | the spine: title, description, category, severity, state, district, lat/lng, status, SDG tags, AI confidence, reporter, `mergedIntoId`, verified beneficiaries, citizen rating |
| `Endorsement` | citizen "me too" (unique per user and challenge) |
| `Attachment` | file URL, SHA-256, mime, size, owner, linked to a challenge or milestone |
| `Proposal` | challenge, university, NGO partner?, approach, timeline, budget, IP declaration, status |
| `ProposalMember` | proposal ↔ student/faculty, role |
| `Milestone` | proposal, title, due date, amount, status, report, GPS, NGO attestation |
| `MilestoneHours` | milestone ↔ student, hours |
| `FundingCommitment` | CSR org, proposal, amount |
| `Disbursement` | commitment, milestone, amount, released at |
| `Credential` | student, challenge, hours, credits, rating, hash (unique per student + challenge) |
| `Notification` | user, message, link, read |
| `LedgerEntry` | see section 7 |

**Removed:** Donor*, Corporate* summary tables, GeoImpactSummary, GovernmentInsights/Alerts, ImpactScore history tables, Project/ProjectActivity/Donation/CSRAllocation, Volunteer*. Aggregates are **computed by queries** (with a cache only if needed).

One fresh migration replaces `001_init`.

---

## 9. Screens per role

**Public (no login)**
- `/` landing: an India map with live pins + real counts + the hero story + "Report a problem".
- `/challenges` public list (filter by state, SDG, status) — this is what "Live Challenges" should open.
- `/challenges/[id]` public page: timeline, ledger, team, funding progress, proof photos, "Endorse".
- `/organizations` and `/organizations/[id]`: verified organisations with score breakdowns.
- `/verify/[credentialId]` credential check with QR.
- `/login`, `/register`.

**Citizen:** My reports · Report a problem (wizard) · Confirm & rate fixes.
**Officer:** Queue (sorted by priority, with overdue flags) · Challenge review (verify/merge/reject, edit tags) · Proposals to select · Milestone proof to verify · District map · District stats.
**Faculty:** Matched challenges inbox · Proposal builder (team + milestones + budget) · My projects (milestone board, proof upload) · Issue credentials · Invite code for students.
**Student:** My teams · Log hours and upload proof (when allowed) · My credits and credentials.
**NGO:** Partner invitations · Field attestations · Organisation profile and score.
**CSR:** Proposals needing funding (with match to the company's SDG focus) · My commitments · Tranches to release · CSR compliance (2%) · Portfolio impact.
**Admin:** Organisations to verify · Officers · Audit log.

Every dashboard opens with **"Needs your action"** (driven by `allowedActions`), then context. A single layout and sidebar per role; no duplicate tabs.

---

## 10. API surface (all behind `withAuth(roles)` unless public)

```
POST /api/auth/register | login | logout      GET /api/auth/me
GET  /api/regions                              (states + districts)
GET  /api/challenges            (public list, filters)
GET  /api/challenges/:id        (public detail + allowedActions for viewer)
POST /api/challenges            (citizen)      POST /api/challenges/check-duplicate
POST /api/challenges/:id/endorse
POST /api/challenges/:id/actions   { action: VERIFY|REJECT|MERGE|SELECT_PROPOSAL|CONFIRM|DISPUTE|CLOSE, ... }
GET  /api/challenges/:id/matches   (officer/faculty: ranked universities with explanation)
POST /api/proposals              GET /api/proposals?mine=1
POST /api/milestones/:id/submit | verify | reject
POST /api/funding/commit         POST /api/funding/release   (milestoneId)
POST /api/credentials/issue      GET /api/credentials/:id   (public, masked; 404 if unknown)
GET  /api/ledger/:challengeId    GET /api/ledger/:challengeId/verify
GET  /api/stats?scope=india|state|district   (all landing/dashboard numbers)
GET  /api/organizations | /:id   POST /api/admin/organizations/:id/verify
GET  /api/notifications          POST /api/notifications/read
POST /api/uploads                (signed upload; server re-hashes)
GET  /api/cron/daily             (Vercel Cron + CRON_SECRET: overdue flags, score refresh)
```
About 30 routes instead of ~100. All input validated with the existing `server/validators` style; all errors go through the existing `handleApiError`.

---

## 11. New features (you gave me liberty; each one closes a real gap)

| Feature | Why it matters | Size |
|---|---|---|
| **Endorse ("me too")** | Replaces duplicate reports with a demand signal; feeds priority | S |
| **Citizen closure + rating** | Closes the loop; replaces the hardcoded community score | S |
| **Competing proposals** | Officer chooses among universities; makes matching meaningful | M |
| **Co-funding by several CSR funders** | Realistic CSR behaviour; funding progress bar | M |
| **Milestone-linked tranches** | The "money follows proof" story, actually enforced | M |
| **Priority queue + SLA overdue flags** | Gives officers a reason to act; visible accountability | S |
| **Tamper-evident hash chain + tamper demo** | A provable claim instead of a marketing claim | M |
| **Credential QR + verify page (Valid/Tampered/Not found)** | Shareable proof for students | S |
| **University invite codes** | Students can't claim membership falsely | S |
| **Public challenge pages** | Shareable; transparency without login | M |
| **India map with state drill-down** | Pan-India story at a glance | M |
| *Stretch:* Hindi UI toggle | Real accessibility for citizens | M |
| *Stretch:* public pledge support | Light replacement for the donor role | S |

---

## 12. Design direction (not the AI template)

- **Feel:** a civic newspaper. Light, paper-like background (`#FAF8F3`-ish), ink-dark text, generous whitespace, real hierarchy.
- **Type:** a characterful serif for headlines (Fraunces or Instrument Serif) + IBM Plex Sans for UI and tabular numbers.
- **Colour has meaning:** the **17 official SDG colours** are the only accents, so a colour always means a goal. Status colours: neutral grey, amber (waiting), blue (active), green (resolved), red (rejected/disputed). No gradients, no glow.
- **Components:** dense tables, a status timeline, "Needs your action" lists, honest empty states ("No reports in your district yet"), skeleton loaders (never 0-then-jump).
- **Icons:** lucide only; no emoji in UI chrome.
- **Imagery:** only real uploaded proof photos; organisations show initials or uploaded logos. No stock photos.
- **Map:** Leaflet + OpenStreetMap tiles (no API key) + India states GeoJSON (DataMeet, open licence), pins by GPS.
- **One theme** across public and dashboard pages; dark mode optional later.
- **Accessibility:** real `<button>`s, focus rings, AA contrast, labelled inputs, keyboard navigation.
- **Remove:** Spline 3D scene, animated counters, "Operating System for…" copy, internal labels (P8, Screen 3), fake activity logs, legal claims, dead buttons.

---

## 13. Demo data: one believable story, seeded the same every time

**Hero case — "Fluoride in Nalgonda's borewells" (Telangana)**
1. A citizen in a Nalgonda village reports fluoride-affected water with photos; 23 neighbours endorse.
2. The district officer verifies it (SDG 6, 3) within 2 days.
3. Three universities submit proposals; the officer picks a fictional "Deccan Institute of Technology" proposal (low-cost bone-char filters, 16 weeks, ₹6.4 lakh, 4 milestones), with a fictional NGO field partner.
4. Two CSR funders co-fund (₹4 lakh + ₹2.4 lakh).
5. Milestones: water survey → prototype → 12 village units installed → 3-month water quality report; each with photos, hours and verification; tranches released one by one.
6. The citizen confirms and rates 5/5; the officer records 2,140 verified beneficiaries.
7. Five students receive credentials (verifiable by QR); one ledger entry in **another** challenge is deliberately tampered for the demo.

**Around it:** 6 states (Telangana, Maharashtra, Assam, Rajasthan, Odisha, Tamil Nadu), ~30 challenges **spread across every status**, 8 universities, 5 NGOs, 4 CSR funders, 6 officers, 40 citizens, 30 students, with dates spread over the last 12 months so charts show real trends. All organisation and person names are **fictional**; place names are real. State SDG Index values are entered from the official NITI Aayog report (not invented).

**Demo accounts:** one per role, emails on a fictional domain (e.g. `officer.nalgonda@demo.sdgnexus.in`), shared demo password documented in the README for local/demo use only.

---

## 14. Reuse map

| Keep and adapt | Rewrite | Delete |
|---|---|---|
| `middleware/challengeStatus.ts` → `server/lifecycle.ts` | `lib/AuthContext.tsx` (cookie session via `/api/auth/me`) | `lib/DataContext.tsx`, `data/mockData.ts` |
| `services/sdgClassifierService.ts` (current model + keyword fallback) | `prisma/schema.prisma` (section 8) | `data/jharkhandDistricts.ts`, `lib/jharkhandCoordinates.ts`, `public/jharkhand-*` |
| `services/smartMatchingService.ts` + inbox `calculateMatchBreakdown` → `server/matching.ts` | `prisma/seed.ts` (section 13) | all `FALLBACK_*` / `HERO_*` lists in API routes |
| `lib/merkle.ts`, `lib/credentials.ts` (hash on bytes/canonical JSON) | `services/deduplicationService.ts` (drop `natural`, add distance check) | `api/donor/*`, `api/corporate/*` fixed-number routes, `api/razorpay` |
| `lib/notifications.ts`, `hooks/useNotifications.ts` | `server/middleware/auth.ts` (`withAuth`, no bypasses) | `services/impactScoring.ts` (dup), `matching.ts` (dup), `duplicateProjectService.ts` (dup) |
| `server/validators`, `errorHandler`, `utils` | `data/povertyIndex.ts` → `State.sdgIndex` | `scripts/verify-*` (12 demo scripts), `components/ui/SplineScene.tsx` |
| `lib/credentialPdf.ts`, `lib/pdfGenerator.ts` | `app/page.tsx` landing | `prisma/migrations/001_init` (replaced) |
| citizen submit wizard + image compression | `dashboard/government/page.tsx` → split pages | packages: `rechart`, `natural`, `react-simple-maps`, `@splinetool/*` |
| `components/Map.tsx` (switch to India GeoJSON + OSM) | `components/ui/Sidebar.tsx` (role menus incl. student) | |
| `RoutingExplainabilityPanel`, `StatCard`, `SDGBarChart` | all dashboards (read real APIs) | |

---

## 15. Build phases (each ends in something that works)

| Phase | Work | Done when |
|---|---|---|
| **0. Clean-up** | Delete the third column above; remove SIH/Jharkhand copy; fix the Policy Insights crash and the fake-verify/fake-track routes right away (they are live) | Build passes; unknown IDs return 404; no "SIH" or "Jharkhand" in `src/` |
| **1. Foundation** | New schema + one migration; regions seed; real auth (bcrypt + JWT in httpOnly cookie); `withAuth`; `middleware.ts` route guards; one `Role` enum | Each demo account logs in for real; wrong role gets 403; `?userId=` tricks fail |
| **2. Lifecycle core** | `lifecycle.ts` transitions + ledger + notifications; challenge submit / verify / merge / endorse; priority queue | A report can go SUBMITTED → OPEN_FOR_PROPOSALS through the API, with ledger entries |
| **3. Proposals, funding, milestones** | Proposal builder with team + milestones; officer selection; CSR commit/co-fund; proof upload (Vercel Blob or R2); verify; tranche release | Hero flow reaches COMPLETED with money matching milestones exactly |
| **4. Closure, credentials, scores** | Citizen confirm/dispute; credentials + QR + verify page; impact score; daily cron | Hero flow reaches RESOLVED; credentials verify; tampered entry is detected |
| **5. Seed + checks** | Hero story + surrounding data; tests (section 16); smoke script | `npm run seed && npm run check` passes from an empty DB |
| **6. Design + screens** | Design system; landing, public pages, role dashboards; India map | Every screen in section 9 works on desktop and mobile with real data |
| **7. Ship** | README + spec rewrite; new Vercel project and fresh database with new credentials; env checks at startup | Demo script (section 17) runs end to end on the deployed URL |

---

## 16. Checks (small, runnable, no test framework)

Using Node's built-in `node:test` through `tsx` (already installed):
- `lifecycle.test.ts`: allowed vs forbidden transitions; wrong role/jurisdiction refused; FUNDED needs full commitment.
- `money.test.ts`: milestone amounts must sum to budget; released never exceeds committed; no release before VERIFIED.
- `ledger.test.ts`: a valid chain verifies; changing one payload breaks verification at that entry.
- `credential.test.ts`: hash round-trip; unknown ID → not found; second issue for the same student and challenge refused.
- `scoring.test.ts`: priority and match scores stay in range and rank a clear case correctly.
- `auth.test.ts`: no token → 401; wrong role → 403; bypass tokens and `?userId=` rejected.
- `scripts/smoke.ts`: drives the hero flow through the API from an empty seeded DB.

---

## 17. The 5-minute demo script (what the examiners see)

1. **Landing:** India map, real numbers, the Nalgonda story timeline.
2. **Citizen:** report a new problem → the duplicate check suggests endorsing an existing one → endorse instead.
3. **Officer:** priority queue with breakdown → verify a report → see ranked universities with explanations.
4. **Faculty:** build a proposal with a team, 4 milestones and a budget that must add up.
5. **CSR:** see the proposal's funding gap → co-fund → later release a tranche for a verified milestone.
6. **Public page:** timeline, photos, ledger → run "Verify chain" → the tampered entry is caught.
7. **Student:** credentials page → open the QR verify page → "Valid". Try a fake ID → "Not found".

---

## 18. Decisions I've taken (change any of them)

- Drop the Donor role; add citizen endorsements instead.
- Team is part of the proposal (no separate team stage).
- File storage: **Vercel Blob** (simplest on Vercel); R2 is the alternative.
- Map: Leaflet + OpenStreetMap tiles + DataMeet India GeoJSON.
- Database: a fresh Postgres (e.g. Neon free tier); the old one is retired.
- AI: keep the keyword classifier as the default so the app works with no API key; an LLM key improves tagging but is optional.
- Light, newspaper-style design with SDG colours.

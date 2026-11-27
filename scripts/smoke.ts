// End-to-end smoke test: drives one report through the whole story using only the public API, as the real roles.
//   report → verify → proposal (team + milestones) → select → fund → proof → verify → release (every tranche)
//   → citizen confirms → officer closes → credential issued → credential verifies → ledger chain valid
// Run against a freshly seeded app:  npx prisma db seed  &&  npm run dev  &&  npm run smoke
// (BASE_URL=https://your-deploy npm run smoke for a deployed copy; it adds one report to that database.)
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo@1234';

async function login(email: string) {
    const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
    assert.equal(r.status, 200, `login ${email}`);
    const cookie = r.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, `session cookie for ${email}`);
    return cookie!;
}

async function call(cookie: string, path: string, method = 'GET', body?: unknown) {
    const r = await fetch(`${BASE}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(json.error ?? json)}`);
    return json.data;
}

const step = (n: number, text: string) => console.log(`${String(n).padStart(2)}. ${text}`);

async function main() {
    const [citizen, officer, faculty, csr] = await Promise.all([
        login('citizen@demo.sdgnexus.in'), login('officer.nalgonda@demo.sdgnexus.in'), login('faculty@demo.sdgnexus.in'), login('csr@demo.sdgnexus.in'),
    ]);
    const act = (who: string, id: string, body: object) => call(who, `/api/challenges/${id}/actions`, 'POST', body);
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const report = await call(citizen, '/api/challenges/submit', 'POST', {
        title: `Smoke test: broken handpump at Chityal (${stamp})`,
        description: 'The only handpump near the primary school has been broken for three weeks; children carry water from far away.',
        category: 'Drinking Water & Sanitation', state: 'Telangana', district: 'Nalgonda', urgency: 'HIGH',
    });
    const id: string = report.challengeId;
    step(1, `citizen reported ${id}`);

    assert.equal((await act(officer, id, { action: 'VERIFY', sdgTags: [6, 3] })).status, 'VALIDATED');
    step(2, 'officer verified it');

    const students = await call(faculty, '/api/students/search?q=');
    assert.ok(students.length >= 2, 'faculty has at least two students');
    const budget = 300000;
    await call(faculty, '/api/hei/proposals', 'POST', {
        challengeId: id, status: 'SUBMITTED', termsAccepted: true, timelineWeeks: 8, budgetRequested: budget,
        approach: 'Survey the site with the school committee, repair the pump, add a soak pit, and train two caretakers.',
        ipDeclaration: 'Open design', members: students.slice(0, 2).map((s: { id: string }) => ({ studentProfileId: s.id })),
        milestones: [{ title: 'Site survey', week: 2, amount: 100000 }, { title: 'Repair and handover', week: 8, amount: 200000 }],
    });
    step(3, 'faculty submitted a plan (2 students, 2 milestones = budget)');

    const proposal = (await call(officer, `/api/challenges/${id}/proposals`))[0];
    assert.deepEqual(proposal.problems, [], 'plan is complete');
    assert.equal((await act(officer, id, { action: 'SELECT_PROPOSAL', proposalId: proposal.id })).status, 'TEAM_FORMED');
    step(4, 'officer selected it; team and milestones created');

    await assert.rejects(act(csr, id, { action: 'COMMIT_FUNDS', amount: budget + 1 }), /still needed/);
    assert.equal((await act(csr, id, { action: 'COMMIT_FUNDS', amount: budget })).status, 'FUNDED');
    step(5, 'CSR committed the full budget (over-commit refused)');

    const project = (await call(faculty, '/api/hei/milestones/projects')).find((p: { challengeId: string }) => p.challengeId === id);
    const teamId: string = project.teamId;
    const milestones: { id: string; amount: number }[] = await call(faculty, `/api/hei/milestones/${teamId}`);
    assert.equal(milestones.length, 2);
    for (const [i, m] of milestones.entries()) {
        await call(faculty, '/api/hei/milestones/submit', 'POST', { teamId, milestoneId: m.id, description: 'Done, photos on file.', proofUrls: [], hours: students.slice(0, 2).map((s: { id: string }) => ({ studentProfileId: s.id, hours: 40 })) });
        await call(officer, `/api/hei/milestones/${teamId}`, 'PATCH', { milestoneId: m.id, status: 'GP_VERIFIED' });
        await assert.rejects(call(csr, `/api/hei/milestones/${teamId}`, 'PATCH', { milestoneId: m.id, status: 'CSR_APPROVED', fundReleased: m.amount + 1 }), /agreed tranche/);
        await call(csr, `/api/hei/milestones/${teamId}`, 'PATCH', { milestoneId: m.id, status: 'CSR_APPROVED', fundReleased: m.amount });
        step(6 + i, `milestone ${i + 1}: proof → verified → ₹${m.amount.toLocaleString('en-IN')} released (wrong amount refused)`);
    }
    const afterWork = await call(citizen, `/api/challenges/${id}/status`);
    assert.equal(afterWork.status, 'COMPLETED');

    await assert.rejects(act(officer, id, { action: 'CLOSE', beneficiaries: 120 }), /Waiting/);
    await act(citizen, id, { action: 'CONFIRM', rating: 5 });
    assert.equal((await act(officer, id, { action: 'CLOSE', beneficiaries: 120 })).status, 'DEPLOYED');
    step(8, 'citizen confirmed (rated 5); officer closed it as resolved (early close refused)');

    const issued = await call(faculty, '/api/hei/credentials/issue', 'POST', {
        projectId: teamId, students: students.slice(0, 2).map((s: { id: string }) => ({ studentProfileId: s.id, creditHours: 60, overallRating: 4 })),
    });
    const cred = await fetch(`${BASE}/api/hei/credentials/${issued.credentialIds[0]}`).then((r) => r.json());
    assert.equal(cred.data.verification.valid, true, 'credential hash verifies');
    step(9, `credentials issued; public verify says valid (${cred.data.creditPoints} credits)`);

    const chain = await call(citizen, '/api/ledger/chain');
    assert.equal(chain.valid, true, 'ledger chain is intact');
    step(10, `ledger chain valid across ${chain.checked} entries`);
    console.log('\nSMOKE PASSED');
}

main().catch((err) => {
    console.error('\nSMOKE FAILED:', err.message ?? err);
    process.exit(1);
});

// Run with: npm run check
// Guards the Phase 2 rules: who may do what from which status, the priority score, and the ledger hash chain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedActions, blockedReason, priority, validatePlan } from './lifecycle';
import { entryHash } from './ledger';

const ch = (status: 'SUBMITTED' | 'VALIDATED' | 'REJECTED', district = 'Nalgonda') => ({ id: 'c1', status, district, submitterId: 'citizen1' });
const officer = (district: string) => ({ id: 'o1', role: 'OFFICER' as const, district: { name: district } });

test('lifecycle: officers act only in their district and only from the right status', () => {
    assert.deepEqual(allowedActions(ch('SUBMITTED'), officer('Nalgonda')).sort(), ['MERGE', 'REJECT', 'VERIFY']);
    assert.deepEqual(allowedActions(ch('SUBMITTED'), officer('Pune')), []);
    assert.deepEqual(allowedActions(ch('VALIDATED'), officer('Nalgonda')).sort(), ['ASSIGN', 'SELECT_PROPOSAL']);
    assert.deepEqual(allowedActions(ch('REJECTED'), officer('Nalgonda')), []);
    assert.deepEqual(allowedActions(ch('SUBMITTED'), { id: 'a', role: 'ADMIN' }).sort(), ['MERGE', 'REJECT', 'VERIFY']);
});

test('lifecycle: citizens endorse others’ open reports, never their own or closed ones', () => {
    assert.deepEqual(allowedActions(ch('SUBMITTED'), { id: 'citizen2', role: 'CITIZEN' }), ['ENDORSE']);
    assert.match(blockedReason('ENDORSE', ch('SUBMITTED'), { id: 'citizen1', role: 'CITIZEN' }) ?? '', /yourself/);
    assert.deepEqual(allowedActions(ch('REJECTED'), { id: 'citizen2', role: 'CITIZEN' }), []);
    assert.match(blockedReason('VERIFY', ch('SUBMITTED'), { id: 'citizen2', role: 'CITIZEN' }) ?? '', /role/);
});

test('priority: urgent, endorsed, long-waiting reports rank higher; overdue after 7 days', () => {
    const now = Date.parse('2026-11-26T00:00:00Z');
    const base = { urgency: 'NORMAL', endorsements: 0, districtOpen: 1, maxDistrictOpen: 10, createdAt: new Date(now - 1 * 86_400_000), status: 'SUBMITTED' as const };
    const low = priority(base, now);
    const high = priority({ ...base, urgency: 'CRITICAL', endorsements: 20, districtOpen: 10, createdAt: new Date(now - 14 * 86_400_000) }, now);
    assert.ok(high.score > low.score);
    assert.equal(high.score, 100);
    assert.equal(low.overdue, false);
    assert.equal(high.overdue, true);
    assert.equal(priority({ ...base, status: 'VALIDATED', createdAt: new Date(now - 30 * 86_400_000) } as never, now).overdue, false, 'only reports awaiting the officer go overdue');
});

test('ledger: chained hashes detect an edited old entry', () => {
    const at = new Date('2026-11-26T10:00:00Z');
    const e1 = { prev_hash: null, actor_id: 'o1', actor_role: 'OFFICER', action: 'CHALLENGE_VERIFY', entity_type: 'Challenge', entity_id: 'c1', previous_value: null, new_value: '{"status":"VALIDATED"}', created_at: at };
    const h1 = entryHash(e1);
    const e2 = { ...e1, prev_hash: h1, action: 'CHALLENGE_ASSIGN', created_at: new Date(at.getTime() + 1000) };
    const h2 = entryHash(e2);
    const edited = entryHash({ ...e1, new_value: '{"status":"REJECTED"}' });
    assert.notEqual(edited, h1, 'editing an entry changes its hash');
    assert.notEqual(entryHash({ ...e2, prev_hash: edited }), h2, 'so the next entry no longer matches either');
});

test('proposal plan: team size, milestone count and amounts that add up exactly to the budget', () => {
    const team = { facultyId: 'f1', members: [{ studentProfileId: 's1' }, { studentProfileId: 's2' }] };
    const ms = [{ title: 'Survey', week: 2, amount: 100000 }, { title: 'Install', week: 8, amount: 200000 }];
    assert.deepEqual(validatePlan(team, ms, 300000, 12), []);
    assert.match(validatePlan(team, ms, 350000, 12).join(' '), /add up to ₹3,00,000/);
    assert.match(validatePlan({ ...team, members: [{ studentProfileId: 's1' }] }, ms, 300000, 12).join(' '), /2–8 students/);
    assert.match(validatePlan({ ...team, members: [{ studentProfileId: 's1' }, { studentProfileId: 's1' }] }, ms, 300000, 12).join(' '), /twice/);
    assert.match(validatePlan(team, [ms[0]], 100000, 12).join(' '), /2–6 milestones/);
    assert.match(validatePlan(team, [{ ...ms[0], week: 20 }, ms[1]], 300000, 12).join(' '), /weeks 1–12/);
});

test('funding and work stages: only CSR commits, work starts once funded', () => {
    const csr = { id: 'k1', role: 'CSR' as const, organizationId: 'org1' };
    assert.deepEqual(allowedActions({ id: 'c', status: 'TEAM_FORMED', district: 'Nalgonda', submitterId: null }, csr), ['COMMIT_FUNDS']);
    assert.deepEqual(allowedActions({ id: 'c', status: 'TEAM_FORMED', district: 'Nalgonda', submitterId: null }, officer('Nalgonda')), []);
    assert.ok(allowedActions({ id: 'c', status: 'FUNDED', district: 'Nalgonda', submitterId: null }, { id: 's', role: 'STUDENT' }).includes('START'));
});

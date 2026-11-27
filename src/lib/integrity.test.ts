// Run with: npm run check
// Guards the integrity logic fixed in Phase 0: if any of these break, verification can lie again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMilestoneHash } from './merkle';
import { computeCredentialHash, creditsForHours, isProjectComplete, blendedRating, milestoneHoursCap } from './credentials';
import { tfidfSimilarities } from '../services/deduplicationService';

test('milestone hash: what submit stores is what verify recomputes', () => {
    // submit route: Date object + numbers; verify route: ISO string from DB + numbers (or '' when no GPS)
    const createdAt = new Date('2026-11-26T10:15:30.123Z');
    const stored = computeMilestoneHash('data:image/jpeg;base64,AAA', createdAt, 17.0544, 79.2671);
    const recomputed = computeMilestoneHash('data:image/jpeg;base64,AAA', createdAt.toISOString(), 17.0544, 79.2671);
    assert.equal(stored, recomputed);
    assert.equal(
        computeMilestoneHash('', createdAt, '', ''),
        computeMilestoneHash('', createdAt.toISOString(), '', ''),
        'a milestone without proof or GPS must still verify',
    );
});

test('milestone hash: any change to the stored record is detected', () => {
    const t = new Date('2026-11-26T10:15:30.123Z');
    const original = computeMilestoneHash('proof.jpg', t, 17.0544, 79.2671);
    assert.notEqual(original, computeMilestoneHash('proof2.jpg', t, 17.0544, 79.2671));
    assert.notEqual(original, computeMilestoneHash('proof.jpg', t, 17.0545, 79.2671));
    assert.notEqual(original, computeMilestoneHash('proof.jpg', new Date(t.getTime() + 1), 17.0544, 79.2671));
});

test('credential hash: deterministic and sensitive to credits', () => {
    const issued = new Date('2026-11-26T00:00:00.000Z');
    const h = computeCredentialHash('student-1', 'challenge-1', 4, issued);
    assert.equal(h, computeCredentialHash('student-1', 'challenge-1', 4, issued.toISOString()));
    assert.notEqual(h, computeCredentialHash('student-1', 'challenge-1', 5, issued));
});

test('credits: 30 verified hours = 1 whole credit', () => {
    assert.equal(creditsForHours(29), 0);
    assert.equal(creditsForHours(30), 1);
    assert.equal(creditsForHours(160), 5);
});

test('project completion: zero milestones is NOT complete', () => {
    assert.equal(isProjectComplete([], 'DEPLOYED'), false);
    assert.equal(isProjectComplete([{ status: 'CSR_APPROVED' }, { status: 'GP_VERIFIED' }], 'DEPLOYED'), false);
    assert.equal(isProjectComplete([{ status: 'CSR_APPROVED' }, { status: 'CSR_APPROVED' }], 'DEPLOYED'), true);
    assert.equal(isProjectComplete([{ status: 'CSR_APPROVED' }, { status: 'CSR_APPROVED' }], 'COMPLETED'), false, 'paid but not yet resolved by the citizen/officer');
    assert.equal(blendedRating(5, 3), 4.6);
    assert.equal(blendedRating(4, null), 4);
    assert.equal(blendedRating(4, 5, 3), 3.8, 'faculty 40 + NGO 40 + citizen 20');
    assert.equal(blendedRating(4, null, 3), 3.5, 'no citizen rating: faculty and NGO only');
    assert.equal(milestoneHoursCap(new Date('2026-01-01'), new Date('2026-01-15')), 80, 'two weeks = 80 hours');
    assert.equal(milestoneHoursCap(new Date('2026-01-10'), new Date('2026-01-01')), 40, 'at least one week');
});

test('duplicate detection: same problem scores higher than an unrelated one', () => {
    const [same, unrelated] = tfidfSimilarities([
        ['fluoride', 'borewell', 'water', 'village'],
        ['fluoride', 'contamination', 'borewell', 'water'],
        ['road', 'monsoon', 'flooding', 'village'],
    ]);
    assert.ok(same > 0.5, `expected a high similarity, got ${same}`);
    assert.ok(unrelated < same, 'unrelated challenge must score lower');
    assert.deepEqual(tfidfSimilarities([[], ['water']]), [0]);
});

test('university score: only resolved work counts, missing parts are left out, never invented', async () => {
    const { universityScore, median } = await import('./universityScore');
    const due = new Date('2026-06-01');
    const p = (rating: number | null, onTime: boolean) => ({
        budget: 400000, verifiedBeneficiaries: 800, citizenRating: rating, areaNeed: null as number | null,
        milestones: [{ dueDate: due, submittedAt: new Date(onTime ? '2026-05-20' : '2026-06-10'), sealed: true, hasProof: true }],
    });
    assert.equal(universityScore([], 100), null, 'no score before the first resolution');
    const good = universityScore([p(5, true)], 200)!;
    assert.equal(good.breakdown.onTime, 100);
    assert.equal(good.breakdown.satisfaction, 100);
    assert.equal(good.breakdown.reach, 50, '200 people per lakh at the median scores 50');
    assert.ok(good.score! > universityScore([p(2, false)], 200)!.score!);
    assert.equal(universityScore([p(null, true)], 200)!.breakdown.satisfaction, null, 'no rating = left out');
    assert.equal(good.breakdown.areaNeed, null, 'unknown state index = left out');
    assert.equal(universityScore([{ ...p(5, true), areaNeed: 0.5 }], 200)!.breakdown.areaNeed, 50);
    assert.equal(median([3, 1, 2]), 2);
});

test('CSR obligation: Indian financial year and 2% of average net profit', async () => {
    const { financialYear, csrObligation } = await import('./csr');
    assert.equal(financialYear(new Date(2026, 2, 31)).label, '2025-26', '31 March belongs to the year that started last April');
    assert.equal(financialYear(new Date(2026, 3, 1)).label, '2026-27');
    assert.deepEqual(csrObligation(15_00_00_000, 10_00_000), { required: 30_00_000, released: 10_00_000, remaining: 20_00_000, met: false });
    assert.equal(csrObligation(null, 5), null, 'no profit entered = no obligation shown');
});

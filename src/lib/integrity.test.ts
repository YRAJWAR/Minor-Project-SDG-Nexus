// Run with: npm run check
// Guards the integrity logic fixed in Phase 0: if any of these break, verification can lie again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMilestoneHash } from './merkle';
import { computeCredentialHash, creditsForHours, isProjectComplete } from './credentials';
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
    assert.equal(isProjectComplete([]), false);
    assert.equal(isProjectComplete([{ status: 'CSR_APPROVED' }, { status: 'GP_VERIFIED' }]), false);
    assert.equal(isProjectComplete([{ status: 'CSR_APPROVED' }, { status: 'CSR_APPROVED' }]), true);
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

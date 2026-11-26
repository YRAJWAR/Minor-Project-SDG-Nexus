// Run with: npm run check
// Guards the Phase 1 access rules that need no database: signed sessions and the page guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { SESSION_COOKIE, signSession, readSession, requireUser } from './middleware/auth';

const visit = (path: string, token?: string) =>
    proxy(new NextRequest(`http://localhost${path}`, token ? { headers: { cookie: `${SESSION_COOKIE}=${token}` } } : {}));

test('sessions: a signed token reads back; forged or tampered ones do not', () => {
    const token = signSession({ id: 'u1', role: 'FACULTY' });
    assert.deepEqual(readSession(token), { sub: 'u1', role: 'FACULTY' });
    assert.equal(readSession(jwt.sign({ sub: 'u1', role: 'ADMIN' }, 'some-other-secret-that-is-long-enough')), null);
    assert.equal(readSession(token.slice(0, -2) + 'xx'), null);
});

test('page guard: signed-out → login, wrong role → own dashboard, right role → through', () => {
    assert.equal(visit('/dashboard/government').headers.get('location'), 'http://localhost/login?next=%2Fdashboard%2Fgovernment');
    const student = signSession({ id: 's1', role: 'STUDENT' });
    assert.equal(visit('/dashboard/hei', student).headers.get('location'), 'http://localhost/dashboard');
    assert.equal(visit('/dashboard/hei/milestones', student).headers.get('location'), null);
    assert.equal(visit('/dashboard/government', signSession({ id: 'a1', role: 'ADMIN' })).headers.get('location'), null);
});

test('API guard: no session cookie → 401', async () => {
    const res = await requireUser(new NextRequest('http://localhost/api/notifications'), ['OFFICER']);
    assert.ok(!('id' in res));
    assert.equal((res as Response).status, 401);
});

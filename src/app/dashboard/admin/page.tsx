'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Org { id: string; name: string; type: string; state: string; district: string | null; registration_number: string | null; verification_status: string; created_at: string; members: number }
interface Officer { id: string; name: string; email: string; district: string | null; state: string | null }
interface Region { name: string; districts: string[] }

const STATUS_STYLE: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
    VERIFIED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    REJECTED: 'bg-rose-50 text-rose-800 border-rose-200',
};

export default function AdminPage() {
    const [orgs, setOrgs] = useState<Org[] | null>(null);
    const [officers, setOfficers] = useState<Officer[] | null>(null);
    const [regions, setRegions] = useState<Region[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [form, setForm] = useState({ name: '', email: '', state: '', district: '', password: '' });

    const load = useCallback(() => {
        fetch('/api/admin/organizations', { cache: 'no-store' }).then((r) => r.json()).then((j) => setOrgs(j.success ? j.data : [])).catch(() => setOrgs([]));
        fetch('/api/admin/officers', { cache: 'no-store' }).then((r) => r.json()).then((j) => setOfficers(j.success ? j.data : [])).catch(() => setOfficers([]));
    }, []);
    useEffect(() => {
        load();
        fetch('/api/regions').then((r) => r.json()).then((j) => j.success && setRegions(j.data)).catch(() => {});
    }, [load]);

    const call = async (key: string, url: string, method: string, body: object, ok: string) => {
        setBusy(key);
        setMessage(null);
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then((r) => r.json()).catch(() => ({ success: false, error: 'Could not reach the server.' }));
        setBusy(null);
        setMessage(res.success ? { ok: true, text: ok } : { ok: false, text: res.error ?? 'Could not save.' });
        if (res.success) load();
        return res.success as boolean;
    };

    const createOfficer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await call('officer', '/api/admin/officers', 'POST', form, `Created an officer account for ${form.name} (${form.district}). Give them the first password in person.`)) {
            setForm({ name: '', email: '', state: '', district: '', password: '' });
        }
    };

    const pending = orgs?.filter((o) => o.verification_status === 'PENDING').length ?? 0;
    const districts = regions.find((r) => r.name === form.state)?.districts ?? [];
    const input = 'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm';

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--color-ink)]">Administration</h1>
                <p className="text-sm text-[var(--color-ink-muted)] mt-0.5">Approve organisations, add district officers. Every decision is written to the <Link href="/dashboard/ledger" className="underline">activity ledger</Link>.</p>
            </div>

            {message && <p role="status" className={`text-sm rounded-lg px-3 py-2 border ${message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{message.text}</p>}

            <section className="glass-card p-6" aria-labelledby="orgs-title">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                    <h2 id="orgs-title" className="text-lg font-semibold text-slate-900">NGOs and CSR partners</h2>
                    {orgs && <span className="text-sm text-slate-500">{pending} waiting for approval</span>}
                </div>
                <p className="text-xs text-slate-500 mb-4">A new organisation stays pending until approved. Pending CSR partners cannot commit funds; pending NGOs cannot be chosen as field partners.</p>
                {orgs === null ? <p className="text-sm text-slate-400">Loading…</p> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                                    <th className="py-2 pr-3 font-medium">Organisation</th><th className="py-2 pr-3 font-medium">Type</th><th className="py-2 pr-3 font-medium">Place</th>
                                    <th className="py-2 pr-3 font-medium">Accounts</th><th className="py-2 pr-3 font-medium">Status</th><th className="py-2 font-medium"><span className="sr-only">Decision</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {orgs.map((o) => (
                                    <tr key={o.id}>
                                        <td className="py-2 pr-3 text-slate-900">{o.name}{o.registration_number && <span className="block text-xs text-slate-500">Reg. {o.registration_number}</span>}</td>
                                        <td className="py-2 pr-3 text-slate-600">{o.type === 'CORPORATE' ? 'CSR' : 'NGO'}</td>
                                        <td className="py-2 pr-3 text-slate-600">{[o.district, o.state].filter(Boolean).join(', ')}</td>
                                        <td className="py-2 pr-3 text-slate-600">{o.members}</td>
                                        <td className="py-2 pr-3"><span className={`text-xs px-2 py-0.5 rounded border ${STATUS_STYLE[o.verification_status] ?? ''}`}>{o.verification_status.toLowerCase()}</span></td>
                                        <td className="py-2 text-right whitespace-nowrap">
                                            {o.verification_status !== 'VERIFIED' && (
                                                <button type="button" disabled={busy === o.id} onClick={() => call(o.id, '/api/admin/organizations', 'PATCH', { id: o.id, status: 'VERIFIED' }, `Approved ${o.name}.`)}
                                                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Approve</button>
                                            )}
                                            {o.verification_status === 'PENDING' && (
                                                <button type="button" disabled={busy === o.id} onClick={() => call(o.id, '/api/admin/organizations', 'PATCH', { id: o.id, status: 'REJECTED' }, `Rejected ${o.name}.`)}
                                                    className="ml-2 px-3 py-1 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Reject</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="glass-card p-6" aria-labelledby="officers-title">
                <h2 id="officers-title" className="text-lg font-semibold text-slate-900 mb-1">District officers</h2>
                <p className="text-xs text-slate-500 mb-4">Officers cannot sign themselves up. Each one acts only in their own district.</p>
                <form onSubmit={createOfficer} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end mb-5">
                    <label className="text-xs text-slate-600 flex flex-col gap-1 md:col-span-1">Full name<input required className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                    <label className="text-xs text-slate-600 flex flex-col gap-1 md:col-span-1">Email<input required type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                    <label className="text-xs text-slate-600 flex flex-col gap-1">State
                        <select required className={input} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value, district: '' })}>
                            <option value="">Choose…</option>{regions.map((r) => <option key={r.name}>{r.name}</option>)}
                        </select>
                    </label>
                    <label className="text-xs text-slate-600 flex flex-col gap-1">District
                        <select required className={input} value={form.district} disabled={!form.state} onChange={(e) => setForm({ ...form, district: e.target.value })}>
                            <option value="">Choose…</option>{districts.map((d) => <option key={d}>{d}</option>)}
                        </select>
                    </label>
                    <label className="text-xs text-slate-600 flex flex-col gap-1">First password<input required type="password" minLength={8} autoComplete="new-password" className={input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
                    <button type="submit" disabled={busy === 'officer'} className="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Add officer</button>
                </form>
                {officers === null ? <p className="text-sm text-slate-400">Loading…</p> : (
                    <ul className="divide-y divide-slate-100 text-sm">
                        {officers.map((o) => (
                            <li key={o.id} className="py-2 flex flex-wrap justify-between gap-2">
                                <span className="text-slate-900">{o.name} <span className="text-slate-500">· {o.email}</span></span>
                                <span className="text-slate-600">{[o.district, o.state].filter(Boolean).join(', ') || 'No district'}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

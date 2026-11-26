'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface OpenProject {
    id: string; title: string; place: string; status: string; university: string; budget: number; timelineWeeks: number;
    committed: number; gap: number; mine: { amount: number; released: number } | null; funders: { name: string; amount: number }[];
    milestones: { title: string; week: number; amount: number }[];
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// CSR partners commit to selected university plans until each budget is covered (COMMIT_FUNDS in the lifecycle).
export default function FundingQueue() {
    const [items, setItems] = useState<OpenProject[] | null>(null);
    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const load = useCallback(() => {
        fetch('/api/funding/open', { cache: 'no-store' }).then((r) => r.json()).then((j) => setItems(j.success ? j.data : [])).catch(() => setItems([]));
    }, []);
    useEffect(load, [load]);

    const commit = async (p: OpenProject) => {
        const amount = Number(amounts[p.id] ?? p.gap);
        setBusy(p.id);
        setMessage(null);
        const res = await fetch(`/api/challenges/${p.id}/actions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'COMMIT_FUNDS', amount }),
        }).then((r) => r.json()).catch(() => ({ success: false, error: 'Could not reach the server.' }));
        setBusy(null);
        setMessage(res.success ? { ok: true, text: `Committed ${inr(amount)} to “${p.title}”.${res.data.status === 'FUNDED' ? ' It is now fully funded.' : ''}` } : { ok: false, text: res.error ?? 'Could not commit.' });
        if (res.success) load();
    };

    const needing = items?.filter((p) => p.gap > 0) ?? [];
    const funded = items?.filter((p) => p.mine) ?? [];

    return (
        <section className="glass-card p-6" aria-labelledby="fq-title">
            <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 id="fq-title" className="text-lg font-semibold text-slate-900">University projects needing funding</h2>
                {items && <span className="text-sm text-slate-500">{needing.length} open</span>}
            </div>
            <p className="text-xs text-slate-500 mb-4">Each has a district-approved plan with milestones. Money is released per milestone, only after the officer verifies it.</p>
            {message && <p role="status" className={`mb-3 text-sm rounded-lg px-3 py-2 border ${message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{message.text}</p>}
            {items === null ? <p className="text-sm text-slate-400">Loading…</p> : needing.length === 0 ? (
                <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">No project is waiting for funding right now.</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {needing.map((p) => (
                        <li key={p.id} className="py-3 flex flex-col md:flex-row md:items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <Link href={`/track/${p.id}`} className="text-sm font-semibold text-slate-900 hover:underline">{p.title}</Link>
                                <p className="text-xs text-slate-500">{p.place} · {p.university} · {p.timelineWeeks} weeks · {p.milestones.length} milestones</p>
                                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                                    <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, (p.committed / p.budget) * 100)}%` }} />
                                </div>
                                <p className="text-xs text-slate-500 mt-1">{inr(p.committed)} of {inr(p.budget)} committed · <strong className="text-slate-700">{inr(p.gap)} needed</strong>{p.funders.length ? ` · by ${p.funders.map((f) => f.name).join(', ')}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <label htmlFor={`fq-${p.id}`} className="text-xs text-slate-500">₹</label>
                                <input id={`fq-${p.id}`} type="number" min={1} max={p.gap} inputMode="numeric" className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                                    value={amounts[p.id] ?? String(p.gap)} onChange={(e) => setAmounts((a) => ({ ...a, [p.id]: e.target.value }))} />
                                <button type="button" disabled={busy === p.id || !(Number(amounts[p.id] ?? p.gap) > 0)} onClick={() => commit(p)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Commit funds</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {funded.length > 0 && (
                <p className="mt-4 text-xs text-slate-500">
                    Your commitments: {funded.map((p) => `${p.title} — ${inr(p.mine!.amount)} (${inr(p.mine!.released)} released)`).join(' · ')}
                </p>
            )}
        </section>
    );
}

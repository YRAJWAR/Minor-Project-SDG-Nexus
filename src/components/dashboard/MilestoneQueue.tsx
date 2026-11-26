'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface QueueItem {
    id: string; projectId: string; title: string; description: string; status: 'SUBMITTED' | 'GP_VERIFIED';
    submittedAt: string; sealed: boolean; challengeTitle: string; place: string; university: string; suggestedRelease: number;
}

// Officer: verify or reject submitted milestones. CSR: release funds for verified ones.
// Every action goes through PATCH /api/hei/milestones/[projectId], which enforces role and jurisdiction.
export default function MilestoneQueue({ mode }: { mode: 'officer' | 'csr' }) {
    const [items, setItems] = useState<QueueItem[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<string | null>(null);

    const load = useCallback(() => {
        fetch('/api/milestones/queue', { cache: 'no-store' })
            .then((r) => r.json())
            .then((j) => setItems(j.success ? j.data.filter((m: QueueItem) => (mode === 'officer' ? m.status === 'SUBMITTED' : m.status === 'GP_VERIFIED')) : []))
            .catch(() => setItems([]));
    }, [mode]);
    useEffect(load, [load]);

    const act = async (m: QueueItem, status: 'GP_VERIFIED' | 'REJECTED' | 'CSR_APPROVED') => {
        setBusy(m.id);
        setMessage(null);
        const fundReleased = status === 'CSR_APPROVED' ? Number(amounts[m.id] ?? m.suggestedRelease) : undefined;
        const res = await fetch(`/api/hei/milestones/${m.projectId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ milestoneId: m.id, status, fundReleased }),
        }).then((r) => r.json()).catch(() => ({ success: false, error: 'Could not reach the server.' }));
        setBusy(null);
        if (!res.success) return setMessage(res.error ?? 'Action failed.');
        setMessage(status === 'CSR_APPROVED' ? `Released ₹${fundReleased!.toLocaleString('en-IN')} for “${m.title}”.` : status === 'GP_VERIFIED' ? `Verified “${m.title}”. The CSR partner can now release funds.` : `Sent “${m.title}” back to the team.`);
        load();
    };

    const heading = mode === 'officer' ? 'Milestones waiting for your verification' : 'Verified milestones ready for fund release';

    return (
        <section className="glass-card p-6" aria-labelledby={`mq-${mode}`}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 id={`mq-${mode}`} className="text-lg font-semibold text-slate-900">{heading}</h2>
                {items && <span className="text-sm text-slate-500">{items.length} waiting</span>}
            </div>
            <p className="text-xs text-slate-500 mb-4">
                {mode === 'officer' ? 'Check the proof and location, then verify or send back.' : 'The district officer has verified these on the ground.'}
            </p>
            {message && <p role="status" className="mb-3 text-sm rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2">{message}</p>}
            {items === null ? (
                <p className="text-sm text-slate-400">Loading…</p>
            ) : items.length === 0 ? (
                <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">Nothing waiting right now.</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {items.map((m) => (
                        <li key={m.id} className="py-3 flex flex-col md:flex-row md:items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{m.title}</p>
                                <p className="text-xs text-slate-500 truncate">{m.challengeTitle} · {m.place} · {m.university}</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Submitted {new Date(m.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                    {' · '}{m.sealed ? 'hash sealed' : 'not sealed'}
                                    {' · '}<Link href={`/project/${m.projectId}/ledger`} className="text-blue-600 hover:underline">ledger</Link>
                                </p>
                            </div>
                            {mode === 'officer' ? (
                                <div className="flex gap-2 shrink-0">
                                    <button type="button" disabled={busy === m.id} onClick={() => act(m, 'REJECTED')} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Send back</button>
                                    <button type="button" disabled={busy === m.id} onClick={() => act(m, 'GP_VERIFIED')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Verify</button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 shrink-0">
                                    <label className="text-xs text-slate-500" htmlFor={`amt-${m.id}`}>₹</label>
                                    <input id={`amt-${m.id}`} type="number" min={1} inputMode="numeric" className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                                        value={amounts[m.id] ?? String(m.suggestedRelease)} onChange={(e) => setAmounts((a) => ({ ...a, [m.id]: e.target.value }))} />
                                    <button type="button" disabled={busy === m.id || !(Number(amounts[m.id] ?? m.suggestedRelease) > 0)} onClick={() => act(m, 'CSR_APPROVED')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Release funds</button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

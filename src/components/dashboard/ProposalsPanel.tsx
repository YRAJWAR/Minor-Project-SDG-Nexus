'use client';

import React, { useEffect, useState } from 'react';

interface Proposal {
    id: string; status: string; university: string; universityDistrict: string; naac: string | null; approach: string;
    timelineWeeks: number; budget: number; aiQualityScore: number | null; faculty: string | null; team: string[]; ngoPartner?: { name: string; status: string | null } | null;
    milestones: { title: string; week: number; amount: number }[]; problems: string[];
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// Officer compares the universities' proposals for one report and selects one (SELECT_PROPOSAL in the lifecycle).
export default function ProposalsPanel({ challengeId, onSelected }: { challengeId: string; onSelected: () => void }) {
    const [items, setItems] = useState<Proposal[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/challenges/${challengeId}/proposals`, { cache: 'no-store' }).then((r) => r.json())
            .then((j) => (j.success ? setItems(j.data) : (setItems([]), setError(j.error)))).catch(() => setItems([]));
    }, [challengeId]);

    const select = async (p: Proposal) => {
        if (!window.confirm(`Select ${p.university}'s plan (${inr(p.budget)}, ${p.timelineWeeks} weeks)? Other proposals will be declined.`)) return;
        setBusy(true);
        setError(null);
        const res = await fetch(`/api/challenges/${challengeId}/actions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'SELECT_PROPOSAL', proposalId: p.id }),
        }).then((r) => r.json()).catch(() => ({ success: false, error: 'Could not reach the server.' }));
        setBusy(false);
        if (res.success) onSelected();
        else setError(res.error ?? 'Could not select this proposal.');
    };

    if (items === null) return <p className="text-xs text-slate-400">Loading proposals…</p>;
    return (
        <div className="space-y-2">
            {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2">{error}</p>}
            {items.length === 0 && <p className="text-xs text-slate-500">No university has submitted a proposal yet.</p>}
            {items.map((p) => (
                <details key={p.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
                    <summary className="cursor-pointer font-semibold text-slate-800">
                        {p.university} · {inr(p.budget)} · {p.timelineWeeks} wk{p.aiQualityScore ? ` · quality ${Math.round(p.aiQualityScore * 100)}` : ''}{p.status !== 'SUBMITTED' ? ` · ${p.status.toLowerCase()}` : ''}
                    </summary>
                    <p className="mt-2 text-slate-600 whitespace-pre-line">{p.approach}</p>
                    <p className="mt-2 text-slate-700"><strong>Lead:</strong> {p.faculty ?? '—'} · <strong>Team:</strong> {p.team.join(', ') || '—'}</p>
                    {p.ngoPartner && <p className="text-slate-700"><strong>NGO field partner:</strong> {p.ngoPartner.name} <span className={p.ngoPartner.status === 'ACCEPTED' ? 'text-emerald-700' : p.ngoPartner.status === 'DECLINED' ? 'text-rose-700' : 'text-amber-700'}>({p.ngoPartner.status === 'ACCEPTED' ? 'accepted' : p.ngoPartner.status === 'DECLINED' ? 'declined' : 'invited, not yet answered'})</span></p>}
                    <ol className="mt-1 list-decimal pl-5 text-slate-700">
                        {p.milestones.map((m, i) => <li key={i}>{m.title} — week {m.week}, {inr(m.amount)}</li>)}
                    </ol>
                    {p.problems.length > 0 && <p className="mt-2 text-amber-700">Incomplete: {p.problems.join(' ')}</p>}
                    {(p.status === 'SUBMITTED' || p.status === 'UNDER_REVIEW') && (
                        <button type="button" disabled={busy || p.problems.length > 0} onClick={() => select(p)}
                            className="mt-2 w-full py-1.5 rounded-lg font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">Select this plan</button>
                    )}
                </details>
            ))}
        </div>
    );
}

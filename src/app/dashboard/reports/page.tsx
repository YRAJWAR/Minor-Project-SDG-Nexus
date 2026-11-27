'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Report {
    id: string; title: string; place: string; status: string; createdAt: string; updatedAt: string; supporters: number;
    university: string | null; rejectReason: string | null; mergedIntoId: string | null; verifiedBeneficiaries: number | null; needsYou: boolean;
}

// Plain words for each stage, from the citizen's side.
const STAGE: Record<string, { label: string; tone: string }> = {
    SUBMITTED: { label: 'Received', tone: 'bg-slate-100 text-slate-700' },
    AI_PROCESSED: { label: 'Waiting for the district officer', tone: 'bg-amber-50 text-amber-800' },
    VALIDATED: { label: 'Verified, open to universities', tone: 'bg-blue-50 text-blue-800' },
    UNIVERSITY_ASSIGNED: { label: 'University invited', tone: 'bg-blue-50 text-blue-800' },
    TEAM_FORMED: { label: 'Plan chosen, raising funds', tone: 'bg-blue-50 text-blue-800' },
    FUNDED: { label: 'Funded, work starting', tone: 'bg-blue-50 text-blue-800' },
    IN_PROGRESS: { label: 'Work in progress', tone: 'bg-blue-50 text-blue-800' },
    COMPLETED: { label: 'Work finished', tone: 'bg-amber-50 text-amber-800' },
    DEPLOYED: { label: 'Resolved', tone: 'bg-emerald-50 text-emerald-800' },
    REJECTED: { label: 'Not accepted', tone: 'bg-rose-50 text-rose-800' },
    MERGED: { label: 'Joined with another report', tone: 'bg-slate-100 text-slate-700' },
};
const when = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function List({ items, empty }: { items: Report[]; empty: string }) {
    if (!items.length) return <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">{empty}</p>;
    return (
        <ul className="divide-y divide-slate-100">
            {items.map((r) => {
                const s = STAGE[r.status] ?? { label: r.status, tone: 'bg-slate-100 text-slate-700' };
                return (
                    <li key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex-1 min-w-0">
                            <Link href={`/track/${r.mergedIntoId ?? r.id}`} className="text-sm font-semibold text-slate-900 hover:underline">{r.title}</Link>
                            <p className="text-xs text-slate-500">
                                {r.place} · reported {when(r.createdAt)} · last change {when(r.updatedAt)} · {r.supporters} supporter{r.supporters === 1 ? '' : 's'}
                                {r.university ? ` · ${r.university}` : ''}
                                {r.verifiedBeneficiaries ? ` · ${r.verifiedBeneficiaries.toLocaleString('en-IN')} people helped` : ''}
                            </p>
                            {r.rejectReason && <p className="text-xs text-rose-700 mt-0.5">Reason: {r.rejectReason}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded ${s.tone}`}>{s.label}</span>
                            {r.needsYou && <Link href={`/track/${r.id}`} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700">Confirm or dispute the fix</Link>}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export default function MyReportsPage() {
    const [data, setData] = useState<{ reported: Report[]; supported: Report[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        fetch('/api/me/reports', { cache: 'no-store' }).then((r) => r.json())
            .then((j) => (j.success ? setData(j.data) : setError(j.error ?? 'Could not load your reports.')))
            .catch(() => setError('Could not reach the server.'));
    }, []);
    const waiting = data?.reported.filter((r) => r.needsYou) ?? [];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--color-ink)]">My reports</h1>
                    <p className="text-sm text-[var(--color-ink-muted)] mt-0.5">What you reported, what you support, and what is waiting on you.</p>
                </div>
                <Link href="/citizen/submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700">Report a problem</Link>
            </div>
            {error && <p role="alert" className="text-sm rounded-lg px-3 py-2 border bg-rose-50 border-rose-200 text-rose-800">{error}</p>}
            {!data && !error && <p className="text-sm text-slate-400">Loading…</p>}
            {data && (
                <>
                    {waiting.length > 0 && (
                        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4" aria-labelledby="needs-you">
                            <h2 id="needs-you" className="text-sm font-semibold text-amber-900">Waiting on you ({waiting.length})</h2>
                            <p className="text-xs text-amber-800 mb-2">The work is finished and paid for, except a part held back until you say whether the problem is really fixed.</p>
                            <List items={waiting} empty="" />
                        </section>
                    )}
                    <section className="glass-card p-6" aria-labelledby="reported">
                        <h2 id="reported" className="text-lg font-semibold text-slate-900 mb-3">Reported by you ({data.reported.length})</h2>
                        <List items={data.reported} empty="You have not reported a problem yet." />
                    </section>
                    <section className="glass-card p-6" aria-labelledby="supported">
                        <h2 id="supported" className="text-lg font-semibold text-slate-900 mb-1">You support ({data.supported.length})</h2>
                        <p className="text-xs text-slate-500 mb-3">Reports where you said “this affects me too”. You hear when they are verified and when they are fixed.</p>
                        <List items={data.supported} empty="You have not supported anyone else’s report yet." />
                    </section>
                </>
            )}
        </div>
    );
}

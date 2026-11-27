'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Project {
    teamId: string; university: string;
    challenge: { id: string; title: string; district: string; state: string | null; status: string };
    milestones: { id: string; title: string; status: string; submittedAt: string | null; attestedAt: string | null; attestation: string | null; hours: number }[];
    members: { id: string; name: string; role: string; ngoRating: number | null }[];
}

interface Invitation { proposalId: string; university: string; challenge: { id: string; title: string; district: string; state: string | null }; approach: string; budget: number; weeks: number }

// NGO field partner: answer invitations, confirm submitted milestones on the ground and rate the students.
export default function NgoAttestations() {
    const [items, setItems] = useState<Project[] | null>(null);
    const [invites, setInvites] = useState<Invitation[]>([]);
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const load = useCallback(() => {
        fetch('/api/ngo/attestations', { cache: 'no-store' }).then((r) => r.json()).then((j) => { setItems(j.success ? j.data : []); setInvites(j.success ? j.invitations ?? [] : []); }).catch(() => setItems([]));
    }, []);
    useEffect(load, [load]);

    const send = async (key: string, body: object, ok: string) => {
        setBusy(key);
        setMessage(null);
        const res = await fetch('/api/ngo/attestations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then((r) => r.json()).catch(() => ({ success: false, error: 'Could not reach the server.' }));
        setBusy(null);
        setMessage(res.success ? { ok: true, text: ok } : { ok: false, text: res.error ?? 'Could not save.' });
        if (res.success) load();
    };

    const waiting = items?.flatMap((p) => p.milestones.filter((m) => m.submittedAt && !m.attestedAt && m.status !== 'REJECTED')).length ?? 0;
    return (
        <section className="glass-card p-6" aria-labelledby="ngo-att-title">
            <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 id="ngo-att-title" className="text-lg font-semibold text-slate-900">Field partner work</h2>
                {items && <span className="text-sm text-slate-500">{waiting} to confirm</span>}
            </div>
            <p className="text-xs text-slate-500 mb-4">University projects that named you as field partner. Confirm each milestone you saw done on the ground, and rate each student (40% of their credential rating).</p>
            {message && <p role="status" className={`mb-3 text-sm rounded-lg px-3 py-2 border ${message.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{message.text}</p>}
            {invites.length > 0 && (
                <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2">Invitations to answer ({invites.length})</h3>
                    <ul className="space-y-3">
                        {invites.map((i) => (
                            <li key={i.proposalId} className="flex flex-col md:flex-row md:items-start gap-2">
                                <div className="flex-1 min-w-0">
                                    <Link href={`/track/${i.challenge.id}`} className="text-sm font-semibold text-slate-900 hover:underline">{i.challenge.title}</Link>
                                    <p className="text-xs text-slate-600">{i.university} · {[i.challenge.district, i.challenge.state].filter(Boolean).join(', ')} · {i.weeks} weeks · ₹{Math.round(i.budget).toLocaleString('en-IN')}</p>
                                    {i.approach && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{i.approach}</p>}
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button type="button" disabled={busy === i.proposalId} onClick={() => send(i.proposalId, { action: 'RESPOND', proposalId: i.proposalId, accept: false }, `Declined the invitation for “${i.challenge.title}”.`)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-white disabled:opacity-50">Decline</button>
                                    <button type="button" disabled={busy === i.proposalId} onClick={() => send(i.proposalId, { action: 'RESPOND', proposalId: i.proposalId, accept: true }, `You are now field partner on “${i.challenge.title}”.`)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Accept</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {items === null ? <p className="text-sm text-slate-400">Loading…</p> : items.length === 0 ? (
                <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">No university project has named your organisation as field partner yet.</p>
            ) : (
                <div className="space-y-6">
                    {items.map((p) => (
                        <article key={p.teamId} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                            <Link href={`/track/${p.challenge.id}`} className="text-sm font-semibold text-slate-900 hover:underline">{p.challenge.title}</Link>
                            <p className="text-xs text-slate-500">{[p.challenge.district, p.challenge.state].filter(Boolean).join(', ')} · {p.university}</p>
                            <ul className="mt-3 divide-y divide-slate-100">
                                {p.milestones.map((m) => (
                                    <li key={m.id} className="py-2 flex flex-col md:flex-row md:items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-slate-800">{m.title}</p>
                                            <p className="text-xs text-slate-500">
                                                {m.submittedAt ? `Submitted ${new Date(m.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${m.hours} student hours logged` : 'Not submitted yet'}
                                                {m.attestedAt && ` · confirmed by you ${new Date(m.attestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                                            </p>
                                            {m.attestation && <p className="text-xs text-slate-600 mt-1">“{m.attestation}”</p>}
                                        </div>
                                        {m.submittedAt && !m.attestedAt && m.status !== 'REJECTED' && (
                                            <div className="flex flex-col sm:flex-row gap-2 md:w-96 shrink-0">
                                                <label className="sr-only" htmlFor={`att-${m.id}`}>What you saw on the ground</label>
                                                <input id={`att-${m.id}`} value={notes[m.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [m.id]: e.target.value }))}
                                                    placeholder="What you saw on the ground" className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                                                <button type="button" disabled={busy === m.id || (notes[m.id] ?? '').trim().length < 10}
                                                    onClick={() => send(m.id, { action: 'ATTEST', milestoneId: m.id, note: notes[m.id] }, `Confirmed “${m.title}”.`)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Confirm work</button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-3 flex flex-wrap gap-3">
                                {p.members.map((s) => (
                                    <label key={s.id} className="flex items-center gap-2 text-xs text-slate-700 rounded-lg border border-slate-200 px-3 py-1.5">
                                        {s.name} <span className="text-slate-400">({s.role})</span>
                                        <select value={s.ngoRating ?? ''} disabled={busy === s.id} aria-label={`Your rating for ${s.name}`}
                                            onChange={(e) => send(s.id, { action: 'RATE', memberId: s.id, rating: Number(e.target.value) }, `Rated ${s.name} ${e.target.value}/5.`)}
                                            className="rounded-md border border-slate-300 px-1 py-0.5">
                                            <option value="" disabled>Rate</option>
                                            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
                                        </select>
                                    </label>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

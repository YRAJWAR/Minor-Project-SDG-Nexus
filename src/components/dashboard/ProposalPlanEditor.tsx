'use client';

import React, { useEffect, useState } from 'react';

export interface PlanStudent { id: string; name: string; branch?: string; year?: number }
export interface PlanRow { title: string; week: number; amount: number }

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// Team (2–8 students of this university) and 2–6 milestones whose amounts must add up to the budget.
// The server re-checks all of this (validatePlan in src/server/lifecycle.ts); this only helps the faculty get it right.
export default function ProposalPlanEditor({ team, setTeam, milestones, setMilestones, budget, weeks }: {
    team: PlanStudent[]; setTeam: (t: PlanStudent[]) => void;
    milestones: PlanRow[]; setMilestones: (m: PlanRow[]) => void;
    budget: number; weeks: number;
}) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState<PlanStudent[]>([]);

    useEffect(() => {
        const t = setTimeout(() => {
            fetch(`/api/students/search?q=${encodeURIComponent(q)}`).then((r) => r.json())
                .then((j) => setResults(j.success ? j.data.map((s: { id: string; name: string; branch: string; year: number }) => ({ id: s.id, name: s.name, branch: s.branch, year: s.year })) : []))
                .catch(() => setResults([]));
        }, 250);
        return () => clearTimeout(t);
    }, [q]);

    const total = milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const diff = Math.round(budget - total);
    const setRow = (i: number, patch: Partial<PlanRow>) => setMilestones(milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)));

    return (
        <div className="space-y-6">
            <fieldset>
                <legend className="text-sm font-bold text-slate-900">Project team <span className="font-normal text-slate-500">(2–8 students, {team.length} chosen)</span></legend>
                <ul className="mt-2 flex flex-wrap gap-2">
                    {team.map((s) => (
                        <li key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs text-indigo-800">
                            {s.name}{s.branch ? ` · ${s.branch}` : ''}
                            <button type="button" aria-label={`Remove ${s.name}`} onClick={() => setTeam(team.filter((x) => x.id !== s.id))} className="text-indigo-500 hover:text-indigo-800">×</button>
                        </li>
                    ))}
                </ul>
                <label htmlFor="plan-student-search" className="sr-only">Search students</label>
                <input id="plan-student-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your students by name, branch or skill"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <ul className="mt-1 max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {results.filter((r) => !team.some((t) => t.id === r.id)).slice(0, 8).map((r) => (
                        <li key={r.id}>
                            <button type="button" disabled={team.length >= 8} onClick={() => setTeam([...team, r])}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50">
                                + {r.name} <span className="text-slate-500">{r.branch} · year {r.year}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </fieldset>

            <fieldset>
                <legend className="text-sm font-bold text-slate-900">Milestones <span className="font-normal text-slate-500">(2–6; each released only after the officer verifies it)</span></legend>
                <div className="mt-2 space-y-2">
                    {milestones.map((m, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center">
                            <label className="sr-only" htmlFor={`ms-t-${i}`}>Milestone {i + 1} title</label>
                            <input id={`ms-t-${i}`} value={m.title} maxLength={120} placeholder={`Milestone ${i + 1}, e.g. Baseline survey`} onChange={(e) => setRow(i, { title: e.target.value })}
                                className="col-span-6 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                            <label className="col-span-2 flex items-center gap-1 text-xs text-slate-500">wk
                                <input type="number" min={1} max={weeks} value={m.week} onChange={(e) => setRow(i, { week: Number(e.target.value) })}
                                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" aria-label={`Milestone ${i + 1} week`} />
                            </label>
                            <label className="col-span-3 flex items-center gap-1 text-xs text-slate-500">₹
                                <input type="number" min={1} value={m.amount} onChange={(e) => setRow(i, { amount: Number(e.target.value) })}
                                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" aria-label={`Milestone ${i + 1} amount`} />
                            </label>
                            <button type="button" aria-label={`Remove milestone ${i + 1}`} disabled={milestones.length <= 2}
                                onClick={() => setMilestones(milestones.filter((_, j) => j !== i))} className="col-span-1 text-slate-400 hover:text-rose-600 disabled:opacity-30">×</button>
                        </div>
                    ))}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                    <button type="button" disabled={milestones.length >= 6} onClick={() => setMilestones([...milestones, { title: '', week: Math.min(weeks, (milestones.at(-1)?.week ?? 0) + 2), amount: Math.max(0, diff) }])}
                        className="font-semibold text-indigo-700 hover:underline disabled:opacity-40">+ Add milestone</button>
                    <span role="status" className={diff === 0 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                        {inr(total)} of {inr(budget)}{diff === 0 ? ' — adds up' : diff > 0 ? ` — ${inr(diff)} unallocated` : ` — ${inr(-diff)} over budget`}
                    </span>
                </div>
            </fieldset>
        </div>
    );
}

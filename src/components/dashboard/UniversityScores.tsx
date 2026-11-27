'use client';

import React, { useEffect, useState } from 'react';

interface Row {
    id: string; name: string; place: string; score: number | null; basedOn: number;
    breakdown: { onTime: number | null; satisfaction: number | null; reach: number | null; proof: number | null; areaNeed: number | null } | null;
}

const LABELS: [keyof NonNullable<Row['breakdown']>, string][] = [
    ['onTime', 'On time (30%)'], ['satisfaction', 'Citizen rating (25%)'], ['reach', 'People per ₹ lakh (20%)'], ['proof', 'Proof (15%)'], ['areaNeed', 'Area need (10%)'],
];

// University impact scores from resolved projects only (GET /api/impact/universities).
export default function UniversityScores() {
    const [rows, setRows] = useState<Row[] | null>(null);
    useEffect(() => {
        fetch('/api/impact/universities').then((r) => r.json()).then((j) => setRows(j.success ? j.data.universities : [])).catch(() => setRows([]));
    }, []);

    return (
        <section className="glass-card p-5" aria-labelledby="uni-scores">
            <h2 id="uni-scores" className="text-lg font-semibold text-slate-900">Universities</h2>
            <p className="text-xs text-slate-500 mb-3">Scored only on projects the citizen and the district officer have closed as resolved. A part with no data yet is left out, not guessed.</p>
            {rows === null ? <p className="text-sm text-slate-400">Loading…</p> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                <th scope="col" className="py-2 pr-3">University</th>
                                <th scope="col" className="py-2 pr-3 text-right">Score</th>
                                {LABELS.map(([, l]) => <th key={l} scope="col" className="py-2 pr-3 text-right hidden md:table-cell">{l}</th>)}
                                <th scope="col" className="py-2 text-right">Resolved</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b border-slate-50">
                                    <td className="py-2 pr-3"><span className="font-medium text-slate-900">{r.name}</span><span className="block text-xs text-slate-500">{r.place}</span></td>
                                    <td className="py-2 pr-3 text-right font-bold text-slate-900">{r.score ?? '—'}</td>
                                    {LABELS.map(([k]) => <td key={k} className="py-2 pr-3 text-right text-slate-600 hidden md:table-cell">{r.breakdown?.[k] ?? '—'}</td>)}
                                    <td className="py-2 text-right text-slate-600">{r.basedOn || 'none yet'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

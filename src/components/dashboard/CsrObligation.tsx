'use client';

import React, { useCallback, useEffect, useState } from 'react';

interface Data {
    financialYear: string; avgNetProfit: number | null; committedThisYear: number; releasedThisYear: number;
    obligation: { required: number; released: number; remaining: number; met: boolean } | null;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// The 2% CSR obligation for this financial year, from tranches this partner actually released.
export default function CsrObligation() {
    const [data, setData] = useState<Data | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [profit, setProfit] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        fetch('/api/funding/obligation', { cache: 'no-store' }).then((r) => r.json())
            .then((j) => { if (j.success) { setData(j.data); setProfit(j.data.avgNetProfit ? String(j.data.avgNetProfit) : ''); } else setFailed(j.error); })
            .catch(() => setFailed('Could not reach the server.'));
    }, []);
    useEffect(load, [load]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const res = await fetch('/api/funding/obligation', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avgNetProfit: Number(profit) }) })
            .then((r) => r.json()).catch(() => ({ success: false, error: 'Could not reach the server.' }));
        setSaving(false);
        if (res.success) load(); else setFailed(res.error);
    };

    const o = data?.obligation;
    return (
        <section className="glass-card p-6" aria-labelledby="csr-ob-title">
            <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 id="csr-ob-title" className="text-lg font-semibold text-slate-900">CSR obligation{data ? `, FY ${data.financialYear}` : ''}</h2>
                {o && <span className={`text-sm font-semibold ${o.met ? 'text-emerald-700' : 'text-amber-700'}`}>{o.met ? 'Met' : `${inr(o.remaining)} still to spend`}</span>}
            </div>
            <p className="text-xs text-slate-500 mb-4">Section 135 of the Companies Act: spend at least 2% of the average net profit of the last three financial years. Counted from tranches you released this year.</p>
            {failed && <p role="alert" className="mb-3 text-sm rounded-lg px-3 py-2 border bg-rose-50 border-rose-200 text-rose-800">{failed}</p>}
            {data === null ? (!failed && <p className="text-sm text-slate-400">Loading…</p>) : (
                <>
                    {o ? (
                        <>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                                <div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, (o.released / Math.max(1, o.required)) * 100)}%` }} />
                            </div>
                            <p className="text-sm text-slate-700 mt-2">{inr(o.released)} released of {inr(o.required)} required · {inr(data.committedThisYear)} committed this year</p>
                        </>
                    ) : (
                        <p className="text-sm text-slate-500">Enter your average net profit to see the required spend. {inr(data.releasedThisYear)} released this year so far.</p>
                    )}
                    <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-2">
                        <label className="text-xs text-slate-600 flex flex-col gap-1">
                            Average net profit, last 3 financial years (₹)
                            <input type="number" min={0} inputMode="numeric" required value={profit} onChange={(e) => setProfit(e.target.value)} className="w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                        </label>
                        <button type="submit" disabled={saving || profit === ''} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                    </form>
                </>
            )}
        </section>
    );
}

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Sparkles, ArrowRight, ShieldCheck, Compass } from 'lucide-react';

export default function TrackSearchPage() {
    const router = useRouter();
    const [challengeId, setChallengeId] = useState('');
    const [error, setError] = useState('');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = challengeId.trim();
        if (!trimmed) {
            setError('Please enter a valid Challenge ID or Tracking Code');
            return;
        }
        router.push(`/track/${trimmed}`);
    };

    return (
        <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-xl mx-auto w-full text-center">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[var(--color-forest)] text-xs font-semibold uppercase tracking-wider mb-4">
                    <Sparkles className="w-3.5 h-3.5" />
                    Public challenge tracker
                </div>

                <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--color-ink)] tracking-tight mb-3">
                    Track Challenge Resolution
                </h1>
                <p className="text-[var(--color-ink-muted)] text-sm sm:text-base mb-8 max-w-md mx-auto">
                    Enter the tracking ID received during your citizen challenge submission to view real-time state machine progress.
                </p>

                <form onSubmit={handleSearch} className="bg-[var(--color-sheet)]  border border-[var(--color-rule)] rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="relative">
                        <Search className="w-5 h-5 text-[var(--color-ink-muted)] absolute left-4 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Enter Challenge ID (e.g. cly...)"
                            value={challengeId}
                            onChange={(e) => {
                                setChallengeId(e.target.value);
                                if (error) setError('');
                            }}
                            className="w-full bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl pl-12 pr-4 py-3 text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm sm:text-base font-mono"
                        />
                    </div>

                    {error && <p className="text-[var(--color-rust)] text-xs text-left">{error}</p>}

                    <button
                        type="submit"
                        className="w-full py-3 px-6 rounded-xl bg-[var(--color-forest)] hover:from-emerald-500 hover:to-teal-500 text-[var(--color-ink)] font-semibold text-sm shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
                    >
                        <span>Inspect 8-Stage Pipeline</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </form>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-[var(--color-ink-muted)]">
                    <Link
                        href="/citizen/submit"
                        className="inline-flex items-center gap-1.5 text-[var(--color-forest)] hover:underline"
                    >
                        <span>Need to log a new issue? Submit Challenge</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                    <span className="hidden sm:inline">•</span>
                    <Link
                        href="/dashboard/heatmap"
                        className="inline-flex items-center gap-1.5 text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                    >
                        <Compass className="w-3.5 h-3.5 text-[var(--color-survey)]" />
                        <span>Explore Geospatial Heatmap</span>
                    </Link>
                </div>

                <div className="mt-12 pt-6 border-t border-[var(--color-rule)] text-[11px] text-[var(--color-ink-muted)] flex items-center justify-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[var(--color-forest)]" />
                    <span>SDG Nexus • Public challenge tracker</span>
                </div>
            </div>
        </div>
    );
}

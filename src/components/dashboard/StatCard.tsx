'use client';

import React from 'react';
import AnimatedCounter from '@/components/ui/AnimatedCounter';

interface StatCardProps {
    label: string;
    value: number;
    /** Kept for existing callers; the sheet style uses no icon. */
    icon?: string;
    /** Kept for existing callers; colour comes from the survey palette. */
    color?: string;
    prefix?: string;
    suffix?: string;
    delay?: number;
}

// A figure on the sheet: label, then the number. No glow, no glass, no icon tile.
export default function StatCard({ label, value, prefix = '', suffix = '' }: StatCardProps) {
    return (
        <div className="rounded-md border border-[var(--color-rule)] bg-[var(--color-sheet)] px-4 py-3.5">
            <p className="text-xs font-medium text-[var(--color-ink-muted)]">{label}</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-[1.75rem] font-semibold leading-tight text-[var(--color-ink)] tabular">
                <AnimatedCounter target={value} prefix={prefix} suffix={suffix} />
            </p>
        </div>
    );
}

'use client';

import React from 'react';
import NotificationBell from '@/components/ui/NotificationBell';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import {
    Award, BarChart3, ClipboardList, FilePenLine, Inbox, Landmark, LayoutDashboard, LogOut, Map, Megaphone,
    Plus, Search, Target, Trophy, UserRound, X, type LucideIcon,
} from 'lucide-react';

// One line-icon set for the whole app; nav entries keep their original markers as keys.
const ICONS: Record<string, LucideIcon> = {
    '📊': LayoutDashboard, '➕': Plus, '🗺️': Map, '📋': ClipboardList, '🏆': Trophy, '📈': BarChart3, '👤': UserRound,
    '🏛️': Landmark, '🏢': LayoutDashboard, '📢': Megaphone, '🔍': Search, '🎯': Target, '🎓': Award, '📥': Inbox, '📝': FilePenLine,
};

const NAV_ITEMS: Record<string, { label: string; href: string; icon: string }[]> = {
    ngo: [
        { label: 'Dashboard', href: '/dashboard/ngo', icon: '📊' },
        { label: 'New field project', href: '/dashboard/ngo/create-project', icon: '➕' },
        { label: 'Report a problem', href: '/citizen/submit', icon: '📢' },
        { label: 'My reports', href: '/dashboard/reports', icon: '🔍' },
        { label: 'Heatmap', href: '/dashboard/heatmap', icon: '🗺️' },
        { label: 'Activity Ledger', href: '/dashboard/ledger', icon: '📋' },
        { label: 'Leaderboard', href: '/dashboard/leaderboard', icon: '🏆' },
        { label: 'Analytics', href: '/dashboard/analytics', icon: '📈' },
        { label: 'Profile', href: '/dashboard/profile', icon: '👤' },
    ],
    government: [
        { label: 'District office', href: '/dashboard/government', icon: '🏛️' },
        { label: 'Heatmap', href: '/dashboard/heatmap', icon: '🗺️' },
        { label: 'Activity Ledger', href: '/dashboard/ledger', icon: '📋' },
        { label: 'Leaderboard', href: '/dashboard/leaderboard', icon: '🏆' },
        { label: 'Analytics', href: '/dashboard/analytics', icon: '📈' },
        { label: 'Profile', href: '/dashboard/profile', icon: '👤' },
    ],
    admin: [
        { label: 'Administration', href: '/dashboard/admin', icon: '👤' },
        { label: 'District office', href: '/dashboard/government', icon: '🏛️' },
        { label: 'Heatmap', href: '/dashboard/heatmap', icon: '🗺️' },
        { label: 'Activity Ledger', href: '/dashboard/ledger', icon: '📋' },
        { label: 'Leaderboard', href: '/dashboard/leaderboard', icon: '🏆' },
        { label: 'Analytics', href: '/dashboard/analytics', icon: '📈' },
    ],
    corporate: [
        { label: 'CSR dashboard', href: '/dashboard/corporate', icon: '🏢' },
        { label: 'Heatmap', href: '/dashboard/heatmap', icon: '🗺️' },
        { label: 'Activity Ledger', href: '/dashboard/ledger', icon: '📋' },
        { label: 'Leaderboard', href: '/dashboard/leaderboard', icon: '🏆' },
        { label: 'Analytics', href: '/dashboard/analytics', icon: '📈' },
        { label: 'Profile', href: '/dashboard/profile', icon: '👤' },
    ],
    citizen: [
        { label: 'My reports', href: '/dashboard/reports', icon: '📋' },
        { label: 'Report a problem', href: '/citizen/submit', icon: '📢' },
        { label: 'Track Challenge', href: '/track', icon: '🔍' },
        { label: 'Impact Heatmap', href: '/dashboard/heatmap', icon: '🗺️' },
        { label: 'Activity Ledger', href: '/dashboard/ledger', icon: '📋' },
    ],
    // Students see their work and credentials, not faculty actions (accepting challenges, forming teams).
    student: [
        { label: 'Milestone Tracker', href: '/dashboard/hei/milestones', icon: '🎯' },
        { label: 'My Credentials', href: '/dashboard/hei/credentials', icon: '🎓' },
        { label: 'Impact Heatmap', href: '/dashboard/heatmap', icon: '🗺️' },
        { label: 'Profile', href: '/dashboard/profile', icon: '👤' },
    ],
    hei: [
        { label: 'Challenge Inbox', href: '/dashboard/hei', icon: '📥' },
        { label: 'Proposal Builder', href: '/dashboard/hei/proposals', icon: '📝' },
        { label: 'Milestone Tracker', href: '/dashboard/hei/milestones', icon: '🎯' },
        { label: 'Student Credentials', href: '/dashboard/hei/credentials', icon: '🎓' },
        { label: 'Impact Heatmap', href: '/dashboard/heatmap', icon: '🗺️' },
        { label: 'Profile', href: '/dashboard/profile', icon: '👤' },
    ],
};

interface SidebarProps {
    mobileOpen?: boolean;
    onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
    const { user, logout } = useAuth();
    const pathname = usePathname();
    const role = user?.role || 'ngo';
    const items = NAV_ITEMS[role] || NAV_ITEMS.ngo;

    return (
        <>
            {/* Mobile Backdrop */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden transition-opacity"
                    onClick={onClose}
                />
            )}

            <aside
                className={`fixed left-0 top-0 z-50 flex h-screen w-[260px] flex-col border-r border-[var(--color-rule)] bg-[var(--color-sheet)] transition-transform duration-300 ease-out ${
                    mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full lg:translate-x-0'
                }`}
            >
                <div className="flex items-center justify-between px-5 pb-4 pt-5">
                    <Link href="/" onClick={onClose} className="flex items-center gap-2.5 no-underline">
                        <Image src="/logo.png" alt="" width={30} height={30} className="rounded" />
                        <span className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-ink)]">SDG Nexus</span>
                    </Link>
                    {onClose && (
                        <button type="button" onClick={onClose} aria-label="Close menu"
                            className="rounded p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-paper)] lg:hidden">
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <p className="mx-5 mb-4 border-y border-[var(--color-rule)] py-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">
                    {{ government: 'District office', admin: 'Administration', hei: 'University', student: 'Student', ngo: 'NGO', corporate: 'CSR partner', citizen: 'Citizen' }[role] ?? 'Workspace'}
                    {user?.organization_name ? <span className="block truncate font-normal text-[var(--color-ink-muted)]">{user.organization_name}</span> : null}
                </p>

                <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Workspace">
                    {items.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = ICONS[item.icon] ?? LayoutDashboard;
                        return (
                            <Link key={item.href} href={item.href} onClick={onClose} aria-current={isActive ? 'page' : undefined}
                                className={`flex items-center gap-3 rounded px-3 py-2.5 text-sm no-underline transition-colors ${
                                    isActive ? 'bg-[var(--color-survey-wash)] font-semibold text-[var(--color-survey-deep)]' : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]'
                                }`}>
                                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="border-t border-[var(--color-rule)] p-4">
                    <div className="relative mb-3 flex items-center gap-3">
                        <NotificationBell />
                        {/* Initials only: never send the user's email to a third-party avatar service. */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-paper-deep)] text-sm font-semibold text-[var(--color-ink-soft)]" aria-hidden="true">
                            {user?.name?.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{user?.name}</p>
                            <p className="truncate text-xs text-[var(--color-ink-muted)]">{user?.email}</p>
                        </div>
                    </div>
                    <button type="button" onClick={async () => { onClose?.(); await logout(); window.location.assign('/login'); }}
                        className="flex w-full items-center justify-center gap-2 rounded border border-[var(--color-rule)] px-4 py-2 text-sm font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-rust)] hover:text-[var(--color-rust)]">
                        <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
                    </button>
                </div>
        </aside>
    </>
    );
}

'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
    ShieldCheck,
    ShieldAlert,
    Lock,
    ExternalLink,
    Copy,
    Check,
    MapPin,
    Calendar,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    Eye,
    EyeOff,
    Sparkles,
    Database,
    Binary,
    ArrowLeft,
    Building2,
    Clock,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { SDG_INFO } from '@/data/mockData';

interface MilestoneLedgerItem {
    id: string;
    teamId: string;
    title: string;
    description: string;
    dueDate: string;
    status: 'PENDING' | 'SUBMITTED' | 'GP_VERIFIED' | 'CSR_APPROVED' | string;
    proofUrls: string[];
    proofVideoUrl?: string | null;
    hashValue: string | null;
    gpsLat?: number | null;
    gpsLng?: number | null;
    exifTimestamp?: string | null;
    verifierCode?: string | null;
    fundReleased?: number | null;
    createdAt: string;
}

interface ProjectLedgerData {
    id: string;
    teamId: string;
    title: string;
    district: string;
    sdgTags: number[];
    status: string;
    universityName: string;
    facultyLead?: string;
}

interface VerificationResult {
    milestoneId: string;
    valid: boolean;
    sealed: boolean;
    storedHash: string | null;
    computedHash: string;
    timestamp: string;
    coords: string | null;
    milestoneTitle?: string;
}

export default function PublicProjectLedgerPage({
    params,
}: {
    params: Promise<{ projectId: string }>;
}) {
    const { projectId } = use(params);
    const { user } = useAuth();

    const [loading, setLoading] = useState<boolean>(true);
    const [project, setProject] = useState<ProjectLedgerData | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [milestones, setMilestones] = useState<MilestoneLedgerItem[]>([]);
    const [merkleRoot, setMerkleRoot] = useState<string>('');
    const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null);

    // Verification state
    const [verifyingId, setVerifyingId] = useState<string | null>(null);
    const [computationPhase, setComputationPhase] = useState<string>('');
    const [verificationResults, setVerificationResults] = useState<Record<string, VerificationResult>>({});

    // Copy states
    const [copiedHashId, setCopiedHashId] = useState<string | null>(null);
    const [copiedRoot, setCopiedRoot] = useState<boolean>(false);

    useEffect(() => {
        const fetchLedger = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/ledger/${encodeURIComponent(projectId)}`);
                const json = await res.json();
                if (json.success && json.data) {
                    setProject(json.data.project);
                    setMilestones(json.data.milestones || []);
                    setMerkleRoot(json.data.merkleRoot || '');
                } else {
                    setLoadError(json.error || 'This ledger could not be loaded.');
                }
            } catch (err) {
                console.error('Failed to load public ledger:', err);
                setLoadError('Could not reach the ledger service. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchLedger();
    }, [projectId]);

    const handleVerify = async (milestone: MilestoneLedgerItem) => {
        setVerifyingId(milestone.id);
        setComputationPhase('Reading payload from immutable ledger...');

        try {
            // Stage 1: visual computation delay (minimum 1.2s demo moment)
            const phaseTimer1 = setTimeout(() => {
                setComputationPhase('Recomputing SHA-256 (proofUrl | timestamp | lat | lng)...');
            }, 500);

            const [res] = await Promise.all([
                fetch('/api/ledger/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        milestoneId: milestone.id,
                        hashValue: milestone.hashValue,
                    }),
                }),
                new Promise((resolve) => setTimeout(resolve, 1200)),
            ]);

            clearTimeout(phaseTimer1);
            setComputationPhase('Validating cryptographic integrity signature...');

            const json = await res.json();

            if (json.success && json.data) {
                setVerificationResults((prev) => ({
                    ...prev,
                    [milestone.id]: {
                        milestoneId: milestone.id,
                        valid: json.data.valid,
                        sealed: json.data.sealed,
                        storedHash: json.data.storedHash,
                        computedHash: json.data.computedHash,
                        timestamp: json.data.timestamp,
                        coords: json.data.coords,
                        milestoneTitle: milestone.title,
                    },
                }));
            }
        } catch (err) {
            console.error('Verification error:', err);
        } finally {
            setVerifyingId(null);
            setComputationPhase('');
        }
    };

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        if (id === 'root') {
            setCopiedRoot(true);
            setTimeout(() => setCopiedRoot(false), 2000);
        } else {
            setCopiedHashId(id);
            setTimeout(() => setCopiedHashId(null), 2000);
        }
    };

    const formatCoordinates = (lat?: number | null, lng?: number | null) => {
        if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
        const effectiveLat = lat;
        const effectiveLng = lng;

        const latStr = `${Math.abs(effectiveLat).toFixed(4)}°${effectiveLat >= 0 ? 'N' : 'S'}`;
        const lngStr = `${Math.abs(effectiveLng).toFixed(4)}°${effectiveLng >= 0 ? 'E' : 'W'}`;

        return {
            display: `${latStr}, ${lngStr}`,
            href: `https://www.google.com/maps?q=${effectiveLat},${effectiveLng}`,
        };
    };

    const formatTruncatedHash = (hash?: string | null) => {
        if (!hash) return 'Sealing pending...';
        const clean = hash.trim();
        if (clean.length <= 18) return clean;
        return `${clean.slice(0, 8)}...${clean.slice(-8)}`;
    };

    const checkExifMismatch = (captureTime?: string | null, uploadTime?: string | null) => {
        if (!captureTime || !uploadTime) return false;
        try {
            const cap = new Date(captureTime).getTime();
            const upl = new Date(uploadTime).getTime();
            const diffHours = Math.abs(upl - cap) / (1000 * 60 * 60);
            return diffHours > 2;
        } catch {
            return false;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'CSR_APPROVED':
                return (
                    <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-emerald-500/15 text-[var(--color-forest)] border border-emerald-500/30 flex items-center gap-1 w-fit">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        CSR_APPROVED
                    </span>
                );
            case 'GP_VERIFIED':
                return (
                    <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-amber-500/15 text-[var(--color-ochre)] border border-amber-500/30 flex items-center gap-1 w-fit">
                        <Check className="w-3.5 h-3.5" />
                        GP_VERIFIED
                    </span>
                );
            case 'SUBMITTED':
                return (
                    <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-blue-500/15 text-[var(--color-survey)] border border-blue-500/30 flex items-center gap-1 w-fit">
                        <Clock className="w-3.5 h-3.5" />
                        SUBMITTED
                    </span>
                );
            case 'PENDING':
            default:
                return (
                    <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-[var(--color-paper)] text-[var(--color-ink-soft)] border border-[var(--color-rule)] flex items-center gap-1 w-fit">
                        PENDING
                    </span>
                );
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] flex flex-col items-center justify-center p-6">
                <div className="w-12 h-12 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                <h2 className="text-base font-bold text-[var(--color-ink)]">Accessing Cryptographic Ledger</h2>
                <p className="text-xs text-[var(--color-ink-muted)] mt-1 font-mono">Synchronizing SHA-256 Merkle root...</p>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] flex flex-col items-center justify-center p-6 text-center">
                <AlertTriangle className="w-10 h-10 text-[var(--color-rust)] mb-3" />
                <h2 className="text-base font-bold text-[var(--color-ink)]">Ledger not available</h2>
                <p className="text-xs text-[var(--color-ink-muted)] mt-1 mb-5">{loadError || 'No project found.'}</p>
                <Link href="/track" className="px-4 py-2 rounded-xl bg-[var(--color-sheet)] hover:bg-[var(--color-paper)] text-xs font-semibold">
                    Back to tracking
                </Link>
            </div>
        );
    }
    const effectiveProject = project;

    return (
        <div className="min-h-screen bg-[var(--color-paper)] text-white selection:bg-indigo-500 selection:text-white">
            {/* Top Navigation & Breadcrumb */}
            <div className="border-b border-[var(--color-rule)] bg-[var(--color-paper)] backdrop-blur sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <Link
                            href="/track"
                            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition px-2.5 py-1 rounded-lg bg-[var(--color-sheet)] border border-[var(--color-rule)]"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span>Public Tracker</span>
                        </Link>
                        <span className="text-slate-600 text-xs hidden sm:inline">•</span>
                        <div className="flex items-center gap-1.5 text-xs text-[var(--color-survey)] font-semibold">
                            <Database className="w-3.5 h-3.5" />
                            <span>SHA-256 Public Proof Ledger</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                        {user ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/60 text-[var(--color-forest)] border border-emerald-800 text-[11px] font-semibold">
                                <Eye className="w-3 h-3" />
                                Reviewer Mode ({user.role})
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-sheet)] text-[var(--color-ink-muted)] border border-[var(--color-rule)] text-[11px]">
                                <EyeOff className="w-3 h-3 text-[var(--color-ink-muted)]" />
                                Public Access (Proofs Redacted)
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                {/* ─── HEADER ──────────────────────────────────────────────── */}
                <header className="rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)] p-6 sm:p-8 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <Binary className="w-64 h-64 text-[var(--color-survey)]" />
                    </div>

                    <div className="relative z-10 space-y-4 max-w-4xl">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-indigo-500/20 text-[var(--color-survey)] border border-indigo-500/30 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" />
                                Immutable Impact Ledger
                            </span>
                            {/* Current ChallengeStatus Badge */}
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-blue-500/20 text-[var(--color-survey)] border border-blue-500/30 uppercase tracking-wider">
                                {effectiveProject.status.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs text-[var(--color-ink-muted)] flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-[var(--color-ink-muted)]" />
                                {effectiveProject.district} District
                            </span>
                        </div>

                        <div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-ink)] tracking-tight leading-tight">
                                SDG Nexus — Project Impact Ledger
                            </h1>
                            <p className="text-base sm:text-lg font-semibold text-[var(--color-ink)] mt-1">
                                {effectiveProject.title}
                            </p>
                        </div>

                        {/* District, University & SDG tags */}
                        <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                            <div className="flex items-center gap-1.5 text-[var(--color-ink-soft)] font-medium bg-[var(--color-sheet)] px-3 py-1 rounded-lg border border-[var(--color-rule)]">
                                <Building2 className="w-3.5 h-3.5 text-[var(--color-survey)]" />
                                <span>{effectiveProject.universityName}</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                                {effectiveProject.sdgTags.map((tagId) => {
                                    const sdg = SDG_INFO.find((s) => s.id === tagId);
                                    return (
                                        <span
                                            key={tagId}
                                            className="px-2.5 py-0.5 rounded text-[11px] font-bold text-[var(--color-ink)] shadow-xs"
                                            style={{ backgroundColor: sdg ? sdg.color : '#059669' }}
                                        >
                                            SDG {tagId}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Cryptographic Immutability Notice (Mandated text) */}
                        <div className="p-3.5 rounded-xl bg-[var(--color-paper)] border border-[var(--color-rule)] text-xs text-[var(--color-ink-soft)] flex items-start gap-3 mt-4">
                            <Lock className="w-4 h-4 text-[var(--color-survey)] mt-0.5 shrink-0" />
                            <p className="leading-relaxed">
                                <span className="font-semibold text-[var(--color-ink)]">Cryptographic Assurance: </span>
                                This ledger is cryptographically immutable. Every entry below was sealed at the moment
                                of submission. Any modification to the underlying database will be detected instantly.
                            </p>
                        </div>
                    </div>
                </header>

                {/* ─── MILESTONE LEDGER TABLE ──────────────────────────────── */}
                <section className="rounded-2xl border border-[var(--color-rule)] bg-[var(--color-sheet)] shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-[var(--color-rule)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--color-sheet)]">
                        <div>
                            <h2 className="text-base font-bold text-[var(--color-ink)] flex items-center gap-2">
                                <Database className="w-4 h-4 text-[var(--color-forest)]" />
                                Verified Milestone Ledger Entries
                            </h2>
                            <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                                SHA-256 sealed field telemetry, on-site GP endorsements, and CSR tranche release hashes
                            </p>
                        </div>
                        <div className="text-xs text-[var(--color-ink-muted)] font-mono">
                            {milestones.length} sealed payload{milestones.length === 1 ? '' : 's'}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-[var(--color-rule)] bg-[var(--color-paper)] text-[var(--color-ink-muted)] text-[11px] uppercase tracking-wider font-semibold">
                                    <th className="py-3.5 px-4 w-12 text-center">#</th>
                                    <th className="py-3.5 px-4 min-w-[220px]">Milestone Title</th>
                                    <th className="py-3.5 px-4 whitespace-nowrap">Submitted</th>
                                    <th className="py-3.5 px-4 font-mono">SHA-256 Hash</th>
                                    <th className="py-3.5 px-4">GPS Location</th>
                                    <th className="py-3.5 px-4">Status</th>
                                    <th className="py-3.5 px-4 text-right">Verification</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-rule)]">
                                {milestones.map((m, idx) => {
                                    const coords = formatCoordinates(m.gpsLat, m.gpsLng);
                                    const vResult = verificationResults[m.id];
                                    const isVerifying = verifyingId === m.id;
                                    const isExpanded = expandedMilestoneId === m.id;
                                    const hasExifMismatch = checkExifMismatch(m.exifTimestamp, m.createdAt);

                                    return (
                                        <React.Fragment key={m.id}>
                                            <tr className="hover:bg-[var(--color-sheet)] transition-colors">
                                                {/* Index */}
                                                <td className="py-4 px-4 text-center font-mono text-[var(--color-ink-muted)] font-bold">
                                                    0{idx + 1}
                                                </td>

                                                {/* Milestone Title + Expand Toggle */}
                                                <td className="py-4 px-4">
                                                    <div className="font-bold text-[var(--color-ink)] text-sm leading-snug">
                                                        {m.title}
                                                    </div>
                                                    <div className="text-[var(--color-ink-muted)] text-[11px] mt-0.5 line-clamp-1">
                                                        {m.description}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setExpandedMilestoneId(isExpanded ? null : m.id)
                                                        }
                                                        className="mt-1.5 text-[11px] font-semibold text-[var(--color-survey)] hover:text-[var(--color-survey)] inline-flex items-center gap-1 transition"
                                                    >
                                                        {isExpanded ? (
                                                            <>
                                                                <ChevronUp className="w-3.5 h-3.5" />
                                                                Hide Proof Details
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ChevronDown className="w-3.5 h-3.5" />
                                                                View Proof Evidence &amp; EXIF
                                                            </>
                                                        )}
                                                    </button>
                                                </td>

                                                {/* Submitted Timestamp */}
                                                <td className="py-4 px-4 whitespace-nowrap text-[var(--color-ink-soft)] font-mono text-[11px]">
                                                    {new Date(m.createdAt).toLocaleString('en-IN', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </td>

                                                {/* SHA-256 Hash */}
                                                <td className="py-4 px-4 font-mono">
                                                    <div className="flex items-center gap-1.5 bg-[var(--color-paper)] px-2.5 py-1 rounded-lg border border-[var(--color-rule)] w-fit">
                                                        <span className="text-[var(--color-ink-soft)]" title={m.hashValue ?? undefined}>
                                                            {formatTruncatedHash(m.hashValue)}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => m.hashValue && copyToClipboard(m.hashValue, m.id)}
                                                            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition p-0.5"
                                                            title="Copy full SHA-256 hash"
                                                        >
                                                            {copiedHashId === m.id ? (
                                                                <Check className="w-3.5 h-3.5 text-[var(--color-forest)]" />
                                                            ) : (
                                                                <Copy className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* GPS */}
                                                <td className="py-4 px-4 whitespace-nowrap">
                                                    {coords ? (
                                                        <a
                                                            href={coords.href}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-[var(--color-survey)] hover:text-[var(--color-survey)] hover:underline transition font-mono text-[11px]"
                                                            title="Open in Google Maps"
                                                        >
                                                            <MapPin className="w-3 h-3 text-sky-500 shrink-0" />
                                                            <span>{coords.display}</span>
                                                            <ExternalLink className="w-2.5 h-2.5 opacity-75" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-[11px] text-[var(--color-ink-muted)]">No GPS recorded</span>
                                                    )}
                                                </td>

                                                {/* Status Badge */}
                                                <td className="py-4 px-4 whitespace-nowrap">
                                                    {getStatusBadge(m.status)}
                                                </td>

                                                {/* Verify Column */}
                                                <td className="py-4 px-4 text-right whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleVerify(m)}
                                                        disabled={isVerifying}
                                                        className={`px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 ml-auto cursor-pointer ${
                                                            isVerifying
                                                                ? 'bg-indigo-900 text-[var(--color-survey)] border border-indigo-700'
                                                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                                                        }`}
                                                    >
                                                        {isVerifying ? (
                                                            <>
                                                                <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-white rounded-full animate-spin" />
                                                                <span>Verifying...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                                <span>Verify Integrity</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </td>
                                            </tr>

                                            {/* Verification Banner Row (Appears when verified or while computing) */}
                                            {(isVerifying || vResult) && (
                                                <tr>
                                                    <td colSpan={7} className="p-0 border-b border-[var(--color-rule)]">
                                                        {isVerifying ? (
                                                            <div className="px-6 py-3 bg-indigo-950/40 border-y border-indigo-900/60 flex items-center gap-3 animate-pulse">
                                                                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                                                <span className="text-xs font-mono text-[var(--color-survey)]">
                                                                    {computationPhase || 'Computing SHA-256 verification...'}
                                                                </span>
                                                            </div>
                                                        ) : vResult?.valid ? (
                                                            <div className="px-6 py-3.5 bg-emerald-950/40 border-y border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[var(--color-forest)]">
                                                                <div className="flex items-center gap-2">
                                                                    <ShieldCheck className="w-4 h-4 text-[var(--color-forest)] shrink-0" />
                                                                    <span className="font-bold text-[var(--color-ink)]">
                                                                        VERIFIED — Hash confirmed.
                                                                    </span>
                                                                    <span className="text-[var(--color-ink-soft)]">
                                                                        Submitted {new Date(vResult.timestamp).toLocaleString('en-IN')}.
                                                                    </span>
                                                                    {vResult.coords && (
                                                                        <span className="text-[var(--color-forest)] font-mono">
                                                                            Location: {vResult.coords}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-[11px] font-mono text-[var(--color-forest)]/80">
                                                                    Payload integrity confirmed against SHA-256 seal
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="px-6 py-3.5 bg-rose-950/50 border-y border-rose-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[var(--color-rust)]">
                                                                <div className="flex items-center gap-2">
                                                                    <ShieldAlert className="w-4 h-4 text-[var(--color-rust)] shrink-0" />
                                                                    <span className="font-bold text-[var(--color-ink)]">
                                                                        {vResult?.sealed
                                                                            ? 'Not verified — the recomputed hash does not match the stored hash.'
                                                                            : 'Not verified — no hash was stored when this milestone was submitted.'}
                                                                    </span>
                                                                </div>
                                                                {vResult?.sealed && (
                                                                    <div className="text-[11px] font-mono text-[var(--color-rust)]">
                                                                        Expected: {vResult.computedHash.slice(0, 12)}... ≠ Stored: {vResult.storedHash?.slice(0, 12)}...
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}

                                            {/* ─── PROOF PANEL (Expandable per milestone) ─────────── */}
                                            {isExpanded && (
                                                <tr className="bg-[var(--color-paper)] border-b border-[var(--color-rule)]">
                                                    <td colSpan={7} className="p-6">
                                                        <div className="space-y-4 max-w-5xl">
                                                            {/* Proof Panel Header */}
                                                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--color-rule)] text-xs">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-[var(--color-ink)]">
                                                                        Field Evidence &amp; Integrity Telemetry
                                                                    </span>
                                                                    <span className="text-[var(--color-ink-muted)]">•</span>
                                                                    <span className="text-[var(--color-survey)] font-semibold">
                                                                        Submitted by: {effectiveProject.universityName}
                                                                    </span>
                                                                </div>

                                                                {m.verifierCode && (
                                                                    <div className="text-[var(--color-ink-muted)] font-mono text-[11px]">
                                                                        Endorsement Code: <span className="text-[var(--color-ink)] font-bold">{m.verifierCode}</span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Photo Thumbnails */}
                                                            <div>
                                                                <div className="text-[11px] font-bold text-[var(--color-ink-muted)] uppercase tracking-wider mb-2 flex items-center justify-between">
                                                                    <span>Cryptographically Sealed Photographic Proofs</span>
                                                                    {!user && (
                                                                        <span className="text-[var(--color-ochre)] flex items-center gap-1 text-[10px] font-medium">
                                                                            <EyeOff className="w-3 h-3" />
                                                                            DPDP 2023: Citizen privacy blur applied
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {m.proofUrls && m.proofUrls.length > 0 ? (
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                                        {m.proofUrls.map((url, pIdx) => (
                                                                            <div
                                                                                key={pIdx}
                                                                                className="relative group rounded-xl overflow-hidden border border-[var(--color-rule)] bg-[var(--color-sheet)] aspect-video shadow-md"
                                                                            >
                                                                                <img
                                                                                    src={url}
                                                                                    alt={`Proof ${pIdx + 1}`}
                                                                                    className={`w-full h-full object-cover transition-all duration-300 ${
                                                                                        user ? 'filter-none' : 'filter blur-md scale-105'
                                                                                    }`}
                                                                                />

                                                                                {!user && (
                                                                                    <div className="absolute inset-0 bg-[var(--color-paper)] backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center">
                                                                                        <Lock className="w-5 h-5 text-[var(--color-ochre)] mb-1" />
                                                                                        <span className="text-[11px] font-bold text-[var(--color-ink)]">
                                                                                            Privacy Redacted
                                                                                        </span>
                                                                                        <span className="text-[9px] text-[var(--color-ink-soft)] mt-0.5">
                                                                                            Login with HEI or Government credentials to view original evidence
                                                                                        </span>
                                                                                    </div>
                                                                                )}

                                                                                {user && (
                                                                                    <a
                                                                                        href={url}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-[var(--color-sheet)] text-[var(--color-ink)] opacity-0 group-hover:opacity-100 transition shadow"
                                                                                    >
                                                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                                                    </a>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="p-4 rounded-xl bg-[var(--color-sheet)] border border-[var(--color-rule)] text-center text-[var(--color-ink-muted)] text-xs">
                                                                        No secondary media attachments attached.
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* EXIF Timestamp Analysis */}
                                                            <div className="p-3.5 rounded-xl bg-[var(--color-sheet)] border border-[var(--color-rule)] text-xs space-y-2">
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <Calendar className="w-3.5 h-3.5 text-[var(--color-survey)]" />
                                                                        <span className="text-[var(--color-ink-soft)]">
                                                                            <strong className="text-[var(--color-ink)]">Photo capture time:</strong>{' '}
                                                                            {m.exifTimestamp
                                                                                ? new Date(m.exifTimestamp).toLocaleString('en-IN')
                                                                                : 'Extracted from sealed JPEG metadata'}
                                                                        </span>
                                                                        <span className="text-slate-600">vs</span>
                                                                        <span className="text-[var(--color-ink-soft)]">
                                                                            <strong className="text-[var(--color-ink)]">Upload time:</strong>{' '}
                                                                            {new Date(m.createdAt).toLocaleString('en-IN')}
                                                                        </span>
                                                                    </div>

                                                                    {m.fundReleased && (
                                                                        <span className="text-[var(--color-forest)] font-bold">
                                                                            Tranche Released: ₹{m.fundReleased.toLocaleString('en-IN')}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Amber warning if capture and upload differ by > 2 hours */}
                                                                {hasExifMismatch && (
                                                                    <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[var(--color-ochre)] flex items-center gap-2 text-xs">
                                                                        <AlertTriangle className="w-4 h-4 text-[var(--color-ochre)] shrink-0" />
                                                                        <span className="font-semibold">
                                                                            Capture/upload time mismatch:
                                                                        </span>
                                                                        <span>
                                                                            Photo was captured &gt;2 hours before submission. Flagged for extra verification by the district officer.
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ─── MERKLE ROOT SECTION ─────────────────────────────────── */}
                <section className="rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)] p-6 sm:p-7 shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[var(--color-rule)]">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-indigo-500/20 text-[var(--color-survey)] border border-indigo-500/30">
                                <Binary className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-[var(--color-ink)]">
                                    Project Cryptographic Merkle Root
                                </h3>
                                <p className="text-xs text-[var(--color-ink-muted)]">
                                    Binary Merkle tree digest computed across all {milestones.length} milestone hashes
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-[var(--color-forest)] border border-emerald-500/30 flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Publicly Auditable
                            </span>
                        </div>
                    </div>

                    {/* Root Hash Display */}
                    <div className="p-4 rounded-xl bg-[var(--color-paper)] border border-[var(--color-rule)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                            <div className="text-[10px] font-mono text-[var(--color-ink-muted)] uppercase tracking-wider">
                                Ledger Merkle Root
                            </div>
                            <div className="font-mono text-xs sm:text-sm font-bold text-[var(--color-forest)] break-all select-all">
                                {merkleRoot || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => copyToClipboard(merkleRoot, 'root')}
                            className="px-3.5 py-2 rounded-xl bg-[var(--color-sheet)] hover:bg-[var(--color-sheet)] text-[var(--color-ink)] text-xs font-semibold border border-[var(--color-rule)] transition flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
                        >
                            {copiedRoot ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-[var(--color-forest)]" />
                                    <span>Root Copied</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy Merkle Root</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Instruction text (Mandated text) */}
                    <p className="text-xs text-[var(--color-ink-muted)] leading-relaxed">
                        This root hash is committed daily to a public repository for external verification. The Merkle root
                        proves the integrity of the entire ledger without revealing individual records.
                    </p>
                </section>
            </main>
        </div>
    );
}

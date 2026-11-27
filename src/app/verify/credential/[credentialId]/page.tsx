'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    Award,
    ShieldCheck,
    AlertTriangle,
    CheckCircle2,
    MapPin,
    Building2,
    GraduationCap,
    Download,
    Copy,
    Check,
    ExternalLink,
    FileText,
    ArrowLeft,
    RefreshCw,
} from 'lucide-react';
import { SDG_INFO } from '@/data/mockData';
import QRCode from 'qrcode';

export default function PublicCredentialVerificationPage() {
    const params = useParams();
    const credentialId = params?.credentialId as string;

    const [loading, setLoading] = useState(true);
    const [credential, setCredential] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copiedHash, setCopiedHash] = useState(false);
    const [qr, setQr] = useState<string | null>(null);

    // QR of this page's own address, so a printed or shared credential can be checked by scanning.
    useEffect(() => {
        if (credentialId) QRCode.toDataURL(window.location.href, { margin: 1, width: 160 }).then(setQr).catch(() => setQr(null));
    }, [credentialId]);

    useEffect(() => {
        if (!credentialId) return;

        fetch(`/api/hei/credentials/${credentialId}`)
            .then((r) => r.json())
            .then((res) => {
                if (res.success && res.data) {
                    setCredential(res.data);
                } else {
                    setError(res.error || 'No credential exists with this ID.');
                }
            })
            .catch((err) => {
                console.error('Error fetching credential:', err);
                setError('Could not reach the verification service. Please try again.');
            })
            .finally(() => setLoading(false));
    }, [credentialId]);

    const handleCopyHash = (hash: string) => {
        navigator.clipboard.writeText(hash);
        setCopiedHash(true);
        setTimeout(() => setCopiedHash(false), 2000);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--color-sheet)] text-[var(--color-ink)] flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-4">
                    <RefreshCw className="w-8 h-8 text-[var(--color-survey)] animate-spin" />
                </div>
                <h2 className="text-base font-bold text-[var(--color-ink)]">Checking credential...</h2>
                <p className="text-xs text-[var(--color-ink-muted)] mt-1">Recomputing the SHA-256 hash for {credentialId}</p>
            </div>
        );
    }

    if (error || !credential) {
        return (
            <div className="min-h-screen bg-[var(--color-sheet)] text-[var(--color-ink)] flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mb-4">
                    <AlertTriangle className="w-8 h-8 text-[var(--color-rust)]" />
                </div>
                <h2 className="text-lg font-bold text-[var(--color-ink)] mb-1">Credential Not Found</h2>
                <p className="text-xs text-[var(--color-ink-muted)] mb-6 max-w-md text-center">{error || 'Unable to locate certificate record.'}</p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-sheet)] hover:bg-[var(--color-paper)] text-xs font-semibold text-[var(--color-ink)] border border-[var(--color-rule)] transition"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Return to Portal</span>
                </Link>
            </div>
        );
    }

    // Only an explicit server-side match counts as verified.
    const isVerified = credential.verification?.valid === true;
    const displayHash = credential.hashValue;

    return (
        <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] py-10 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Navigation Bar */}
                <div className="flex items-center justify-between">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>SDG Nexus Home</span>
                    </Link>

                    <div className="flex items-center gap-2 text-[11px] text-[var(--color-ink-muted)] font-mono">
                        <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-forest)]" />
                        <span>Public Credential Verification</span>
                    </div>
                </div>

                {/* Status Banner */}
                {isVerified ? (
                    <div className="bg-emerald-950/80 border-2 border-emerald-500/60 rounded-2xl p-5 text-[var(--color-forest)] shadow-sm shadow-emerald-950/40 ">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30">
                                <CheckCircle2 className="w-7 h-7" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-ink)] tracking-wide uppercase">
                                        Verified — hash matches
                                    </h2>
                                </div>
                                <p className="text-xs text-[var(--color-forest)]/90 leading-relaxed">
                                    The SHA-256 hash recomputed from this credential&apos;s stored details matches the hash recorded when it was issued.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-rose-950/90 border-2 border-rose-500/80 rounded-2xl p-5 text-[var(--color-rust)] shadow-sm shadow-rose-950/40 ">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/30">
                                <AlertTriangle className="w-7 h-7" />
                            </div>
                            <div className="space-y-1">
                                <h2 className="text-base sm:text-lg font-extrabold text-[var(--color-ink)] tracking-wide uppercase">
                                    Not verified — hash mismatch
                                </h2>
                                <p className="text-xs text-[var(--color-rust)] leading-relaxed">
                                    The hash recomputed from this credential&apos;s stored details does not match the hash recorded at issue. The record may have been changed after it was issued.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Certificate Details Card */}
                <div className="bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm ">
                    {/* Header with Seal */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--color-rule)]">
                        <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-[var(--color-forest)] text-[var(--color-ink)] flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                <Award className="w-6 h-6" />
                            </div>
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-survey)] block">
                                    SDG Nexus
                                </span>
                                <h1 className="text-lg font-extrabold text-[var(--color-ink)]">
                                    Student Achievement Credential
                                </h1>
                            </div>
                        </div>
                        {qr && (
                            <figure className="flex items-center gap-3">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={qr} alt="QR code linking to this verification page" width={88} height={88} className="border border-[var(--color-rule)] bg-white" />
                                <figcaption className="text-[11px] text-[var(--color-ink-muted)] max-w-[9rem]">Scan to open this check on another device.</figcaption>
                            </figure>
                        )}
                    </div>

                    {/* Recipient & University Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-2xl p-4 space-y-1">
                            <span className="text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-wider block">
                                Student (name partly hidden)
                            </span>
                            <div className="flex items-center gap-2">
                                <GraduationCap className="w-4 h-4 text-[var(--color-survey)]" />
                                <span className="text-base font-extrabold text-[var(--color-ink)] tracking-wide">
                                    {credential.studentName}
                                </span>
                            </div>
                            <span className="text-xs text-[var(--color-ink-muted)] block">
                                {credential.branch} • Year {credential.year}
                            </span>
                        </div>

                        <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-2xl p-4 space-y-1">
                            <span className="text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-wider block">
                                Issuing Institution
                            </span>
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-[var(--color-forest)]" />
                                <span className="text-sm font-bold text-[var(--color-ink)] leading-snug">
                                    {credential.universityName ?? 'Not recorded'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Challenge & Field Work Details */}
                    <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-2xl p-5 space-y-3">
                        <span className="text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-wider block">
                            Documented Societal Challenge Resolved
                        </span>

                        <h3 className="text-sm sm:text-base font-bold text-[var(--color-ink)] leading-snug">
                            {credential.challengeTitle}
                        </h3>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-muted)] pt-1">
                            <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-[var(--color-survey)]" />
                                {credential.challengeDistrict}
                            </span>
                        </div>

                        {/* SDG Badges */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            {credential.sdgTags?.map((tagNum: number) => {
                                const info = SDG_INFO.find((s) => s.id === tagNum);
                                return (
                                    <span
                                        key={tagNum}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-[var(--color-ink)] shadow-xs"
                                        style={{ backgroundColor: info?.color || '#3b82f6' }}
                                    >
                                        <span>SDG {tagNum}</span>
                                        <span className="font-normal opacity-90">• {info?.name || 'Impact'}</span>
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {/* Credit metrics */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-3.5 text-center">
                            <span className="text-2xl font-extrabold text-[var(--color-survey)] block">
                                {credential.creditPoints}
                            </span>
                            <span className="text-[10px] font-bold text-[var(--color-ink-soft)] uppercase tracking-wider block mt-1">
                                Academic Credits
                            </span>
                            <span className="text-[9px] text-[var(--color-survey)]/80">30 hours = 1 credit</span>
                        </div>

                        <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-2xl p-3.5 text-center">
                            <span className="text-2xl font-extrabold text-[var(--color-ink)] block">
                                {credential.hoursContributed}h
                            </span>
                            <span className="text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-wider block mt-1">
                                Field Hours
                            </span>
                            <span className="text-[9px] text-[var(--color-ink-muted)]">Attested by faculty</span>
                        </div>
                    </div>

                    {/* Cryptographic Verification Box */}
                    <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-2xl p-4 sm:p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-[var(--color-forest)]" />
                                <span className="text-xs font-bold text-[var(--color-ink)] uppercase tracking-wider">
                                    SHA-256 Hash
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleCopyHash(displayHash)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition cursor-pointer"
                            >
                                {copiedHash ? <Check className="w-3 h-3 text-[var(--color-forest)]" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedHash ? 'Copied' : 'Copy Hash'}</span>
                            </button>
                        </div>

                        <div className="p-3 rounded-xl bg-[var(--color-sheet)] border border-[var(--color-rule)] text-[11px] font-mono text-[var(--color-survey)] break-all select-all">
                            {displayHash}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[var(--color-ink-muted)] pt-1">
                            <span>
                                Issued on: <strong className="text-[var(--color-ink-soft)]">{new Date(credential.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
                            </span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                        <a
                            href={`/api/hei/credentials/${credentialId}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                        >
                            <Download className="w-4 h-4" />
                            <span>Download Official PDF Certificate</span>
                        </a>

                        {credential.challengeId && (
                            <Link
                                href={`/track/${credential.challengeId}`}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[var(--color-sheet)] hover:bg-[var(--color-paper)] text-[var(--color-ink)] text-xs font-semibold border border-[var(--color-rule)] transition"
                            >
                                <FileText className="w-4 h-4 text-[var(--color-forest)]" />
                                <span>View Challenge</span>
                                <ExternalLink className="w-3.5 h-3.5 text-[var(--color-ink-muted)]" />
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Droplets,
    GraduationCap,
    HeartPulse,
    Sprout,
    Zap,
    Building2,
    Users,
    TreePine,
    MapPin,
    Navigation,
    UploadCloud,
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    ShieldCheck,
    AlertTriangle,
    Copy,
    ExternalLink,
    X,
    Sparkles,
    EyeOff,
    FileText,
} from 'lucide-react';
import { SDG_INFO } from '@/data/mockData';


const CATEGORIES = [
    { id: 'Drinking Water & Sanitation', label: 'Water & Sanitation', icon: Droplets, color: '#26bde2', sdgHint: 'SDG 6' },
    { id: 'Education & Digital Literacy', label: 'Education & Skills', icon: GraduationCap, color: '#c5192d', sdgHint: 'SDG 4' },
    { id: 'Rural Healthcare & Nutrition', label: 'Healthcare & Nutrition', icon: HeartPulse, color: '#4c9f38', sdgHint: 'SDG 3' },
    { id: 'Agriculture & Food Security', label: 'Agriculture & Irrigation', icon: Sprout, color: '#dda63a', sdgHint: 'SDG 2' },
    { id: 'Clean Energy & Power', label: 'Clean Energy & Grid', icon: Zap, color: '#fcc30b', sdgHint: 'SDG 7' },
    { id: 'Infrastructure & Connectivity', label: 'Roads & Infrastructure', icon: Building2, color: '#fd6e25', sdgHint: 'SDG 9' },
    { id: 'Women Empowerment & Livelihood', label: 'Women & Livelihood', icon: Users, color: '#ff3a21', sdgHint: 'SDG 5 & 8' },
    { id: 'Forest & Environment', label: 'Forest & Ecology', icon: TreePine, color: '#56c02b', sdgHint: 'SDG 15' },
];

const URGENCY_LEVELS = [
    { id: 'NORMAL', label: 'Normal Priority', desc: 'Standard civic improvement or long-term upgrade' },
    { id: 'MODERATE', label: 'Moderate Priority', desc: 'Affects daily routine of cluster of households' },
    { id: 'HIGH', label: 'High Priority', desc: 'Poses direct disruption to health, education or water' },
    { id: 'CRITICAL', label: 'Critical / Emergency', desc: 'Immediate risk to life, safety or severe disease outbreak' },
];

// Canvas API Image compression helper
async function compressImageToMax1200(file: File): Promise<{ dataUrl: string; originalSize: number; compressedSize: number }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 1200;

                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context not available'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                const head = 'data:image/jpeg;base64,';
                const compressedBytes = Math.round(((dataUrl.length - head.length) * 3) / 4);

                resolve({
                    dataUrl,
                    originalSize: file.size,
                    compressedSize: compressedBytes,
                });
            };
            img.onerror = () => reject(new Error('Failed to load image for compression'));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

export default function CitizenSubmitPage() {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

    // Form states
    const [category, setCategory] = useState<string>('Drinking Water & Sanitation');
    const [urgency, setUrgency] = useState<string>('NORMAL');

    const [regions, setRegions] = useState<{ name: string; districts: string[] }[]>([]);
    const [state, setState] = useState<string>('');
    const [district, setDistrict] = useState<string>('');
    useEffect(() => {
        fetch('/api/regions').then((r) => (r.ok ? r.json() : null)).then((j) => setRegions(j?.data ?? [])).catch(() => undefined);
    }, []);
    const districtOptions = regions.find((s) => s.name === state)?.districts ?? [];
    const [block, setBlock] = useState<string>('');
    const [village, setVillage] = useState<string>('');
    const [gpsLat, setGpsLat] = useState<number | null>(null);
    const [gpsLng, setGpsLng] = useState<number | null>(null);
    const [gpsDetecting, setGpsDetecting] = useState<boolean>(false);
    const [gpsStatus, setGpsStatus] = useState<string | null>(null);

    const [title, setTitle] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [photos, setPhotos] = useState<{ dataUrl: string; name: string; compressedSize: number }[]>([]);
    const [isCompressing, setIsCompressing] = useState<boolean>(false);

    const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
    const [submitterName, setSubmitterName] = useState<string>('');
    const [submitterPhone, setSubmitterPhone] = useState<string>('');
    const [isGpNode, setIsGpNode] = useState<boolean>(false);
    const [vleOperatorCode, setVleOperatorCode] = useState<string>('');

    // Submission states
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submittedData, setSubmittedData] = useState<any | null>(null);
    const [copied, setCopied] = useState<boolean>(false);

    // Engine 6: Deduplication States
    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState<boolean>(false);
    const [duplicateResult, setDuplicateResult] = useState<{
        isDuplicate: boolean;
        similarChallengeTitle?: string;
        similarChallengeDaysAgo?: number;
        similarChallengeId?: string;
        similarityScore?: number;
    } | null>(null);
    const [duplicateDecision, setDuplicateDecision] = useState<'none' | 'merged' | 'dismissed'>('none');
    // "merged" now means: the citizen supported the existing report instead of filing a new one.
    const [endorseError, setEndorseError] = useState<string | null>(null);
    const [honeypot, setHoneypot] = useState('');
    const supportExisting = async () => {
        if (!duplicateResult?.similarChallengeId) return;
        setEndorseError(null);
        const res = await fetch(`/api/challenges/${duplicateResult.similarChallengeId}/actions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ENDORSE' }),
        }).then((r) => r.json()).catch(() => ({ success: false, error: 'Could not reach the server.' }));
        // Already supported counts as done: the citizen's voice is on that report either way.
        if (res.success || /already endorsed/i.test(res.error ?? '')) setDuplicateDecision('merged');
        else setEndorseError(res.error ?? 'Could not record your support.');
    };

    const runDuplicateCheck = async () => {
        setStep(4);
        setIsCheckingDuplicate(true);
        try {
            const res = await fetch('/api/challenges/check-duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description,
                    district,
                }),
            });
            const json = await res.json();
            if (json.success && json.data?.isDuplicate) {
                setDuplicateResult(json.data);
                setDuplicateDecision('none');
            } else {
                setDuplicateResult(null);
            }
        } catch (err) {
            console.warn('Duplicate check error:', err);
        } finally {
            setIsCheckingDuplicate(false);
        }
    };

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // GPS Detector
    const handleDetectLocation = () => {
        if (!navigator.geolocation) {
            setGpsStatus('Geolocation is not supported by your browser.');
            return;
        }

        setGpsDetecting(true);
        setGpsStatus('Acquiring precise satellite coordinates...');

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setGpsLat(Number(pos.coords.latitude.toFixed(6)));
                setGpsLng(Number(pos.coords.longitude.toFixed(6)));
                setGpsDetecting(false);
                setGpsStatus(`GPS Captured (Accuracy ~${Math.round(pos.coords.accuracy)}m)`);
            },
            (err) => {
                setGpsDetecting(false);
                setGpsStatus(`Location error: ${err.message}. The report will be saved without coordinates.`);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    // File Upload with client-side Canvas compression
    const handleFilesSelected = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setIsCompressing(true);

        const newPhotos: { dataUrl: string; name: string; compressedSize: number }[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.type.startsWith('image/')) continue;
            try {
                const res = await compressImageToMax1200(file);
                newPhotos.push({
                    dataUrl: res.dataUrl,
                    name: file.name,
                    compressedSize: res.compressedSize,
                });
            } catch (err) {
                console.error('Error compressing image:', err);
            }
        }

        setPhotos((prev) => [...prev, ...newPhotos].slice(0, 5)); // Cap at 5 photos
        setIsCompressing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleRemovePhoto = (index: number) => {
        setPhotos((prev) => prev.filter((_, i) => i !== index));
    };

    // Submit handler
    const handleSubmit = async () => {
        setSubmitError(null);
        setSubmitting(true);

        try {
            const payload = {
                title,
                description,
                category,
                urgency,
                state,
                district,
                block: block || undefined,
                village: village || undefined,
                gpsLat,
                gpsLng,
                photoUrls: photos.map((p) => p.dataUrl),
                isAnonymous,
                submitterName: isAnonymous ? undefined : submitterName,
                submitterPhone: isAnonymous ? undefined : submitterPhone,
                isGpNode,
                vleOperatorCode: isGpNode ? vleOperatorCode.trim() : undefined,
                submittedVia: isGpNode ? 'GRAM_PANCHAYAT_NODE' : 'PORTAL',
                website: honeypot,
            };

            const res = await fetch('/api/challenges/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to submit challenge');
            }

            setSubmittedData(data.data);
        } catch (err: any) {
            setSubmitError(err.message || 'An error occurred while submitting.');
        } finally {
            setSubmitting(false);
        }
    };

    const copyTrackingId = (id: string) => {
        navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                {/* Portal Banner Header */}
                <div className="mb-8 text-center sm:text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--color-rule)] pb-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[var(--color-forest)] text-xs font-semibold uppercase tracking-wider mb-2">
                            <Sparkles className="w-3.5 h-3.5" />
                            SDG Nexus • Report a local problem
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--color-ink)]">
                            Citizen Challenge Submission Portal
                        </h1>
                        <p className="mt-1 text-sm sm:text-base text-[var(--color-ink-muted)]">
                            Report a problem in your area. A district officer will review it and route it to a university that can solve it.
                        </p>
                    </div>

                    <Link
                        href="/track"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-[var(--color-sheet)] hover:bg-[var(--color-paper)] text-[var(--color-ink)] border border-[var(--color-rule)] transition"
                    >
                        <FileText className="w-4 h-4 text-[var(--color-forest)]" />
                        Track Existing Challenge
                    </Link>
                </div>

                {/* If already submitted, show Success View */}
                {submittedData ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[var(--color-sheet)]  border border-emerald-500/30 rounded-2xl p-6 sm:p-10 shadow-sm shadow-emerald-500/5 text-center"
                    >
                        <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto mb-4 text-[var(--color-forest)]">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-bold text-[var(--color-ink)] mb-2">
                            Challenge Submitted Successfully!
                        </h2>
                        <p className="text-[var(--color-ink-soft)] max-w-xl mx-auto text-sm sm:text-base mb-6">
                            Your report has been saved, tagged with the UN SDGs it relates to, and sent to the district officer for review.
                        </p>

                        {/* Tracking Code Box */}
                        <div className="bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl p-4 max-w-md mx-auto mb-6">
                            <span className="text-xs text-[var(--color-ink-muted)] uppercase font-semibold tracking-wider block mb-1">
                                Unique Challenge ID / Tracking Token
                            </span>
                            <div className="flex items-center justify-between gap-3 bg-[var(--color-paper)] px-3 py-2 rounded-lg border border-[var(--color-rule)]">
                                <code className="text-[var(--color-forest)] font-mono text-sm sm:text-base break-all">
                                    {submittedData.challengeId}
                                </code>
                                <button
                                    onClick={() => copyTrackingId(submittedData.challengeId)}
                                    className="p-1.5 hover:bg-[var(--color-sheet)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] rounded transition"
                                    title="Copy to clipboard"
                                >
                                    {copied ? <CheckCircle2 className="w-4 h-4 text-[var(--color-forest)]" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                            {copied && <span className="text-xs text-[var(--color-forest)] mt-1 block">Copied to clipboard!</span>}
                        </div>

                        {/* AI Classification Feedback */}
                        {submittedData.sdgTags && submittedData.sdgTags.length > 0 && (
                            <div className="mb-8 p-4 bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl max-w-lg mx-auto">
                                <span className="text-xs font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider block mb-2">
                                    AI Tagged UN Sustainable Development Goals
                                </span>
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    {submittedData.sdgTags.map((tagId: number) => {
                                        const sdg = SDG_INFO.find((s) => s.id === tagId);
                                        return (
                                            <span
                                                key={tagId}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-[var(--color-ink)] shadow-sm"
                                                style={{ backgroundColor: sdg ? sdg.color : '#059669' }}
                                            >
                                                <span>{sdg?.icon || ''}</span>
                                                <span>SDG {tagId}: {sdg?.name || 'Sustainable Goal'}</span>
                                            </span>
                                        );
                                    })}
                                </div>
                                {submittedData.reasoning && (
                                    <p className="text-xs text-[var(--color-ink-muted)] mt-3 italic text-center">
                                        &ldquo;{submittedData.reasoning}&rdquo;
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Action CTAs */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link
                                href={`/track/${submittedData.challengeId}`}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-forest)] hover:from-emerald-500 hover:to-teal-500 text-[var(--color-ink)] font-medium shadow-lg shadow-emerald-600/20 transition"
                            >
                                Track Visual 8-Stage Progress
                                <ExternalLink className="w-4 h-4" />
                            </Link>

                            <button
                                onClick={() => {
                                    setSubmittedData(null);
                                    setStep(1);
                                    setTitle('');
                                    setDescription('');
                                    setPhotos([]);
                                    setGpsLat(null);
                                    setGpsLng(null);
                                    setGpsStatus(null);
                                }}
                                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[var(--color-sheet)] hover:bg-[var(--color-paper)] text-[var(--color-ink-soft)] font-medium transition"
                            >
                                Submit Another Challenge
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    /* 4-Step Form Wizard */
                    <div className="bg-[var(--color-sheet)]  border border-[var(--color-rule)] rounded-2xl p-6 sm:p-8 shadow-sm shadow-black/40">
                        {/* Progress Stepper Indicator */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-2">
                                {[
                                    { num: 1, name: 'Category' },
                                    { num: 2, name: 'Location' },
                                    { num: 3, name: 'Problem & Evidence' },
                                    { num: 4, name: 'Submitter & Review' },
                                ].map((s) => (
                                    <div
                                        key={s.num}
                                        className={`flex items-center gap-2 text-xs sm:text-sm font-medium ${
                                            step >= s.num ? 'text-[var(--color-forest)]' : 'text-[var(--color-ink-muted)]'
                                        }`}
                                    >
                                        <div
                                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs border ${
                                                step >= s.num
                                                    ? 'bg-emerald-500/20 border-emerald-400 text-[var(--color-forest)]'
                                                    : 'bg-[var(--color-sheet)] border-[var(--color-rule)] text-[var(--color-ink-muted)]'
                                            }`}
                                        >
                                            {step > s.num ? <CheckCircle2 className="w-4 h-4" aria-label="done" /> : s.num}
                                        </div>
                                        <span className="hidden sm:inline">{s.name}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="w-full bg-[var(--color-sheet)] h-1.5 rounded-full overflow-hidden">
                                <div
                                    className="bg-emerald-500 h-full transition-all duration-300 ease-out"
                                    style={{ width: `${((step - 1) / 3) * 100}%` }}
                                />
                            </div>
                        </div>

                        {submitError && (
                            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[var(--color-rust)] flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <div className="text-sm">
                                    <p className="font-semibold">Submission failed</p>
                                    <p>{submitError}</p>
                                </div>
                            </div>
                        )}

                        <AnimatePresence mode="wait">
                            {/* STEP 1: CATEGORY & URGENCY */}
                            {step === 1 && (
                                <motion.div
                                    key="step1"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    <div>
                                        <h2 className="text-xl font-bold text-[var(--color-ink)] mb-1">Select Challenge Category</h2>
                                        <p className="text-sm text-[var(--color-ink-muted)]">
                                            Choose the civic domain that best represents the challenge faced in your community.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                        {CATEGORIES.map((cat) => {
                                            const Icon = cat.icon;
                                            const isSelected = category === cat.id;
                                            return (
                                                <button
                                                    key={cat.id}
                                                    type="button"
                                                    onClick={() => setCategory(cat.id)}
                                                    className={`p-4 rounded-xl border text-left flex items-start gap-3.5 transition-all ${
                                                        isSelected
                                                            ? 'bg-emerald-500/10 border-emerald-500/80 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500'
                                                            : 'bg-[var(--color-sheet)] border-[var(--color-rule)] hover:bg-[var(--color-sheet)] hover:border-[var(--color-rule)]'
                                                    }`}
                                                >
                                                    <div
                                                        className="p-2.5 rounded-lg flex items-center justify-center flex-shrink-0"
                                                        style={{
                                                            backgroundColor: `${cat.color}20`,
                                                            color: cat.color,
                                                            border: `1px solid ${cat.color}40`,
                                                        }}
                                                    >
                                                        <Icon className="w-5 h-5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-sm font-semibold text-[var(--color-ink)] block">
                                                            {cat.label}
                                                        </span>
                                                        <span className="text-xs text-[var(--color-ink-muted)] flex items-center gap-1 mt-0.5">
                                                            Target: <span className="text-[var(--color-forest)] font-medium">{cat.sdgHint}</span>
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="pt-4 border-t border-[var(--color-rule)]">
                                        <label className="block text-sm font-medium text-[var(--color-ink-soft)] mb-2">
                                            Perceived Severity / Urgency
                                        </label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {URGENCY_LEVELS.map((u) => (
                                                <button
                                                    key={u.id}
                                                    type="button"
                                                    onClick={() => setUrgency(u.id)}
                                                    className={`p-3 rounded-lg border text-left transition ${
                                                        urgency === u.id
                                                            ? 'bg-[var(--color-sheet)] border-emerald-500/80 text-[var(--color-ink)]'
                                                            : 'bg-slate-850 border-[var(--color-rule)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between text-xs font-semibold">
                                                        <span>{u.label}</span>
                                                        {urgency === u.id && <span className="text-[var(--color-forest)]">● Selected</span>}
                                                    </div>
                                                    <p className="text-xs text-[var(--color-ink-muted)] mt-1">{u.desc}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setStep(2)}
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition"
                                        >
                                            Next: Location Details
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {/* STEP 2: LOCATION DETAILS */}
                            {step === 2 && (
                                <motion.div
                                    key="step2"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    <div>
                                        <h2 className="text-xl font-bold text-[var(--color-ink)] mb-1">Geographic Location</h2>
                                        <p className="text-sm text-[var(--color-ink-muted)]">
                                            Tell us where the problem is.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="cs-state" className="block text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wider mb-1.5">
                                                State / UT *
                                            </label>
                                            <select id="cs-state" value={state} onChange={(e) => { setState(e.target.value); setDistrict(''); }} className="w-full bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl px-3.5 py-2.5 text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-emerald-500">
                                                <option value="">{regions.length ? 'Choose a state…' : 'Loading…'}</option>
                                                {regions.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="cs-district" className="block text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wider mb-1.5">
                                                District *
                                            </label>
                                            <select id="cs-district" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!state} className="w-full bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl px-3.5 py-2.5 text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
                                                <option value="">{state ? 'Choose a district…' : 'Pick a state first'}</option>
                                                {districtOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wider mb-1.5">
                                                Block / Tehsil
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Kanke, Namkum, Chas, etc."
                                                value={block}
                                                onChange={(e) => setBlock(e.target.value)}
                                                className="w-full bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl px-3.5 py-2.5 text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            />
                                        </div>

                                        <div className="sm:col-span-2">
                                            <label className="block text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wider mb-1.5">
                                                Village / Ward / Locality
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Boreya Village, Ward 4, Near Primary Health Center"
                                                value={village}
                                                onChange={(e) => setVillage(e.target.value)}
                                                className="w-full bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl px-3.5 py-2.5 text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            />
                                        </div>
                                    </div>

                                    {/* GPS Coordinate Auto-Detection */}
                                    <div className="p-4 rounded-xl bg-[var(--color-sheet)] border border-[var(--color-rule)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-[var(--color-forest)] border border-emerald-500/20">
                                                <MapPin className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-semibold text-[var(--color-ink)]">GPS Coordinate Precision</h3>
                                                <p className="text-xs text-[var(--color-ink-muted)]">
                                                    Pinpoint coordinates feed our Leaflet SDG Heatmap and District Command Center.
                                                </p>
                                                {gpsLat && gpsLng && (
                                                    <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-500/30 text-[var(--color-forest)] text-xs font-mono">
                                                        <span>Lat: {gpsLat}</span>
                                                        <span>•</span>
                                                        <span>Lng: {gpsLng}</span>
                                                    </div>
                                                )}
                                                {gpsStatus && !gpsLat && (
                                                    <p className="text-xs text-[var(--color-ochre)] mt-1">{gpsStatus}</p>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleDetectLocation}
                                            disabled={gpsDetecting}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-paper)] hover:bg-slate-600 text-[var(--color-ink)] text-xs font-semibold transition disabled:opacity-50"
                                        >
                                            <Navigation className={`w-4 h-4 ${gpsDetecting ? 'animate-spin' : 'text-[var(--color-forest)]'}`} />
                                            {gpsDetecting ? 'Detecting...' : 'Detect My Location'}
                                        </button>
                                    </div>

                                    <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setStep(1)}
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-sheet)] hover:bg-[var(--color-paper)] text-[var(--color-ink-soft)] font-medium transition"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                            Back
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStep(3)}
                                            disabled={!state || !district}
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Next: Problem & Evidence
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {/* STEP 3: PROBLEM STATEMENT & EVIDENCE */}
                            {step === 3 && (
                                <motion.div
                                    key="step3"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    <div>
                                        <h2 className="text-xl font-bold text-[var(--color-ink)] mb-1">Challenge Details & Evidence</h2>
                                        <p className="text-sm text-[var(--color-ink-muted)]">
                                            Provide a detailed summary. Our AI engine uses this description to identify UN SDG targets.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wider mb-1.5">
                                            Challenge Title *
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Contaminated ground water causing fluoride poisoning in 4 hamlets"
                                            value={title}
                                            maxLength={120}
                                            onChange={(e) => setTitle(e.target.value)}
                                            className="w-full bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl px-3.5 py-2.5 text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                                        />
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="block text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wider">
                                                Detailed Problem Description *
                                            </label>
                                            <span className="text-xs text-[var(--color-ink-muted)]">
                                                {description.trim().length} / 2000 characters (minimum 30)
                                            </span>
                                        </div>
                                        <textarea
                                            rows={4}
                                            placeholder="Describe who is impacted, how long this issue has persisted, previous attempts to fix it, and what technological intervention or university research could solve it..."
                                            value={description}
                                            maxLength={2000}
                                            onChange={(e) => setDescription(e.target.value)}
                                            className="w-full bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl p-3.5 text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                                        />
                                    </div>

                                    {/* Honeypot: invisible to people and screen readers; bots that fill it are refused. */}
                                    <input type="text" name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
                                        tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />

                                    {/* Media Upload with Client-Side Canvas Compression */}
                                    <div>
                                        <label className="block text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wider mb-1.5">
                                            Ground Evidence Photos (Max 5, auto-compressed to &lt;1200px)
                                        </label>

                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="border-2 border-dashed border-[var(--color-rule)] hover:border-emerald-500/60 bg-[var(--color-sheet)] hover:bg-[var(--color-sheet)] rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center"
                                        >
                                            <UploadCloud className="w-8 h-8 text-[var(--color-ink-muted)] mb-2" />
                                            <p className="text-sm font-medium text-[var(--color-ink)]">
                                                Click to upload ground photos or drag and drop
                                            </p>
                                            <p className="text-xs text-[var(--color-ink-muted)] mt-1">
                                                Images are compressed client-side via HTML5 Canvas API before uploading.
                                            </p>
                                        </div>

                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={(e) => handleFilesSelected(e.target.files)}
                                            className="hidden"
                                        />

                                        {isCompressing && (
                                            <p className="text-xs text-[var(--color-forest)] mt-2 flex items-center gap-2">
                                                Compressing images client-side...
                                            </p>
                                        )}

                                        {/* Photo Previews */}
                                        {photos.length > 0 && (
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
                                                {photos.map((p, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="relative rounded-lg overflow-hidden border border-[var(--color-rule)] bg-[var(--color-sheet)] aspect-square group"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={p.dataUrl}
                                                            alt={p.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRemovePhoto(idx);
                                                            }}
                                                            className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-600 text-white rounded-full transition"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-[var(--color-ink-soft)] px-1 py-0.5 truncate text-center">
                                                            {(p.compressedSize / 1024).toFixed(0)} KB
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setStep(2)}
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-sheet)] hover:bg-[var(--color-paper)] text-[var(--color-ink-soft)] font-medium transition"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                            Back
                                        </button>
                                        <button
                                            type="button"
                                            disabled={title.trim().length < 5 || description.trim().length < 30 || isCheckingDuplicate}
                                            onClick={runDuplicateCheck}
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                        >
                                            {isCheckingDuplicate ? (
                                                <>
                                                    Checking Duplicates...
                                                </>
                                            ) : (
                                                <>
                                                    Next: Submitter & Review
                                                    <ArrowRight className="w-4 h-4" />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {/* STEP 4: SUBMITTER ATTRIBUTION & REVIEW */}
                            {step === 4 && (
                                <motion.div
                                    key="step4"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    <div>
                                        <h2 className="text-xl font-bold text-[var(--color-ink)] mb-1">Submitter Identity & Final Review</h2>
                                        <p className="text-sm text-[var(--color-ink-muted)]">
                                            Choose whether to submit anonymously or provide contact details for verification updates.
                                        </p>
                                    </div>

                                    {/* Engine 6: Duplicate Warning Panel */}
                                    {duplicateResult?.isDuplicate && duplicateDecision === 'none' && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-[var(--color-ochre)] space-y-3 shadow-lg shadow-amber-500/5"
                                        >
                                            <div className="flex items-start gap-3">
                                                <AlertTriangle className="w-5 h-5 text-[var(--color-ochre)] flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <h4 className="font-bold text-[var(--color-ochre)] text-sm">
                                                        Potential Duplicate Challenge Detected
                                                    </h4>
                                                    <p className="text-xs text-[var(--color-ochre)]/90 mt-1 leading-relaxed">
                                                        A similar challenge was submitted {duplicateResult.similarChallengeDaysAgo || 14} days ago in {district}:
                                                        <span className="font-semibold text-[var(--color-ink)] italic"> "{duplicateResult.similarChallengeTitle}"</span>.
                                                        Is your problem the same one?
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2.5 pt-1 pl-8">
                                                <button
                                                    type="button"
                                                    onClick={supportExisting}
                                                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-sm cursor-pointer"
                                                >
                                                    Yes, it&apos;s the same problem — support that report
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDuplicateDecision('dismissed');
                                                    }}
                                                    className="px-4 py-2 rounded-xl bg-[var(--color-sheet)] hover:bg-[var(--color-paper)] text-[var(--color-ink)] font-semibold text-xs border border-[var(--color-rule)] transition cursor-pointer"
                                                >
                                                    No, this is different
                                                </button>
                                            </div>
                                            {endorseError && <p role="alert" className="pl-8 text-xs text-[var(--color-rust)]">{endorseError}</p>}
                                        </motion.div>
                                    )}

                                    {duplicateDecision === 'merged' && (
                                        <div role="status" className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[var(--color-forest)] text-sm">
                                            Your support was added to &ldquo;{duplicateResult?.similarChallengeTitle}&rdquo;. No new report is needed; you can follow it here:{' '}
                                            <Link href={`/track/${duplicateResult?.similarChallengeId}`} className="underline font-semibold">track that report</Link>.
                                        </div>
                                    )}

                                    {/* Anonymous Toggle */}
                                    <div className="p-4 rounded-xl bg-[var(--color-sheet)] border border-[var(--color-rule)] flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 rounded-lg bg-indigo-500/10 text-[var(--color-survey)] border border-indigo-500/20">
                                                <EyeOff className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <span className="text-sm font-semibold text-[var(--color-ink)] block">
                                                    Submit Anonymously
                                                </span>
                                                <span className="text-xs text-[var(--color-ink-muted)] block">
                                                    Your name and phone will not be shared publicly or displayed on tracking pages.
                                                </span>
                                            </div>
                                        </div>

                                        <input
                                            type="checkbox"
                                            checked={isAnonymous}
                                            onChange={(e) => setIsAnonymous(e.target.checked)}
                                            className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                                        />
                                    </div>

                                    {!isAnonymous && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wider mb-1.5">
                                                    Your Full Name (Optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Ramesh Mahto"
                                                    value={submitterName}
                                                    onChange={(e) => setSubmitterName(e.target.value)}
                                                    className="w-full bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl px-3.5 py-2.5 text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wider mb-1.5">
                                                    Mobile Number (Optional)
                                                </label>
                                                <input
                                                    type="tel"
                                                    placeholder="e.g. 9876543210"
                                                    value={submitterPhone}
                                                    onChange={(e) => setSubmitterPhone(e.target.value)}
                                                    className="w-full bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl px-3.5 py-2.5 text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Privacy Assurance Banner */}
                                    <div className="p-3.5 rounded-xl bg-slate-850 border border-[var(--color-rule)] flex items-start gap-3 text-xs text-[var(--color-ink-muted)]">
                                        <ShieldCheck className="w-4 h-4 text-[var(--color-forest)] flex-shrink-0 mt-0.5" />
                                        <span>
                                            Strict Data Protection: In compliance with digital privacy standards, SDG Nexus does not store Aadhaar numbers or biometric information. Submitter identity is masked for public ledger records.
                                        </span>
                                    </div>

                                    {/* Gram Panchayat / CSC Node Submission Toggle */}
                                    <div className="p-4 rounded-xl bg-[var(--color-sheet)] border border-[var(--color-rule)] space-y-3">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-[var(--color-forest)] border border-emerald-500/20">
                                                    <Building2 className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <span className="text-sm font-semibold text-[var(--color-ink)] block">
                                                        Submitting for someone else (CSC / local body)
                                                    </span>
                                                    <span className="text-xs text-[var(--color-ink-muted)] block">
                                                        Is this being submitted on behalf of a community member at a CSC/GP Node?
                                                    </span>
                                                </div>
                                            </div>

                                            <input
                                                type="checkbox"
                                                checked={isGpNode}
                                                onChange={(e) => setIsGpNode(e.target.checked)}
                                                className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                                            />
                                        </div>

                                        {isGpNode && (
                                            <div className="pt-2 border-t border-[var(--color-rule)]">
                                                <label className="block text-xs font-semibold text-[var(--color-ink-soft)] uppercase tracking-wider mb-1.5">
                                                    CSC / VLE Operator Code <span className="text-[var(--color-forest)]">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. VLE-JH-RAN-0824"
                                                    value={vleOperatorCode}
                                                    onChange={(e) => setVleOperatorCode(e.target.value)}
                                                    className="w-full bg-[var(--color-sheet)] border border-[var(--color-rule)] rounded-xl px-3.5 py-2.5 text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
                                                />
                                                <p className="text-[11px] text-[var(--color-ink-muted)] mt-1">
                                                    This challenge will be tagged as <span className="text-[var(--color-forest)] font-semibold">GP Node</span> in the Government verification queue.
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Challenge Summary Card */}
                                    <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-xl p-4 space-y-3">
                                        <h3 className="text-xs font-bold text-[var(--color-ink-muted)] uppercase tracking-wider">
                                            Submission Summary
                                        </h3>
                                        <div className="text-sm space-y-2">
                                            <div>
                                                <span className="text-[var(--color-ink-muted)]">Category: </span>
                                                <span className="text-[var(--color-ink)] font-medium">{category}</span>
                                            </div>
                                            <div>
                                                <span className="text-[var(--color-ink-muted)]">Location: </span>
                                                <span className="text-[var(--color-ink)] font-medium">
                                                    {district}, {state} {block ? `• Block: ${block}` : ''} {village ? `• Village: ${village}` : ''}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-[var(--color-ink-muted)]">Title: </span>
                                                <span className="text-[var(--color-ink)] font-medium">{title}</span>
                                            </div>
                                            <div>
                                                <span className="text-[var(--color-ink-muted)]">Evidence: </span>
                                                <span className="text-[var(--color-ink)] font-medium">{photos.length} photo(s) attached</span>
                                            </div>
                                            <div>
                                                <span className="text-[var(--color-ink-muted)]">Submitter: </span>
                                                <span className="text-[var(--color-ink)] font-medium">
                                                    {isAnonymous ? 'Anonymous Citizen' : (submitterName || 'Citizen')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setStep(3)}
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-sheet)] hover:bg-[var(--color-paper)] text-[var(--color-ink-soft)] font-medium transition"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                            Back
                                        </button>
                                        <button
                                            type="button"
                                            disabled={submitting || duplicateDecision === 'merged'}
                                            onClick={handleSubmit}
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-[var(--color-forest)] hover:from-emerald-500 hover:to-teal-500 text-[var(--color-ink)] font-semibold shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
                                        >
                                            {submitting ? (
                                                <>
                                                    Processing & Tagging SDGs...
                                                </>
                                            ) : (
                                                <>
                                                    Submit report
                                                    <Sparkles className="w-4 h-4" />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
}

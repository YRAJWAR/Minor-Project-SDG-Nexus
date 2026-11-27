'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Award,
    CheckCircle2,
    Users,
    MapPin,
    Building2,
    Clock,
    FileText,
    Download,
    ExternalLink,
    X,
    Sparkles,
    ShieldCheck,
    Star,
    ChevronRight,
    Search,
    RefreshCw,
    GraduationCap,
    Check,
    Copy,
    AlertCircle,
    Info,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { SDG_INFO } from '@/data/mockData';

interface CompletedProject {
    id: string;
    proposalId: string;
    challengeId: string;
    challengeTitle: string;
    district: string;
    category: string;
    sdgTags: number[];
    csrFunder: string | null;
    timelineWeeks: number;
    facultyName: string;
    facultyEmail: string;
    universityName: string;
    allMilestonesApproved: boolean;
    citizenRating: number | null;
    ngoPartner: string | null;
    teamMembers: TeamMemberItem[];
    existingCredentials?: any[];
}

interface TeamMemberItem {
    studentProfileId: string;
    studentName: string;
    email: string;
    branch: string;
    year: number;
    role: string;
    skills: string[];
    defaultHours: number; // verified hours logged on the milestones
    defaultCredits: number;
    ngoRating: number | null;
}

interface StudentFormState {
    studentProfileId: string;
    studentName: string;
    branch: string;
    year: number;
    creditHours: number;
    facultyRating: number;
}

export default function StudentCredentialsPage() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<CompletedProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProject, setSelectedProject] = useState<CompletedProject | null>(null);

    // Modal / Drawer state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [studentForms, setStudentForms] = useState<Record<string, StudentFormState>>({});
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isIssuing, setIsIssuing] = useState(false);
    const [issueSuccessData, setIssueSuccessData] = useState<any | null>(null);

    // Copy hash helper
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/hei/credentials/completed-projects');
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                setProjects(json.data);
                setLoadError(null);
            } else {
                setLoadError(json.error || 'Projects could not be loaded.');
            }
        } catch (err) {
            console.error('Error loading completed projects:', err);
            setLoadError('Could not reach the server.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, []);

    // Open Credential Form
    const handleOpenForm = (proj: CompletedProject) => {
        setSelectedProject(proj);
        setIssueSuccessData(null);

        // Initialize state for each student
        const initialMap: Record<string, StudentFormState> = {};
        proj.teamMembers.forEach((member) => {
            initialMap[member.studentProfileId] = {
                studentProfileId: member.studentProfileId,
                studentName: member.studentName,
                branch: member.branch,
                year: member.year,
                creditHours: member.defaultHours,
                facultyRating: 4.5,
            };
        });

        setStudentForms(initialMap);
        setIsFormOpen(true);
    };

    // Same blend the server saves: faculty 40% + NGO partner 40% + citizen 20% (faculty 80% without an NGO rating).
    const computeOverallRating = (facultyRating: number, ngo?: number | null) => {
        const parts: [number, number][] = [[facultyRating, ngo ? 40 : 80]];
        if (ngo) parts.push([ngo, 40]);
        if (selectedProject?.citizenRating) parts.push([selectedProject.citizenRating, 20]);
        const w = parts.reduce((t, [, k]) => t + k, 0);
        return Math.round((parts.reduce((t, [v, k]) => t + v * k, 0) / w) * 10) / 10;
    };

    // Handle Faculty Slider change
    const handleFacultyRatingChange = (studentProfileId: string, rating: number) => {
        setStudentForms((prev) => ({
            ...prev,
            [studentProfileId]: {
                ...prev[studentProfileId],
                facultyRating: rating,
            },
        }));
    };

    // Issue NEP Credits
    const handleIssueCredits = async () => {
        if (!selectedProject) return;

        setIsIssuing(true);
        try {
            const payloadStudents = Object.values(studentForms).map((form) => ({
                studentProfileId: form.studentProfileId,
                studentName: form.studentName,
                branch: form.branch,
                year: form.year,
                overallRating: form.facultyRating,
            }));

            const res = await fetch('/api/hei/credentials/issue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: selectedProject.id,
                    challengeId: selectedProject.challengeId,
                    students: payloadStudents,
                }),
            });

            const json = await res.json();
            if (json.success && json.data) {
                setIssueSuccessData(json.data);
                // Refresh completed projects to update issued state
                fetchProjects();
            } else {
                alert(json.error || 'Failed to issue credentials. Please retry.');
            }
        } catch (err) {
            console.error('Error submitting credentials:', err);
            alert('Failed to connect to credential issuance node.');
        } finally {
            setIsIssuing(false);
        }
    };

    const handleCopyHash = (hash: string, id: string) => {
        navigator.clipboard.writeText(hash);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                            Experiential learning credits
                        </span>
                    </div>
                    <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        <Award className="w-6 h-6 text-indigo-600" />
                        Student Credential & Academic Credit Generator
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Attest field hours and issue verifiable credits for projects where every milestone has been approved.
                    </p>
                </div>

            </div>

            {/* Institutional Framework Banner */}
            <div className="bg-[var(--color-survey-deep)] text-white rounded-2xl p-5 shadow-sm border border-indigo-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                <div className="space-y-1.5 max-w-2xl">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span className="font-bold text-indigo-200 uppercase tracking-wider text-[11px]">
                            How credits are calculated
                        </span>
                    </div>
                    <p className="text-slate-300 text-xs leading-relaxed">
                        <strong>30 verified field hours = 1 credit</strong> (whole credits only). The rating shown on a credential is currently the faculty rating; NGO and community ratings will be added when they are collected.
                    </p>
                </div>

                <div className="flex items-center gap-3 bg-white/10 p-3 rounded-xl border border-white/10 shrink-0">
                    <GraduationCap className="w-6 h-6 text-indigo-300" />
                    <div>
                        <span className="text-[10px] text-indigo-200 uppercase block font-semibold">Attesting Mentor</span>
                        <span className="text-xs font-bold text-white block">
                            {user?.name}
                        </span>
                        <span className="text-[10px] text-slate-300 block">
                            {user?.organization_name}
                        </span>
                    </div>
                </div>
            </div>

            {/* COMPLETED PROJECTS LIST */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Completed & CSR-Approved Projects ({projects.length})
                        </h2>
                        <span className="text-[11px] text-slate-500">
                            Proposals with status ACCEPTED where all milestones are verified and ready for credentialing
                        </span>
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="h-44 bg-white rounded-2xl border border-slate-200 animate-pulse" />
                        <div className="h-44 bg-white rounded-2xl border border-slate-200 animate-pulse" />
                    </div>
                ) : loadError ? (
                    <div className="glass-card p-8 text-center text-sm text-rose-600">{loadError}</div>
                ) : projects.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-400">
                        <Award className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-700">No projects awaiting credential issuance</p>
                        <p className="text-xs text-slate-400 mt-1">
                            Projects will appear here once all milestones receive final CSR approval.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {projects.map((proj) => {
                            const hasExistingCreds = proj.existingCredentials && proj.existingCredentials.length > 0;
                            return (
                                <div
                                    key={proj.id}
                                    className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:border-indigo-300 transition flex flex-col justify-between space-y-4"
                                >
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                                All Milestones Approved
                                            </span>

                                            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                                                <Users className="w-3.5 h-3.5 text-indigo-500" />
                                                {proj.teamMembers?.length || 4} Team Members
                                            </span>
                                        </div>

                                        <h3 className="text-sm font-bold text-slate-900 leading-snug">
                                            {proj.challengeTitle}
                                        </h3>

                                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                                                {proj.district}
                                            </span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                                                {proj.csrFunder ?? 'Funder not recorded'}
                                            </span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                                {proj.timelineWeeks} Weeks
                                            </span>
                                        </div>

                                        {/* SDG Badges */}
                                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                            {proj.sdgTags.map((tagNum) => {
                                                const info = SDG_INFO.find((s) => s.id === tagNum);
                                                return (
                                                    <span
                                                        key={tagNum}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-white shadow-2xs"
                                                        style={{ backgroundColor: info?.color || '#3b82f6' }}
                                                    >
                                                        SDG {tagNum}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                                        <div className="text-[11px] text-slate-500">
                                            {hasExistingCreds ? (
                                                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                                    <ShieldCheck className="w-3.5 h-3.5" />
                                                    {proj.existingCredentials?.length} Credentials Issued
                                                </span>
                                            ) : (
                                                <span className="text-amber-600 font-semibold">
                                                    Ready for Credentialing
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Link
                                                href={`/project/${proj.id}/ledger`}
                                                target="_blank"
                                                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                                                title="View Public Ledger"
                                            >
                                                Ledger ↗
                                            </Link>

                                            <button
                                                type="button"
                                                onClick={() => handleOpenForm(proj)}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer"
                                            >
                                                <Award className="w-3.5 h-3.5" />
                                                <span>{hasExistingCreds ? 'Re-Issue / Manage' : 'Issue Credentials'}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* CREDENTIAL ISSUANCE FORM (Modal / Side Drawer) */}
            <AnimatePresence>
                {isFormOpen && selectedProject && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
                        <motion.div
                            initial={{ opacity: 1, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
                        >
                            {/* Modal Header */}
                            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                                        <Award className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-extrabold text-slate-900 leading-snug">
                                            Student Credential Attestation
                                        </h2>
                                        <p className="text-xs text-slate-500">
                                            {selectedProject.challengeTitle} • {selectedProject.district}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsFormOpen(false)}
                                    className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                                {!issueSuccessData ? (
                                    <>
                                        {/* Guide Box */}
                                        <div className="p-3.5 bg-blue-50 border border-blue-200/80 rounded-xl flex items-start gap-2.5 text-blue-900">
                                            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-bold block">Evaluation Weights:</span>
                                                <span>
                                                    Hours are the verified hours logged on this project&apos;s milestones (30 hours = 1 credit; at least 30 needed). The saved rating blends your rating (40%), the NGO partner&apos;s (40%, if any) and the citizen&apos;s rating of the fix (20%).
                                                </span>
                                            </div>
                                        </div>

                                        {/* Students Row Form */}
                                        <div className="space-y-4">
                                            <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                                                Team Members ({selectedProject.teamMembers?.length || 0})
                                            </div>

                                            {selectedProject.teamMembers?.map((student, idx) => {
                                                const formState = studentForms[student.studentProfileId] || {
                                                    creditHours: 120,
                                                    facultyRating: 4.5,
                                                };
                                                const overallRating = computeOverallRating(formState.facultyRating, student.ngoRating);
                                                const creditPoints = Math.floor(formState.creditHours / 30);

                                                return (
                                                    <div
                                                        key={student.studentProfileId}
                                                        className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition space-y-3"
                                                    >
                                                        {/* Top info */}
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                            <div>
                                                                <span className="font-extrabold text-slate-900 text-sm">
                                                                    {student.studentName}
                                                                </span>
                                                                <span className="text-slate-500 text-xs block">
                                                                    {student.branch} • Year {student.year} • <strong className="text-indigo-600">{student.role}</strong>
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200">
                                                                    {creditPoints} NEP Credits
                                                                </span>
                                                                <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 font-bold text-xs border border-indigo-200 flex items-center gap-1">
                                                                    <Star className="w-3 h-3 fill-indigo-600 text-indigo-600" />
                                                                    {overallRating} / 5.0
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Inputs grid */}
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/80">
                                                            {/* Credit Hours Input */}
                                                            <div>
                                                                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                                                    Field Contribution Hours
                                                                    <span className="text-slate-400 font-normal ml-1">
                                                                        (30 hrs = 1 Credit)
                                                                    </span>
                                                                </label>
                                                                <p className={`px-3 py-2 rounded-xl border text-xs font-semibold ${formState.creditHours >= 30 ? 'bg-white border-slate-300 text-slate-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                                                                    {formState.creditHours} verified hours{formState.creditHours < 30 ? ' — below 30, no credit yet' : ''}
                                                                    {student.ngoRating ? ` · NGO rating ${student.ngoRating}/5` : ''}
                                                                </p>
                                                            </div>

                                                            {/* Faculty Rating Slider */}
                                                            <div>
                                                                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1">
                                                                    <span>Faculty Rating</span>
                                                                    <span className="text-indigo-600 font-bold">
                                                                        {formState.facultyRating.toFixed(1)} / 5.0
                                                                    </span>
                                                                </div>
                                                                <input
                                                                    type="range"
                                                                    min="1.0"
                                                                    max="5.0"
                                                                    step="0.1"
                                                                    value={formState.facultyRating}
                                                                    onChange={(e) =>
                                                                        handleFacultyRatingChange(
                                                                            student.studentProfileId,
                                                                            parseFloat(e.target.value)
                                                                        )
                                                                    }
                                                                    className="w-full accent-indigo-600 cursor-pointer"
                                                                />
                                                                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                                                                    <span>1.0 (Basic)</span>
                                                                    <span>3.0 (Good)</span>
                                                                    <span>5.0 (Exemplary)</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    /* Success State View */
                                    <div className="space-y-5 text-center py-4">
                                        <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md shadow-emerald-500/10">
                                            <ShieldCheck className="w-8 h-8" />
                                        </div>

                                        <div className="space-y-1">
                                            <h3 className="text-lg font-extrabold text-slate-900">
                                                Credentials Sealed &amp; Issued Successfully!
                                            </h3>
                                            <p className="text-xs text-slate-500 max-w-md mx-auto">
                                                SHA-256 hashes have been computed and saved with each credential. Verifiable credentials and certificates are ready.
                                            </p>
                                        </div>

                                        {/* Issued Credentials List */}
                                        <div className="space-y-2.5 text-left pt-2">
                                            {issueSuccessData.credentials?.map((cred: any) => (
                                                <div
                                                    key={cred.id}
                                                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                                >
                                                    <div>
                                                        <span className="font-bold text-slate-900 text-xs block">
                                                            {studentForms[cred.studentProfileId]?.studentName ?? 'Student'} • {cred.creditPoints} Credits
                                                        </span>
                                                        <div className="flex items-center gap-1 text-[11px] font-mono text-indigo-600 mt-0.5">
                                                            <span>Hash:</span>
                                                            <span className="truncate max-w-[200px]">
                                                                {cred.hashValue}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyHash(cred.hashValue, cred.id)}
                                                                className="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer"
                                                                title="Copy Hash"
                                                            >
                                                                {copiedId === cred.id ? (
                                                                    <Check className="w-3 h-3 text-emerald-600" />
                                                                ) : (
                                                                    <Copy className="w-3 h-3" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <a
                                                            href={`/api/hei/credentials/${cred.id}/pdf`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition"
                                                        >
                                                            <Download className="w-3.5 h-3.5" />
                                                            <span>Download PDF</span>
                                                        </a>

                                                        <Link
                                                            href={`/verify/credential/${cred.id}`}
                                                            target="_blank"
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition"
                                                        >
                                                            <span>Verify ↗</span>
                                                        </Link>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                                {!issueSuccessData ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setIsFormOpen(false)}
                                            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
                                        >
                                            Cancel
                                        </button>

                                        <button
                                            type="button"
                                            disabled={isIssuing}
                                            onClick={handleIssueCredits}
                                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer"
                                        >
                                            {isIssuing ? (
                                                <>
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                    <span>Hashing &amp; Sealing...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <ShieldCheck className="w-4 h-4" />
                                                    <span>Issue NEP Credits</span>
                                                </>
                                            )}
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setIsFormOpen(false)}
                                        className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition"
                                    >
                                        Done &amp; Close
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

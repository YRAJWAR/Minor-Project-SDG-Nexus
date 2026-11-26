'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { SDG_INFO } from '@/data/mockData';
import { useData } from '@/lib/DataContext';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import StatCard from '@/components/dashboard/StatCard';
import MilestoneQueue from '@/components/dashboard/MilestoneQueue';
import ProposalsPanel from '@/components/dashboard/ProposalsPanel';
import { useRouter } from 'next/navigation';
import { FileDown, AlertTriangle, Clock, MapPin, Building2, CheckCircle2, X, ArrowRight, Sparkles, ShieldCheck, LayoutGrid, List, Shield, Search, Filter, Calendar, RefreshCw, TrendingUp, Info, Layers } from 'lucide-react';
import { generateExecutiveReport } from '@/lib/pdfGenerator';
import type { ColorMode } from '@/components/Map';
import RoutingExplainabilityPanel, { HEIMatch } from '@/components/RoutingExplainabilityPanel';

const SDGHeatmap = dynamic(() => import('@/components/Map'), { ssr: false });

const fadeIn = (d: number) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay: d },
});

export default function GovernmentDashboard() {
    const { user } = useAuth();
    const { organizations, projects, regions } = useData();
    const totalFunding = regions.reduce((s, r) => s + r.funding, 0);
    const totalNGOs = regions.reduce((s, r) => s + r.ngo_count, 0);
    const totalBeneficiaries = regions.reduce((s, r) => s + r.beneficiaries, 0);
    const totalProjects = projects.length;
    const topNGOs = [...organizations].sort((a, b) => b.impact_score - a.impact_score).slice(0, 5);

    const router = useRouter();
    // Verified NGOs and CSR partners, from the public directory API.
    const [allOrgs, setAllOrgs] = useState<{ id: string; name: string; type: string; state: string | null; district: string | null; verification_status: string; project_count: number; total_beneficiaries: number; impact_score: number | null }[]>([]);
    useEffect(() => {
        fetch('/api/public/organizations')
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => setAllOrgs(j?.data?.organizations ?? []))
            .catch(() => setAllOrgs([]));
    }, []);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'ngo' | 'corporate'>('all');
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    // Heatmap & District Equity State
    const [mapMode, setMapMode] = useState<ColorMode>('challenge_density');
    const [equityData, setEquityData] = useState<any[]>([]);
    const [avgResolutionRate, setAvgResolutionRate] = useState<number>(35);
    const [threshold, setThreshold] = useState<number>(21);

    // Government Challenges State & Funnel
    const [challengesList, setChallengesList] = useState<any[]>([]);
    const [isLoadingChallenges, setIsLoadingChallenges] = useState(true);
    const [escalatingId, setEscalatingId] = useState<string | null>(null);
    const [challengeSearch, setChallengeSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [statusCounts, setStatusCounts] = useState<Record<string, number>>({
        SUBMITTED: 0,
        AI_PROCESSED: 0,
        VALIDATED: 0,
        UNIVERSITY_ASSIGNED: 0,
        TEAM_FORMED: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        DEPLOYED: 0,
        ALL: 0,
        ESCALATION_DUE: 0,
    });

    // Validate & Route Drawer State
    const [routingChallenge, setRoutingChallenge] = useState<any | null>(null);
    const [routingHeis, setRoutingHeis] = useState<any[]>([]);
    const [loadingRouting, setLoadingRouting] = useState(false);
    const [assigningHeiId, setAssigningHeiId] = useState<string | null>(null);

    // Primary Tab State
    const [activeTab, setActiveTab] = useState<'overview' | 'insights' | 'audit'>('overview');

    // District Drill-Down State (Part A)
    const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
    const [districtDrillData, setDistrictDrillData] = useState<any | null>(null);
    const [loadingDistrictDrill, setLoadingDistrictDrill] = useState(false);

    // Policy Insights State (Part B)
    const [policyInsights, setPolicyInsights] = useState<any | null>(null);
    const [loadingInsights, setLoadingInsights] = useState(false);

    // Risk Flags State (Part C)
    const [governmentRiskFlags, setGovernmentRiskFlags] = useState<any[]>([]);

    // Audit Trail State (Part D)
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
    const [auditActionFilter, setAuditActionFilter] = useState('ALL');
    const [auditDateFrom, setAuditDateFrom] = useState('');
    const [auditDateTo, setAuditDateTo] = useState('');
    const [auditSearch, setAuditSearch] = useState('');

    // Officer actions (verify / reject / merge) go through POST /api/challenges/[id]/actions;
    // the buttons shown come from each challenge's allowedActions, computed on the server.
    const [reloadKey, setReloadKey] = useState(0);
    const [actionBusy, setActionBusy] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [mergeFor, setMergeFor] = useState<string | null>(null);
    const [mergeTarget, setMergeTarget] = useState('');
    const [verifyFor, setVerifyFor] = useState<string | null>(null);
    const [proposalsFor, setProposalsFor] = useState<string | null>(null);
    const [verifyTags, setVerifyTags] = useState<number[]>([]);
    const runAction = async (ch: any, action: 'VERIFY' | 'REJECT' | 'MERGE' | 'CLOSE', extra: Record<string, unknown> = {}) => {
        if (action === 'CLOSE') {
            const n = window.prompt(`Close "${ch.title}": how many people verifiably benefit? (checked on the ground; this number is used in impact scores)`);
            if (!n) return;
            extra = { beneficiaries: Number(n) };
        }
        if (action === 'REJECT') {
            const reason = window.prompt(`Why is "${ch.title}" not being taken up? The citizen will see this (10-500 characters).`);
            if (!reason) return;
            extra = { reason };
        }
        setActionBusy(ch.id);
        setActionMessage(null);
        const res = await fetch(`/api/challenges/${ch.id}/actions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
        }).then((r) => r.json()).catch(() => ({ success: false, error: 'Could not reach the server.' }));
        setActionBusy(null);
        setMergeFor(null);
        setActionMessage(res.success ? { ok: true, text: `"${ch.title}" is now ${String(res.data.status).toLowerCase().replace(/_/g, ' ')}.` } : { ok: false, text: res.error ?? 'Action failed.' });
        if (res.success) setReloadKey((k) => k + 1);
    };

    // Fetch challenge density & equity data
    useEffect(() => {
        fetch('/api/government/challenge-density')
            .then((r) => r.json())
            .then((res) => {
                if (res.success && res.data?.equity) {
                    setEquityData(res.data.equity);
                    if (res.data.avgResolutionRate) setAvgResolutionRate(res.data.avgResolutionRate);
                    if (res.data.threshold) setThreshold(res.data.threshold);
                }
            })
            .catch((err) => console.warn('Challenge density fetch error:', err));

        fetch('/api/government/challenges')
            .then((r) => r.json())
            .then((res) => {
                if (res.success) {
                    const list = Array.isArray(res.data) ? res.data : (res.challenges || []);
                    setChallengesList(list);
                    if (res.counts) {
                        setStatusCounts(res.counts);
                    } else {
                        const newCounts: Record<string, number> = {
                            SUBMITTED: 0, AI_PROCESSED: 0, VALIDATED: 0, UNIVERSITY_ASSIGNED: 0,
                            TEAM_FORMED: 0, IN_PROGRESS: 0, COMPLETED: 0, DEPLOYED: 0,
                            ALL: list.length, ESCALATION_DUE: 0,
                        };
                        list.forEach((c: any) => {
                            if (newCounts[c.status] !== undefined) newCounts[c.status]++;
                            if (c.isEscalationDue) newCounts.ESCALATION_DUE++;
                        });
                        setStatusCounts(newCounts);
                    }
                }
            })
            .catch((err) => console.warn('Government challenges fetch error:', err))
            .finally(() => setIsLoadingChallenges(false));

        // Fetch Risk Flags
        fetch('/api/government/risk-flags')
            .then((r) => r.json())
            .then((res) => {
                if (res.success && res.data?.riskFlags) {
                    setGovernmentRiskFlags(res.data.riskFlags);
                }
            })
            .catch((err) => console.warn('Risk flags fetch error:', err));
    }, [reloadKey]);

    const handleEscalate = async (challengeId: string) => {
        setEscalatingId(challengeId);
        try {
            const res = await fetch('/api/government/challenges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    challengeId,
                    note: 'Escalated by the district officer for faster university allocation.',
                }),
            });
            const json = await res.json();
            if (json.success) {
                setChallengesList((prev) =>
                    prev.map((c) =>
                        c.id === challengeId
                            ? { ...c, status: 'ESCALATED', isEscalationDue: false }
                            : c
                    )
                );
            } else {
                window.alert(json.error || 'The challenge could not be escalated.');
            }
        } catch (err) {
            console.error('Failed to escalate challenge:', err);
        } finally {
            setEscalatingId(null);
        }
    };

    // Open Validate & Route Side Panel
    const handleOpenValidateRoute = async (challenge: any) => {
        setRoutingChallenge(challenge);
        setLoadingRouting(true);
        try {
            // First call the master spec Section 10 HEI matching endpoint
            const matchRes = await fetch(`/api/government/challenges/${challenge.id}/match-heis`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-role': 'GOV',
                },
            });
            const matchJson = await matchRes.json();
            if (matchJson.success && matchJson.data?.matches?.length > 0) {
                setRoutingHeis(matchJson.data.matches);
            } else {
                // Fallback to validate route if match-heis had no matches
                const res = await fetch(`/api/government/challenges/${challenge.id}/validate`);
                const json = await res.json();
                if (json.success && json.data?.topHeiMatches) {
                    setRoutingHeis(json.data.topHeiMatches);
                }
            }
        } catch (err) {
            console.warn('Error fetching HEI matches:', err);
        } finally {
            setLoadingRouting(false);
        }
    };

    // Confirm HEI Assignment
    const handleConfirmRoute = async (heiId: string) => {
        if (!routingChallenge) return;
        setAssigningHeiId(heiId);
        try {
            const res = await fetch(`/api/government/challenges/${routingChallenge.id}/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedHeiId: heiId }),
            });
            const json = await res.json();
            if (json.success) {
                const assigned = routingHeis.find((h) => h.id === heiId);
                setChallengesList((prev) =>
                    prev.map((c) =>
                        c.id === routingChallenge.id
                            ? {
                                  ...c,
                                  status: 'UNIVERSITY_ASSIGNED',
                                  assignedInstitutions: [assigned?.name || 'Assigned HEI'],
                                  isEscalationDue: false,
                              }
                            : c
                    )
                );
                setStatusCounts((prev) => ({
                    ...prev,
                    [routingChallenge.status]: Math.max(0, (prev[routingChallenge.status] || 1) - 1),
                    UNIVERSITY_ASSIGNED: (prev.UNIVERSITY_ASSIGNED || 0) + 1,
                    ESCALATION_DUE: routingChallenge.isEscalationDue ? Math.max(0, prev.ESCALATION_DUE - 1) : prev.ESCALATION_DUE,
                }));
                setRoutingChallenge(null);
            } else {
                window.alert(json.error || 'The university could not be assigned. Nothing was changed.');
            }
        } catch (err) {
            console.error('Failed to assign HEI:', err);
            window.alert('Could not reach the server. Nothing was changed.');
        } finally {
            setAssigningHeiId(null);
        }
    };

    // District Drill-Down Handler (Part A)
    const handleSelectDistrict = async (districtName: string) => {
        setSelectedDistrict(districtName);
        setLoadingDistrictDrill(true);
        try {
            const res = await fetch(`/api/government/district/${encodeURIComponent(districtName)}`);
            const json = await res.json();
            if (json.success && json.data) {
                setDistrictDrillData(json.data);
            }
        } catch (err) {
            console.warn('Failed to fetch district drill-down data:', err);
        } finally {
            setLoadingDistrictDrill(false);
        }
    };

    // Policy Insights Loader (Part B)
    const loadPolicyInsights = async () => {
        setLoadingInsights(true);
        try {
            const res = await fetch('/api/government/insights');
            const json = await res.json();
            if (json.success && json.data?.insights) {
                setPolicyInsights(json.data.insights);
            }
        } catch (err) {
            console.warn('Failed to load policy insights:', err);
        } finally {
            setLoadingInsights(false);
        }
    };

    // Audit Trail Loader (Part D)
    const loadAuditLogs = async (action = auditActionFilter, from = auditDateFrom, to = auditDateTo) => {
        setLoadingAuditLogs(true);
        try {
            const params = new URLSearchParams();
            if (action && action !== 'ALL') params.set('action', action);
            if (from) params.set('dateFrom', from);
            if (to) params.set('dateTo', to);
            const res = await fetch(`/api/government/audit?${params.toString()}`);
            const json = await res.json();
            if (json.success && json.data?.logs) {
                setAuditLogs(json.data.logs);
            }
        } catch (err) {
            console.warn('Failed to load audit logs:', err);
        } finally {
            setLoadingAuditLogs(false);
        }
    };

    // Filter challenges
    const filteredChallenges = challengesList.filter((ch) => {
        const matchesSearch =
            ch.title.toLowerCase().includes(challengeSearch.toLowerCase()) ||
            ch.district.toLowerCase().includes(challengeSearch.toLowerCase()) ||
            (ch.assignedInstitutions &&
                ch.assignedInstitutions.some((inst: string) =>
                    inst.toLowerCase().includes(challengeSearch.toLowerCase())
                ));

        if (!matchesSearch) return false;

        if (statusFilter === 'ALL') return true;
        if (statusFilter === 'ESCALATION_DUE') return ch.isEscalationDue;
        if (statusFilter === 'OVERDUE') return ch.isOverdue;
        if (statusFilter === 'RESOLVED') return ch.status === 'COMPLETED' || ch.status === 'DEPLOYED';
        return ch.status === statusFilter;
    });

    const escalationDueCount = statusCounts.ESCALATION_DUE || challengesList.filter((c) => c.isEscalationDue).length;

    // Sort equity data from highest resolution rate to lowest for clean horizontal display
    const sortedEquity = [...equityData].sort((a, b) => b.resolutionRate - a.resolutionRate);

    const filteredOrganizations = allOrgs.filter(org =>
        (typeFilter === 'all' || org.type.toLowerCase() === typeFilter) &&
        [org.name, org.state, org.district].some((v) => v?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleDownloadReport = () => {
        setIsGeneratingPDF(true);
        try {
            // Prepare top 10 rows for the PDF table
            const tableRows = topNGOs.slice(0, 10).map(ngo => [
                ngo.name,
                ngo.location.state,
                `${Math.round(ngo.funding_need / 100000)}L`,
                ngo.beneficiaries.toString(),
                ngo.impact_score.toString()
            ]);

            generateExecutiveReport({
                title: "District Impact Report",
                organizationName: user?.organization_name || "District Administration",
                date: new Date().toLocaleDateString(),
                summaryMetrics: [
                    { label: "Total Tracked Funding", value: `₹${(totalFunding / 10000000).toFixed(2)} Cr` },
                    { label: "Active Organizations", value: totalNGOs },
                    { label: "Total Beneficiaries", value: totalBeneficiaries.toLocaleString() },
                    { label: "NGO Projects", value: totalProjects }
                ],
                tableData: {
                    head: ['Organization', 'State', 'Funding (₹)', 'Beneficiaries', 'Innovation Outcome Score'],
                    body: tableRows
                }
            });
        } finally {
            setTimeout(() => setIsGeneratingPDF(false), 1000);
        }
    };

    return (
        <div className="space-y-6">
            <motion.div {...fadeIn(0)} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900">District Command Center</h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">Citizen problems, university projects and NGO impact</p>
                </div>

                <div className="flex items-center gap-3 self-start sm:self-auto">
                    <button
                        onClick={handleDownloadReport}
                        disabled={isGeneratingPDF}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-medium rounded-lg transition-all shadow-sm disabled:opacity-70 cursor-pointer"
                    >
                        {isGeneratingPDF ? (
                            <>
                                <div className="w-4 h-4 border-2 border-slate-300 border-t-white rounded-full animate-spin"></div>
                                Generating...
                            </>
                        ) : (
                            <>
                                <FileDown size={16} />
                                Executive Report
                            </>
                        )}
                    </button>
                </div>
            </motion.div>

            {/* Navigation Tabs (Part B & Part D) */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'overview'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                    <span>Overview &amp; Map</span>
                </button>
                <button
                    onClick={() => {
                        setActiveTab('insights');
                        if (!policyInsights) loadPolicyInsights();
                    }}
                    className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'insights'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                    <span>Policy Insights</span>
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full ${activeTab === 'insights' ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                        5 Live
                    </span>
                </button>
                <button
                    onClick={() => {
                        setActiveTab('audit');
                        if (auditLogs.length === 0) loadAuditLogs();
                    }}
                    className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'audit'
                            ? 'bg-emerald-700 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                    <span>Audit Trail</span>
                </button>
            </div>

            {/* ===== OVERVIEW & MAP TAB ===== */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Funding Tracked', value: Math.round(totalFunding / 10000000), icon: '', color: '#3b82f6', prefix: '₹', suffix: ' Cr' },
                    { label: 'Active NGOs', value: totalNGOs, icon: '', color: '#10b981' },
                    { label: 'Total Beneficiaries', value: totalBeneficiaries, icon: '', color: '#8b5cf6' },
                    { label: 'NGO Projects', value: totalProjects, icon: '', color: '#f59e0b' },
                ].map((stat, i) => (
                    <StatCard
                        key={i}
                        label={stat.label}
                        value={stat.value}
                        icon={stat.icon}
                        color={stat.color}
                        prefix={stat.prefix}
                        suffix={stat.suffix}
                        delay={0.1 * i}
                    />
                ))}
            </div>

            <MilestoneQueue mode="officer" />

            {/* ===== DISTRICT HEATMAP ===== */}
            <motion.div {...fadeIn(0.11)} className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold text-slate-900">
                                India Problem & Impact Map
                            </h2>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Citizen reports by district and NGO project funding by state. Click a district for its details.
                        </p>
                    </div>

                    {/* Mode Selector */}
                    <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1 rounded-xl">
                        {[
                            { key: 'challenge_density' as ColorMode, label: 'Reported', icon: '', color: '#ec4899' },
                            { key: 'composite' as ColorMode, label: 'Resolution rate', icon: '', color: '#f59e0b' },
                            { key: 'funding' as ColorMode, label: 'Funding', icon: '', color: '#22c55e' },
                            { key: 'risk' as ColorMode, label: 'Open problems', icon: '', color: '#ef4444' },
                        ].map((m) => (
                            <button
                                key={m.key}
                                onClick={() => setMapMode(m.key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                                    mapMode === m.key
                                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <span>{m.icon}</span>
                                <span>{m.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl overflow-hidden border border-slate-200 shadow-inner">
                    <SDGHeatmap colorBy={mapMode} regions={regions} onSelectDistrict={handleSelectDistrict} />
                </div>
            </motion.div>

            {/* ===== DISTRICT EQUITY SCORE PANEL ===== */}
            <motion.div {...fadeIn(0.13)} className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold text-slate-900">
                                District Challenge Resolution Rate
                            </h2>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Districts below 60% of average shown in red — immediate attention required
                        </p>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block"></span>
                            <span className="text-slate-600 font-medium">Critical (&lt; {threshold}% avg)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block"></span>
                            <span className="text-slate-600 font-medium">Equitable (&ge; {threshold}%)</span>
                        </div>
                        <div className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg font-semibold border border-blue-200">
                            State Avg: {avgResolutionRate}%
                        </div>
                    </div>
                </div>

                <div className="h-[480px] w-full mt-3">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            layout="vertical"
                            data={sortedEquity}
                            margin={{ top: 10, right: 30, left: 70, bottom: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                            <XAxis
                                type="number"
                                domain={[0, 100]}
                                unit="%"
                                tick={{ fill: '#64748b', fontSize: 11 }}
                                axisLine={{ stroke: '#cbd5e1' }}
                            />
                            <YAxis
                                type="category"
                                dataKey="district"
                                tick={{ fill: '#334155', fontSize: 11, fontWeight: 500 }}
                                width={95}
                                axisLine={{ stroke: '#cbd5e1' }}
                            />
                            <Tooltip
                                formatter={(val: any, _name: any, item: any) => [
                                    `${val}% (${item.payload.resolvedChallenges} of ${item.payload.totalChallenges} challenges resolved)`,
                                    'Resolution Rate',
                                ]}
                                contentStyle={{
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: 10,
                                    color: '#f8fafc',
                                    fontSize: '12px',
                                }}
                            />
                            <ReferenceLine
                                x={threshold}
                                stroke="#ef4444"
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                label={{
                                    value: `60% Alert Threshold (${threshold}%)`,
                                    fill: '#ef4444',
                                    fontSize: 10,
                                    position: 'insideTopRight',
                                }}
                            />
                            <ReferenceLine
                                x={avgResolutionRate}
                                stroke="#3b82f6"
                                strokeDasharray="3 3"
                                strokeWidth={1.5}
                                label={{
                                    value: `State Avg (${avgResolutionRate}%)`,
                                    fill: '#3b82f6',
                                    fontSize: 10,
                                    position: 'insideBottomRight',
                                }}
                            />
                            <Bar dataKey="resolutionRate" radius={[0, 4, 4, 0]} barSize={11}>
                                {sortedEquity.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.isBelowThreshold ? '#ef4444' : '#22c55e'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            {/* ===== GOVERNMENT CHALLENGE QUEUE & STATUS FUNNEL ===== */}
            <motion.div {...fadeIn(0.14)} className="glass-card p-6">
                {/* Header & Search / View Toggle */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Government Innovation Challenge Queue
                            </h2>
                            {escalationDueCount > 0 && (
                                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                    {escalationDueCount} Escalation{escalationDueCount > 1 ? 's' : ''} Due
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Real-time pipeline monitoring from citizen GP node intake through university engineering and field deployment
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Search Input */}
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search challenges, districts, HEIs..."
                                value={challengeSearch}
                                onChange={(e) => setChallengeSearch(e.target.value)}
                                className="bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-lg pl-8 pr-3 py-2 w-64 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all shadow-xs"
                            />
                            </div>

                        {/* View Toggle */}
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button
                                onClick={() => setViewMode('cards')}
                                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                                    viewMode === 'cards'
                                        ? 'bg-white text-blue-600 shadow-xs'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                                title="Card View"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                                    viewMode === 'table'
                                        ? 'bg-white text-blue-600 shadow-xs'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                                title="Table View"
                            >
                                <List className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Status Funnel View - 8 Horizontal Stages */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                            <span>Status Funnel</span>
                            <span className="text-[10px] font-normal text-slate-400 lowercase">(click any stage to filter)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setStatusFilter('ALL')}
                                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                                    statusFilter === 'ALL'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'text-slate-600 hover:bg-slate-100 border border-slate-200'
                                }`}
                            >
                                All ({challengesList.length})
                            </button>
                            {escalationDueCount > 0 && (
                                <button
                                    onClick={() => setStatusFilter('ESCALATION_DUE')}
                                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                                        statusFilter === 'ESCALATION_DUE'
                                            ? 'bg-amber-600 text-white shadow-xs'
                                            : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300'
                                    }`}
                                >
                                    <span>Needs Action ({escalationDueCount})</span>
                                </button>
                            )}
                            {/* Outcome filters; counts come from the same list the cards use. */}
                            {([
                                ['OVERDUE', 'Overdue', challengesList.filter((c) => c.isOverdue).length, 'bg-rose-600', 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'],
                                ['REJECTED', 'Rejected', challengesList.filter((c) => c.status === 'REJECTED').length, 'bg-slate-700', 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'],
                                ['MERGED', 'Merged', challengesList.filter((c) => c.status === 'MERGED').length, 'bg-slate-700', 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'],
                            ] as const).map(([key, label, n, on, off]) => (
                                <button key={key} type="button" aria-pressed={statusFilter === key}
                                    onClick={() => setStatusFilter(statusFilter === key ? 'ALL' : key)}
                                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${statusFilter === key ? `${on} text-white border-transparent` : off}`}>
                                    {label} ({n})
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        {[
                            { key: 'SUBMITTED', label: 'SUBMITTED', icon: '' },
                            { key: 'AI_PROCESSED', label: 'AI PROCESSED', icon: '' },
                            { key: 'VALIDATED', label: 'VALIDATED', icon: '' },
                            { key: 'UNIVERSITY_ASSIGNED', label: 'UNIV ASSIGNED', icon: '' },
                            { key: 'TEAM_FORMED', label: 'TEAM FORMED', icon: '' },
                            { key: 'IN_PROGRESS', label: 'IN PROGRESS', icon: '' },
                            { key: 'COMPLETED', label: 'COMPLETED', icon: '' },
                            { key: 'DEPLOYED', label: 'DEPLOYED', icon: '' },
                        ].map((stage) => {
                            const count = statusCounts[stage.key] || 0;
                            const isActive = statusFilter === stage.key;

                            return (
                                <button
                                    key={stage.key}
                                    onClick={() => setStatusFilter(isActive ? 'ALL' : stage.key)}
                                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                        isActive
                                            ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                                            : 'bg-white hover:bg-slate-50 border-slate-200/90'
                                    }`}
                                >
                                    <div className="flex items-center justify-between w-full mb-1.5">
                                        <span className="text-sm">{stage.icon}</span>
                                        <span
                                            className={`text-xs font-black px-1.5 py-0.5 rounded-full ${
                                                isActive
                                                    ? 'bg-blue-600 text-white'
                                                    : count > 0
                                                    ? 'bg-slate-100 text-slate-800'
                                                    : 'bg-slate-50 text-slate-400'
                                            }`}
                                        >
                                            {count}
                                        </span>
                                    </div>
                                    <div className={`text-[10px] font-extrabold tracking-tight truncate w-full ${
                                        isActive ? 'text-blue-900' : 'text-slate-600'
                                    }`}>
                                        {stage.label}
                                    </div>
                                    <div className="text-[9px] text-slate-400 mt-0.5">
                                        {count === 1 ? '1 challenge' : `${count} challenges`}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Challenge Cards (Grid View) */}
                {actionMessage && (
                    <p role="status" className={`mb-3 text-sm rounded-lg px-3 py-2 border ${actionMessage.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{actionMessage.text}</p>
                )}
                {viewMode === 'cards' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4.5">
                        {filteredChallenges.map((ch) => {
                            const isGpNode = ch.submittedVia === 'GRAM_PANCHAYAT_NODE';
                            const categoryIcon = (() => {
                                const cat = (ch.category || '').toLowerCase();
                                if (cat.includes('water') || cat.includes('sanitation')) return '';
                                if (cat.includes('health') || cat.includes('malnutrition')) return '';
                                if (cat.includes('education') || cat.includes('literacy')) return '';
                                if (cat.includes('agri') || cat.includes('farm') || cat.includes('crop')) return '';
                                if (cat.includes('energy') || cat.includes('solar') || cat.includes('power')) return '';
                                if (cat.includes('infra') || cat.includes('road')) return '';
                                if (cat.includes('environment') || cat.includes('forest')) return '';
                                return '';
                            })();

                            const sdgs = ch.sdgTags || [6];

                            return (
                                <div
                                    key={ch.id}
                                    className="bg-white rounded-xl border border-slate-200/90 hover:border-blue-300 p-5 flex flex-col justify-between hover:shadow-md transition-all group relative overflow-hidden"
                                >
                                    {/* Top Metadata Bar */}
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2.5">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                                    <span>{categoryIcon}</span>
                                                    <span className="truncate max-w-[130px]">{ch.category}</span>
                                                </span>

                                                {/* GP Node Tag */}
                                                {isGpNode && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                                                        GP Node
                                                    </span>
                                                )}

                                                {/* Risk Flag Indicator */}
                                                {(() => {
                                                    const risk = governmentRiskFlags.find(
                                                        (f) =>
                                                            f.challenge_id === ch.id ||
                                                            f.district?.toLowerCase() === ch.district?.toLowerCase()
                                                    );
                                                    if (!risk) return null;
                                                    return (
                                                        <div className="relative group/risk inline-block">
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-50 text-rose-700 border border-rose-200 cursor-pointer">
                                                                <AlertTriangle className="w-3 h-3 text-rose-600 animate-pulse" />
                                                                <span>Risk Flag</span>
                                                            </span>
                                                            {/* Tooltip on hover */}
                                                            <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover/risk:block z-50 w-64 p-2.5 bg-slate-900 text-white text-[11px] rounded-xl shadow-xl border border-slate-700 pointer-events-none">
                                                                <div className="flex items-center justify-between font-bold text-rose-300 mb-1">
                                                                    <span className="truncate max-w-[150px]">{risk.risk_type.replace(/_/g, ' ').toUpperCase()}</span>
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-600 text-white font-extrabold">{risk.risk_level}</span>
                                                                </div>
                                                                <p className="text-slate-300 text-[10px] leading-relaxed">{risk.description}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {/* Status Badge */}
                                            <span
                                                className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md uppercase tracking-wider ${
                                                    ch.status === 'COMPLETED' || ch.status === 'DEPLOYED'
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : ch.status === 'IN_PROGRESS' || ch.status === 'TEAM_FORMED'
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : ch.status === 'UNIVERSITY_ASSIGNED'
                                                        ? 'bg-indigo-100 text-indigo-800'
                                                        : 'bg-amber-100 text-amber-800'
                                                }`}
                                            >
                                                {ch.status.replace('_', ' ')}
                                            </span>
                                        </div>

                                        {/* Title & District */}
                                        <h3 className="font-bold text-slate-900 text-sm mb-1 line-clamp-2 group-hover:text-blue-600 transition-colors">
                                            {ch.title}
                                        </h3>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                                            <span className="inline-flex items-center gap-0.5 text-slate-700 font-medium">
                                                {ch.block ? `${ch.block}, ` : ''}{ch.district}{ch.state ? `, ${ch.state}` : ''}
                                            </span>
                                            <span>•</span>
                                            <span className="text-[11px] text-slate-400">ID: {ch.id.slice(0, 10)}...</span>
                                        </div>

                                        {/* SDG Tag Chips */}
                                        <div className="flex flex-wrap gap-1.5 mb-3.5">
                                            {sdgs.map((sdg: number) => (
                                                <span
                                                    key={sdg}
                                                    className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"
                                                >
                                                    SDG {sdg}
                                                </span>
                                            ))}
                                        </div>

                                        {/* Description preview */}
                                        <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">
                                            {ch.description}
                                        </p>
                                    </div>

                                    {/* Footer Section: University assignment & Escalation Status */}
                                    <div className="pt-3 border-t border-slate-100 flex flex-col gap-3">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="text-[11px] text-slate-500" title={ch.priorityBreakdown ? `Severity ${ch.priorityBreakdown.severity} · Endorsements ${ch.priorityBreakdown.endorsements} · Area backlog ${ch.priorityBreakdown.areaBacklog} · Waiting ${ch.priorityBreakdown.waiting} (weights 35/25/20/20)` : undefined}>
                                                <span className="text-slate-400">Priority </span>
                                                <span className="font-bold text-slate-800">{ch.priority ?? '—'}</span>
                                                <span className="text-slate-400"> · {ch.endorsements ?? 0} endorsed · {ch.urgency?.toLowerCase()}</span>
                                            </div>
                                            {ch.isOverdue && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                                                    Overdue · {ch.daysWaiting}d
                                                </span>
                                            )}

                                            {/* Escalation Due Badge */}
                                            {ch.isEscalationDue && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                                    Escalation Due
                                                </span>
                                            )}
                                        </div>

                                        {/* Assigned University */}
                                        <div className="text-xs bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between">
                                            <span className="text-[11px] text-slate-500">{['VALIDATED', 'UNIVERSITY_ASSIGNED', 'SUBMITTED', 'AI_PROCESSED'].includes(ch.status) ? 'Proposals from:' : 'University:'}</span>
                                            <span className="text-[11px] font-semibold text-slate-800 truncate max-w-[170px]">
                                                {ch.assignedInstitutions && ch.assignedInstitutions.length > 0
                                                    ? ch.assignedInstitutions.join(', ')
                                                    : 'None yet'}
                                            </span>
                                        </div>

                                        {ch.rejectReason && <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2">Rejected: {ch.rejectReason}</p>}
                                        {ch.status === 'MERGED' && <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-2">Merged into {challengesList.find((c) => c.id === ch.mergedIntoId)?.title ?? 'another report'}</p>}
                                        {(ch.allowedActions?.includes('REJECT') || ch.allowedActions?.includes('MERGE')) && (
                                            <div className="flex items-center gap-2">
                                                {ch.allowedActions.includes('VERIFY') && (
                                                    <button type="button" disabled={actionBusy === ch.id} aria-expanded={verifyFor === ch.id} onClick={() => { setVerifyFor(verifyFor === ch.id ? null : ch.id); setVerifyTags(ch.sdgTags ?? []); setMergeFor(null); }} className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Verify…</button>
                                                )}
                                                <button type="button" disabled={actionBusy === ch.id} onClick={() => runAction(ch, 'REJECT')} className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reject</button>
                                                <button type="button" disabled={actionBusy === ch.id} onClick={() => { setMergeFor(mergeFor === ch.id ? null : ch.id); setMergeTarget(''); }} className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Merge…</button>
                                            </div>
                                        )}
                                        {ch.allowedActions?.includes('SELECT_PROPOSAL') && ch.proposalsCount > 0 && (
                                            <button type="button" aria-expanded={proposalsFor === ch.id} onClick={() => setProposalsFor(proposalsFor === ch.id ? null : ch.id)}
                                                className="w-full py-1.5 text-xs font-semibold rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                                                Compare proposals ({ch.proposalsCount})
                                            </button>
                                        )}
                                        {proposalsFor === ch.id && (
                                            <ProposalsPanel challengeId={ch.id} onSelected={() => { setProposalsFor(null); setActionMessage({ ok: true, text: `Plan selected for "${ch.title}". The team is formed and CSR partners were notified.` }); setReloadKey((k) => k + 1); }} />
                                        )}
                                        {ch.allowedActions?.includes('CLOSE') && (
                                            <button type="button" disabled={actionBusy === ch.id} onClick={() => runAction(ch, 'CLOSE')}
                                                className="w-full py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50">
                                                Close as resolved…
                                            </button>
                                        )}
                                        {verifyFor === ch.id && (
                                            <fieldset className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                                                <legend className="px-1 text-[11px] font-semibold text-slate-700">Confirm the SDGs (1–5), then verify</legend>
                                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 max-h-40 overflow-y-auto">
                                                    {SDG_INFO.map((g) => {
                                                        const on = verifyTags.includes(g.id);
                                                        return (
                                                            <label key={g.id} className="flex items-center gap-1.5 text-[11px] text-slate-700">
                                                                <input type="checkbox" checked={on} disabled={!on && verifyTags.length >= 5}
                                                                    onChange={() => setVerifyTags((t) => (on ? t.filter((x) => x !== g.id) : [...t, g.id]))} />
                                                                <span>{g.id}. {g.name}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                <button type="button" disabled={!verifyTags.length || actionBusy === ch.id}
                                                    onClick={() => { setVerifyFor(null); runAction(ch, 'VERIFY', { sdgTags: verifyTags }); }}
                                                    className="mt-2 w-full py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                                                    Confirm verify ({verifyTags.length} SDG{verifyTags.length === 1 ? '' : 's'})
                                                </button>
                                            </fieldset>
                                        )}
                                        {mergeFor === ch.id && (
                                            <div className="flex items-center gap-2">
                                                <label htmlFor={`merge-${ch.id}`} className="sr-only">Merge into</label>
                                                <select id={`merge-${ch.id}`} value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-1.5">
                                                    <option value="">Merge into…</option>
                                                    {challengesList.filter((c) => c.id !== ch.id && c.district === ch.district && !['COMPLETED', 'DEPLOYED', 'REJECTED', 'MERGED'].includes(c.status)).map((c) => (
                                                        <option key={c.id} value={c.id}>{c.title}</option>
                                                    ))}
                                                </select>
                                                <button type="button" disabled={!mergeTarget || actionBusy === ch.id} onClick={() => runAction(ch, 'MERGE', { targetId: mergeTarget })} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-white disabled:opacity-50">Merge</button>
                                            </div>
                                        )}

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-2 pt-1">
                                            {(ch.allowedActions?.includes('VERIFY') || ch.allowedActions?.includes('ASSIGN')) && <button
                                                onClick={() => handleOpenValidateRoute(ch)}
                                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                                            >
                                                <Sparkles className="w-3.5 h-3.5" />
                                                <span>{ch.allowedActions?.includes('ASSIGN') ? 'Invite a university' : 'Verify & invite'}</span>
                                            </button>}

                                            <a
                                                href={`/project/${ch.projectId || ch.projectTeamId || ch.id}/ledger`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="py-2 px-2.5 text-xs font-semibold text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1"
                                                title="View Cryptographic Impact Ledger"
                                            >
                                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                <span>Ledger ↗</span>
                                            </a>

                                            <a
                                                href={`/track/${ch.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="py-2 px-3 text-xs font-semibold text-slate-700 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                                title="View Public Tracker"
                                            >
                                                Track ↗
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {filteredChallenges.length === 0 && (
                            <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                <div className="text-sm font-semibold text-slate-600">No innovation challenges found</div>
                                <div className="text-xs text-slate-400 mt-1">Try selecting another stage from the status funnel or clear the search.</div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Table View */
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">ID</th>
                                    <th className="px-4 py-3 font-semibold">Title</th>
                                    <th className="px-4 py-3 font-semibold">District</th>
                                    <th className="px-4 py-3 font-semibold">Category / Intake</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                    <th className="px-4 py-3 font-semibold">Assigned University</th>
                                    <th className="px-4 py-3 font-semibold text-center">Days Since Update</th>
                                    <th className="px-4 py-3 font-semibold text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredChallenges.map((ch) => {
                                    const isGpNode = ch.submittedVia === 'GRAM_PANCHAYAT_NODE';
                                    return (
                                        <tr key={ch.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-4 py-3.5 text-[11px] font-mono font-medium text-slate-500">
                                                {ch.id.slice(0, 8)}...
                                            </td>
                                            <td className="px-4 py-3.5 max-w-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="font-semibold text-slate-900 text-xs">{ch.title}</div>
                                                    {(() => {
                                                        const flag = governmentRiskFlags.find((f: any) => f.challenge_id === ch.id || f.project_id === ch.id);
                                                        if (!flag) return null;
                                                        return (
                                                            <div className="relative group inline-block shrink-0">
                                                                <span className="cursor-help text-rose-600 hover:text-rose-700 animate-pulse">
                                                                    <AlertTriangle size={14} />
                                                                </span>
                                                                <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-50 w-56 p-2 bg-slate-900 text-white rounded-lg shadow-xl text-[11px] pointer-events-none">
                                                                    <div className="font-bold text-rose-400 flex items-center gap-1">
                                                                        {flag.risk_type.replace(/_/g, ' ').toUpperCase()}
                                                                    </div>
                                                                    <div className="text-slate-300 mt-0.5 text-[10px]">Severity: <span className="font-semibold text-white uppercase">{flag.risk_level}</span></div>
                                                                    <div className="text-slate-400 text-[10px] mt-1">{flag.description}</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{ch.description}</div>
                                            </td>
                                            <td className="px-4 py-3.5 text-xs text-slate-700">
                                                <div className="font-semibold">{ch.district}</div>
                                                {ch.block && <div className="text-[10px] text-slate-400">{ch.block} block</div>}
                                            </td>
                                            <td className="px-4 py-3.5 text-xs text-slate-600">
                                                <div className="flex flex-col gap-1">
                                                    <span className="px-2 py-0.5 rounded bg-slate-100 font-medium text-[10px] text-slate-700 w-fit">
                                                        {ch.category}
                                                    </span>
                                                    {isGpNode && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200 w-fit">
                                                            GP Node
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span
                                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md uppercase ${
                                                        ch.status === 'COMPLETED' || ch.status === 'DEPLOYED'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : ch.status === 'ESCALATED'
                                                            ? 'bg-rose-100 text-rose-700 font-extrabold border border-rose-300'
                                                            : ch.status === 'IN_PROGRESS' || ch.status === 'TEAM_FORMED'
                                                            ? 'bg-blue-100 text-blue-700'
                                                            : 'bg-amber-100 text-amber-700'
                                                    }`}
                                                >
                                                    {ch.status.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-xs text-slate-700">
                                                {ch.assignedInstitutions && ch.assignedInstitutions.length > 0 ? (
                                                    <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                                                        {ch.assignedInstitutions.join(', ')}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 italic text-[11px]">Pending Allocation</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5 text-center">
                                                <div className="inline-flex flex-col items-center gap-1">
                                                    <span className="text-xs font-semibold text-slate-700">
                                                        {ch.daysSinceUpdate} days ago
                                                    </span>
                                                    {ch.isEscalationDue && (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                                            Escalation Due
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-center">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => handleOpenValidateRoute(ch)}
                                                        className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md cursor-pointer transition-colors"
                                                    >
                                                        Validate &amp; Route
                                                    </button>
                                                    <a
                                                        href={`/project/${ch.projectId || ch.projectTeamId || ch.id}/ledger`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-2 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors inline-flex items-center gap-1"
                                                        title="View Cryptographic Impact Ledger"
                                                    >
                                                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                                        <span>Ledger ↗</span>
                                                    </a>
                                                    <a
                                                        href={`/track/${ch.id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                                                    >
                                                        ↗
                                                    </a>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredChallenges.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                                            No innovation challenges found matching criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="mt-3 text-xs text-slate-400 text-right">
                    Showing {filteredChallenges.length} of {challengesList.length} challenges
                </div>
            </motion.div>

            {/* ===== AI VALIDATE & ROUTE SIDE DRAWER MODAL ===== */}
            <AnimatePresence>
                {routingChallenge && (
                    <div className="fixed inset-0 z-50 overflow-hidden">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !loadingRouting && !assigningHeiId && setRoutingChallenge(null)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
                        />

                        {/* Drawer Panel */}
                        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="w-screen max-w-xl bg-white shadow-2xl flex flex-col"
                            >
                                {/* Drawer Header */}
                                <div className="px-6 py-5 bg-linear-to-r from-slate-900 to-blue-900 text-white flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Sparkles className="w-5 h-5 text-amber-400" />
                                            <h2 className="text-base font-bold text-white">AI Institutional Matcher</h2>
                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30">
                                                Smart Routing
                                            </span>
                                        </div>
                                        <p className="text-xs text-blue-100/80">
                                            Ranked by SDG expertise, distance and track record
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setRoutingChallenge(null)}
                                        disabled={!!assigningHeiId}
                                        className="p-1 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Challenge Summary Ribbon */}
                                <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 text-xs">
                                    <div className="font-bold text-slate-800 text-sm mb-1">{routingChallenge.title}</div>
                                    <div className="flex flex-wrap items-center gap-2 text-slate-500">
                                        <span>{routingChallenge.district}</span>
                                        <span>•</span>
                                        <span>Category: {routingChallenge.category}</span>
                                        <span>•</span>
                                        <span className="font-semibold text-blue-600">Current Status: {routingChallenge.status}</span>
                                    </div>
                                </div>

                                {/* Drawer Content: Recommended HEIs */}
                                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                            Top Recommended Universities &amp; Labs
                                        </h3>
                                        <span className="text-[11px] text-slate-400">Sorted by AI Match Score</span>
                                    </div>

                                    {loadingRouting ? (
                                        <div className="py-16 text-center text-slate-500">
                                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-3 border-blue-600 border-t-transparent mb-3" />
                                            <div className="text-sm font-semibold">Running Smart Matching Algorithm...</div>
                                            <div className="text-xs text-slate-400 mt-1">Evaluating university faculty publications &amp; geographic suitability</div>
                                        </div>
                                    ) : routingHeis.length === 0 ? (
                                        <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-xl">
                                            No HEI candidates found for this challenge.
                                        </div>
                                    ) : (
                                        routingHeis.map((hei, idx) => {
                                            const isTop = idx === 0;
                                            const isAssigning = assigningHeiId === hei.id;

                                            const matchData: HEIMatch = {
                                                id: hei.id || hei.heiId,
                                                name: hei.name,
                                                district: hei.district,
                                                sdgOverlap: hei.sdgOverlap !== undefined ? (hei.sdgOverlap <= 1 ? hei.sdgOverlap : hei.sdgOverlap / 100) : 0,
                                                sdgMatched: hei.sdgMatched || [],
                                                distKm: hei.distKm ?? null,
                                                perfScore: hei.perfScore !== undefined ? (hei.perfScore <= 1 ? hei.perfScore : hei.perfScore / 100) : ((hei.pastPerformance ?? 0) / 100),
                                                totalScore: hei.totalScore !== undefined ? (hei.totalScore <= 1 ? hei.totalScore : hei.totalScore / 100) : ((hei.score ?? 0) / 100),
                                                departments: hei.departments || [],
                                                naacGrade: hei.naacGrade,
                                                reasons: hei.reasons,
                                            };

                                            return (
                                                <div key={hei.id || idx} className="space-y-2">
                                                    <RoutingExplainabilityPanel hei={matchData} />
                                                    <button
                                                        onClick={() => handleConfirmRoute(hei.id || hei.heiId)}
                                                        disabled={!!assigningHeiId}
                                                        className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                                                            isTop
                                                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                                                                : 'bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white'
                                                        }`}
                                                    >
                                                        {isAssigning ? (
                                                            <>
                                                                <div className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                                                                <span>Routing to HEI...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                                <span>Validate &amp; Assign to {hei.name.split(' ')[0]}</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Drawer Footer */}
                                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                                    <span>Routing notifies the university and the district officer</span>
                                    <button
                                        onClick={() => setRoutingChallenge(null)}
                                        disabled={!!assigningHeiId}
                                        className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                )}
            </AnimatePresence>

            {/* ===== ORGANIZATIONS DIRECTORY (NOW AT TOP) ===== */}
            <motion.div {...fadeIn(0.15)} className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Platform Partners Directory</h2>
                        <p className="text-xs text-slate-500">Click any organization to view full transaction & project details</p>
                    </div>
                    <div className="flex gap-3 items-center">
                        {/* Type Filter Tabs */}
                        <div className="flex bg-slate-100 rounded-lg p-0.5">
                            {(['all', 'ngo', 'corporate'] as const).map(t => (
                                <button key={t} onClick={() => setTypeFilter(t)}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${typeFilter === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    {t === 'all' ? 'All' : t.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        {/* Search */}
                        <div className="relative w-full md:w-72">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                </div>
                            <input
                                type="text"
                                placeholder="Search name, state, district..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5 shadow-sm outline-none transition-all focus:bg-white"
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th scope="col" className="px-5 py-3.5 font-semibold">Organization</th>
                                <th scope="col" className="px-5 py-3.5 font-semibold">Type</th>
                                <th scope="col" className="px-5 py-3.5 font-semibold">State</th>
                                <th scope="col" className="px-5 py-3.5 font-semibold">District</th>
                                <th scope="col" className="px-5 py-3.5 font-semibold text-center">Projects</th>
                                <th scope="col" className="px-5 py-3.5 font-semibold text-right">Beneficiaries</th>
                                <th scope="col" className="px-5 py-3.5 font-semibold text-center">Impact</th>
                                <th scope="col" className="px-5 py-3.5 font-semibold text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrganizations.map((org, index) => (
                                <tr
                                    key={org.id}
                                    onClick={() => router.push(`/explore/organization/${org.id}`)}
                                    className={`bg-white hover:bg-blue-50/50 transition-all cursor-pointer group ${index === filteredOrganizations.length - 1 ? '' : 'border-b border-slate-50'}`}
                                >
                                    <td className="px-5 py-4 font-semibold text-slate-900">{org.name}</td>
                                    <td className="px-5 py-4">
                                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-md ${org.type === 'NGO' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {org.type === 'CORPORATE' ? 'CSR' : org.type}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-slate-600 text-xs">{org.state ?? '—'}</td>
                                    <td className="px-5 py-4 text-slate-600">{org.district ?? '—'}</td>
                                    <td className="px-5 py-4 text-center font-bold text-slate-900">{org.project_count}</td>
                                    <td className="px-5 py-4 text-right font-semibold text-slate-800">{org.total_beneficiaries.toLocaleString('en-IN')}</td>
                                    <td className="px-5 py-4 text-center">
                                        <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full ${org.impact_score === null ? 'bg-slate-100 text-slate-400' : org.impact_score >= 850 ? 'bg-emerald-100 text-emerald-700' : org.impact_score >= 700 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {org.impact_score === null ? 'Not scored' : Math.round(org.impact_score)}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-center text-xs text-emerald-700 font-medium">Verified <span className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1">→</span></td>
                                </tr>
                            ))}
                            {filteredOrganizations.length === 0 && (
                                <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">No verified organizations match.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="mt-3 text-xs text-slate-400 text-right">Showing {filteredOrganizations.length} of {allOrgs.length} organizations</div>
            </motion.div>

            <div>
                <motion.div {...fadeIn(0.5)} className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Performing NGOs</h2>
                    <div className="space-y-3">
                        {topNGOs.map((ngo, i) => (
                            <div key={ngo.id} className="flex items-center gap-3 p-3 rounded-xl"
                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                                    style={{
                                        background: i === 0 ? 'linear-gradient(135deg,#f59e0b,#f43f5e)' :
                                            i === 1 ? 'linear-gradient(135deg,#94a3b8,#64748b)' :
                                                i === 2 ? 'linear-gradient(135deg,#b45309,#a16207)' :
                                                    'rgba(255,255,255,0.1)',
                                    }}>
                                    {i + 1}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-900">{ngo.name}</p>
                                    <p className="text-xs text-slate-500">{ngo.location.state} • {ngo.beneficiaries.toLocaleString()} beneficiaries</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-blue-500">{ngo.impact_score}</p>
                                    <p className="text-[10px] text-slate-500">Score</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    )}

            {/* ===== POLICY INSIGHTS TAB (PART B) ===== */}
            {activeTab === 'insights' && (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-slate-900">
                                    Policy Insights
                                </h2>
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700 uppercase tracking-wider">
                                    Real-Time Telemetry
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Auto-generated strategic insights dynamically computed from live challenge intakes, CSR escrows, and university deployment cycles.
                            </p>
                        </div>
                        <button
                            onClick={loadPolicyInsights}
                            disabled={loadingInsights}
                            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-2xs transition-all cursor-pointer disabled:opacity-60"
                        >
                            <RefreshCw size={14} className={loadingInsights ? 'animate-spin' : ''} />
                            <span>Refresh Insights</span>
                        </button>
                    </div>

                    {loadingInsights && !policyInsights ? (
                        <div className="glass-card p-16 text-center text-slate-400">
                            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                            <div className="text-sm font-semibold text-slate-600">Generating policy insights from live queries...</div>
                            <div className="text-xs text-slate-400 mt-1">Analysing challenges, proposals and released funds.</div>
                        </div>
                    ) : policyInsights ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {/* 1. Most Underserved District */}
                            <motion.div {...fadeIn(0.05)} className="glass-card p-5 border-l-4 border-l-rose-500 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-50 text-rose-700 border border-rose-200 uppercase">
                                            Critical Equity Alert
                                        </span>
                                        <span className="text-xs text-slate-400 font-mono">INSIGHT #1</span>
                                    </div>
                                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                                        {policyInsights.mostUnderserved.text}
                                    </h3>
                                    <p className="text-xs text-rose-700/90 font-medium mt-2 bg-rose-50/70 p-2 rounded-lg border border-rose-100">
                                        {policyInsights.mostUnderserved.recommendation}
                                    </p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-100">
                                    <div className="text-[11px] font-semibold text-slate-500 mb-2">Pending vs. University Projects</div>
                                    <div className="h-32">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={policyInsights.mostUnderserved.chartData} layout="vertical">
                                                <XAxis type="number" hide />
                                                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={70} />
                                                <Tooltip />
                                                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                                                    {policyInsights.mostUnderserved.chartData?.map((entry: any, index: number) => (
                                                        <Cell key={`cell-mu-${index}`} fill={entry.fill} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </motion.div>

                            {/* 2. Fastest Resolution */}
                            <motion.div {...fadeIn(0.1)} className="glass-card p-5 border-l-4 border-l-emerald-500 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                                            Velocity Benchmark
                                        </span>
                                        <span className="text-xs text-slate-400 font-mono">INSIGHT #2</span>
                                    </div>
                                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                                        {policyInsights.fastestResolution.text}
                                    </h3>
                                    <div className="mt-3 flex items-center gap-3">
                                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                            <div className="text-2xl font-bold text-emerald-700">{policyInsights.fastestResolution.avgDays}</div>
                                            <div className="text-[10px] text-emerald-800 font-semibold uppercase">Days Average</div>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                                            <div className="text-2xl font-bold text-slate-800">{policyInsights.fastestResolution.resolvedCount}</div>
                                            <div className="text-[10px] text-slate-500 font-semibold uppercase">Challenges Resolved</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                                    Top performing district model for regional replication and peer exchange.
                                </div>
                            </motion.div>

                            {/* 3. SDG Coverage Gap */}
                            <motion.div {...fadeIn(0.15)} className="glass-card p-5 border-l-4 border-l-amber-500 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                                            SDG Under-Funding Gap
                                        </span>
                                        <span className="text-xs text-slate-400 font-mono">INSIGHT #3</span>
                                    </div>
                                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                                        {policyInsights.sdgCoverageGap.text}
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-2">
                                        SDG {policyInsights.sdgCoverageGap.sdgNumber} ({policyInsights.sdgCoverageGap.sdgTitle}) has high civic demand but low capital allocation.
                                    </p>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-100">
                                    <div className="text-[11px] font-semibold text-slate-500 mb-2">Demand vs. CSR Allocation</div>
                                    <div className="h-32">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={policyInsights.sdgCoverageGap.chartData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                                                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                                                <Tooltip />
                                                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28}>
                                                    {policyInsights.sdgCoverageGap.chartData?.map((entry: any, index: number) => (
                                                        <Cell key={`cell-gap-${index}`} fill={entry.fill} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </motion.div>

                            {/* 4. CSR Utilization */}
                            <motion.div {...fadeIn(0.2)} className="glass-card p-5 border-l-4 border-l-blue-500 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                                            CSR Capital Utilization
                                        </span>
                                        <span className="text-xs text-slate-400 font-mono">INSIGHT #4</span>
                                    </div>
                                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                                        {policyInsights.csrUtilization.text}
                                    </h3>
                                    <div className="mt-4">
                                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                                            <span>Milestone Disbursed: ₹{policyInsights.csrUtilization.disbursedLakhs}L</span>
                                            <span className="text-blue-600 font-bold">{policyInsights.csrUtilization.disbursedPercent}%</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                            <div
                                                className="bg-blue-600 h-full rounded-full transition-all"
                                                style={{ width: `${policyInsights.csrUtilization.disbursedPercent}%` }}
                                            />
                                        </div>
                                        <div className="text-[10px] text-slate-400 mt-1">
                                            Total Committed: ₹{policyInsights.csrUtilization.committedLakhs} Lakhs
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                                    Tracks authorization signal clearing against verifiable proof of milestone completion.
                                </div>
                            </motion.div>

                            {/* 5. University Engagement */}
                            <motion.div {...fadeIn(0.25)} className="glass-card p-5 border-l-4 border-l-purple-500 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-50 text-purple-700 border border-purple-200 uppercase">
                                            University Engagement
                                        </span>
                                        <span className="text-xs text-slate-400 font-mono">INSIGHT #5</span>
                                    </div>
                                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                                        {policyInsights.universityEngagement.text}
                                    </h3>
                                    <div className="mt-4 flex items-center gap-3">
                                        <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                                            <div className="text-2xl font-bold text-purple-700">{policyInsights.universityEngagement.acceptedThisMonth}</div>
                                            <div className="text-[10px] text-purple-800 font-semibold uppercase">Accepted This Month</div>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                                            <div className="text-2xl font-bold text-slate-800">{policyInsights.universityEngagement.totalAssigned}</div>
                                            <div className="text-[10px] text-slate-500 font-semibold uppercase">Total Assigned</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                                    Leading Higher Education Institution driving state challenge problem formulation and prototypes.
                                </div>
                            </motion.div>
                        </div>
                    ) : (
                        <div className="glass-card p-10 text-center text-sm text-slate-500">
                            Policy insights could not be loaded. Please try again later.
                        </div>
                    )}
                </div>
            )}

            {/* ===== GOVERNMENT AUDIT LOG VIEWER (PART D) ===== */}
            {activeTab === 'audit' && (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-slate-900">
                                    Government &amp; System Audit Trail
                                </h2>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Record of validation, routing, escalation and milestone actions.
                            </p>
                        </div>
                        <button
                            onClick={() => loadAuditLogs(auditActionFilter, auditDateFrom, auditDateTo)}
                            disabled={loadingAuditLogs}
                            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-2xs transition-all cursor-pointer disabled:opacity-60"
                        >
                            <RefreshCw size={14} className={loadingAuditLogs ? 'animate-spin' : ''} />
                            <span>Refresh Log</span>
                        </button>
                    </div>

                    {/* Filter Bar */}
                    <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Action Filter */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-600">Action:</span>
                                <select
                                    value={auditActionFilter}
                                    onChange={(e) => {
                                        setAuditActionFilter(e.target.value);
                                        loadAuditLogs(e.target.value, auditDateFrom, auditDateTo);
                                    }}
                                    className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                >
                                    <option value="ALL">All Actions</option>
                                    <option value="CHALLENGE_VALIDATED">CHALLENGE_VALIDATED</option>
                                    <option value="HEI_ALLOCATED">HEI_ALLOCATED</option>
                                    <option value="CHALLENGE_ESCALATED">CHALLENGE_ESCALATED</option>
                                    <option value="MILESTONE_APPROVED">MILESTONE_APPROVED</option>
                                    <option value="PROPOSAL_ACCEPTED">PROPOSAL_ACCEPTED</option>
                                    <option value="CHALLENGE_SUBMITTED">CHALLENGE_SUBMITTED</option>
                                </select>
                            </div>

                            {/* Date From */}
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                <span>From:</span>
                                <input
                                    type="date"
                                    value={auditDateFrom}
                                    onChange={(e) => {
                                        setAuditDateFrom(e.target.value);
                                        loadAuditLogs(auditActionFilter, e.target.value, auditDateTo);
                                    }}
                                    className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-2 py-1 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            {/* Date To */}
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                <span>To:</span>
                                <input
                                    type="date"
                                    value={auditDateTo}
                                    onChange={(e) => {
                                        setAuditDateTo(e.target.value);
                                        loadAuditLogs(auditActionFilter, auditDateFrom, e.target.value);
                                    }}
                                    className="bg-slate-50 border border-slate-200 text-xs rounded-lg px-2 py-1 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* Search */}
                        <div className="relative w-full sm:w-64">
                            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search actor, action, district..."
                                value={auditSearch}
                                onChange={(e) => setAuditSearch(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* Audit Table */}
                    <div className="glass-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                                    <tr>
                                        <th className="px-4 py-3">Timestamp</th>
                                        <th className="px-4 py-3">Actor</th>
                                        <th className="px-4 py-3">Action</th>
                                        <th className="px-4 py-3">Entity</th>
                                        <th className="px-4 py-3">District</th>
                                        <th className="px-4 py-3">Audit Details</th>

                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loadingAuditLogs ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                                <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                                Loading audit trail records...
                                            </td>
                                        </tr>
                                    ) : (() => {
                                        const filtered = auditLogs.filter((log) => {
                                            const q = auditSearch.toLowerCase();
                                            return (
                                                log.action?.toLowerCase().includes(q) ||
                                                log.actor?.email?.toLowerCase().includes(q) ||
                                                log.district?.toLowerCase().includes(q) ||
                                                log.entity_type?.toLowerCase().includes(q)
                                            );
                                        });

                                        if (filtered.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                                        No audit trail records found matching criteria.
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return filtered.map((log) => {
                                            const isCritical = log.action === 'CHALLENGE_ESCALATED';
                                            const isSuccess = log.action === 'CHALLENGE_VALIDATED' || log.action === 'MILESTONE_APPROVED';
                                            const isHei = log.action === 'HEI_ALLOCATED';

                                            return (
                                                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-4 py-3 text-slate-500 font-mono whitespace-nowrap">
                                                        {new Date(log.created_at).toLocaleString('en-IN', {
                                                            dateStyle: 'short',
                                                            timeStyle: 'medium',
                                                        })}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-slate-800">{log.actor?.email || 'System'}</div>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                                                            {log.actor?.role || 'SYSTEM'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span
                                                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                                                                isCritical
                                                                    ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                                                    : isSuccess
                                                                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                                                                    : isHei
                                                                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                                                    : 'bg-slate-100 text-slate-700'
                                                            }`}
                                                        >
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-slate-600">
                                                        <span className="font-semibold text-slate-800">{log.entity_type}</span>: {log.entity_id?.slice(0, 10)}...
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="font-semibold text-slate-700">
                                                            {log.district && log.district !== '-' ? `${log.district}` : '—'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                                                        {log.details?.previous ? (
                                                            <span className="text-[11px]">
                                                                <span className="text-slate-400 line-through mr-1">{JSON.stringify(log.details.previous)}</span>
                                                                → <span className="font-semibold text-emerald-700">{JSON.stringify(log.details.new)}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400 text-[11px] italic">Logged State Event</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-4 py-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
                            <span>Showing {auditLogs.length} audit entries</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== DISTRICT DRILL-DOWN SIDE DRAWER (PART A) ===== */}
            <AnimatePresence>
                {selectedDistrict && (
                    <div className="fixed inset-0 z-50 overflow-hidden">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedDistrict(null)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
                        />

                        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="w-screen max-w-lg md:max-w-xl bg-white shadow-2xl flex flex-col"
                            >
                                {/* Drawer Header */}
                                <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <MapPin className="w-5 h-5 text-emerald-400" />
                                            <h2 className="text-lg font-bold text-white tracking-tight">{selectedDistrict} District</h2>
                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                                                Command Drill-Down
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-300">
                                            {districtDrillData?.district?.division || 'District'} • District profile
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedDistrict(null)}
                                        className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Content Scrollable */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                    {loadingDistrictDrill ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                                            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-xs font-semibold">Aggregating {selectedDistrict} district intelligence...</span>
                                        </div>
                                    ) : districtDrillData ? (
                                        <>
                                            {/* Top 3 SDG Pressure Indicators */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                        Top SDG Pressure Indicators
                                                    </h3>
                                                    <span className="text-[10px] text-slate-400">From open reports</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {districtDrillData.pressureSDGs?.map((sdg: any, idx: number) => (
                                                        <div
                                                            key={idx}
                                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-xs"
                                                            style={{
                                                                backgroundColor: `${sdg.color}10`,
                                                                borderColor: `${sdg.color}35`,
                                                                color: sdg.color,
                                                            }}
                                                        >
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/80 shadow-2xs">
                                                                SDG {sdg.sdgNumber}
                                                            </span>
                                                            <span className="truncate max-w-[170px]">{sdg.title}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* 5 Aggregated Stats Grid */}
                                            <div>
                                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    District Key Metrics
                                                </h3>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                                                        <div className="text-[11px] text-slate-500 font-medium">Total Submitted</div>
                                                        <div className="text-xl font-bold text-slate-900 mt-1">
                                                            {districtDrillData.stats.totalChallenges}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">Challenges logged</div>
                                                    </div>

                                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                                                        <div className="text-[11px] text-slate-500 font-medium">Resolved &amp; Deployed</div>
                                                        <div className="text-xl font-bold text-emerald-600 mt-1">
                                                            {districtDrillData.stats.resolvedChallenges}
                                                        </div>
                                                        <div className="text-[10px] text-emerald-700/80 mt-0.5">COMPLETED / DEPLOYED</div>
                                                    </div>

                                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                                                        <div className="text-[11px] text-slate-500 font-medium">Resolution Rate</div>
                                                        <div className="text-xl font-bold text-indigo-600 mt-1">
                                                            {districtDrillData.stats.resolutionRate}%
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">Completion ratio</div>
                                                    </div>

                                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                                                        <div className="text-[11px] text-slate-500 font-medium">Active HEI Projects</div>
                                                        <div className="text-xl font-bold text-blue-600 mt-1">
                                                            {districtDrillData.stats.activeEngagements}
                                                        </div>
                                                        <div className="text-[10px] text-blue-700/80 mt-0.5">University teams active</div>
                                                    </div>

                                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 col-span-2 sm:col-span-2">
                                                        <div className="text-[11px] text-slate-500 font-medium">CSR Funding Committed</div>
                                                        <div className="text-xl font-bold text-slate-900 mt-1">
                                                            ₹{districtDrillData.stats.committedCSRFunding.toLocaleString('en-IN')}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5">From approved &amp; accepted proposals</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Recommendation Banner (Mandated Hardcoded Logic) */}
                                            <div
                                                className={`p-4 rounded-xl border ${
                                                    districtDrillData.stats.resolutionRate < 40
                                                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                                                        : districtDrillData.stats.resolutionRate <= 70
                                                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                                                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2.5">
                                                    <div className="text-lg shrink-0">
                                                        {districtDrillData.stats.resolutionRate < 40 ? '' : districtDrillData.stats.resolutionRate <= 70 ? '' : ''}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold uppercase tracking-wider mb-0.5 opacity-75">
                                                            Governance Action Recommendation
                                                        </div>
                                                        <p className="text-xs font-semibold leading-relaxed">
                                                            {districtDrillData.recommendation}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Top 3 Pending Challenges */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                        Top Pending Challenges ({districtDrillData.topPendingChallenges?.length || 0})
                                                    </h3>
                                                    <span className="text-[10px] text-slate-400">Needs Academic Routing</span>
                                                </div>

                                                {districtDrillData.topPendingChallenges?.length > 0 ? (
                                                    <div className="space-y-2.5">
                                                        {districtDrillData.topPendingChallenges.map((ch: any) => (
                                                            <div
                                                                key={ch.id}
                                                                className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-2xs"
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="font-semibold text-xs text-slate-900 leading-snug">
                                                                        {ch.title}
                                                                    </div>
                                                                    <span
                                                                        className={`shrink-0 px-2 py-0.5 text-[9px] font-bold rounded-md uppercase ${
                                                                            ch.status === 'ESCALATED'
                                                                                ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                                                                : 'bg-amber-100 text-amber-700'
                                                                        }`}
                                                                    >
                                                                        {ch.status.replace('_', ' ')}
                                                                    </span>
                                                                </div>

                                                                <div className="flex items-center justify-between mt-2.5 text-[11px] text-slate-500">
                                                                    <span className="flex items-center gap-1">
                                                                        <Clock size={12} className="text-slate-400" />
                                                                        <span>{ch.daysPending} days pending</span>
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <a
                                                                            href={`/project/${ch.projectId || ch.projectTeamId || ch.id}/ledger`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="px-2 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors inline-flex items-center gap-1"
                                                                            title="View Cryptographic Impact Ledger"
                                                                        >
                                                                            <ShieldCheck size={12} className="text-emerald-600" />
                                                                            <span>Ledger ↗</span>
                                                                        </a>
                                                                        <button
                                                                            onClick={() => {
                                                                                setSelectedDistrict(null);
                                                                                handleOpenValidateRoute(ch);
                                                                            }}
                                                                            className="px-2 py-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                                                                        >
                                                                            Validate &amp; Route →
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                        No pending challenges in {selectedDistrict} currently.
                                                    </div>
                                                )}
                                            </div>

                                            {/* Hub & Regional Proximity Metadata */}
                                            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-slate-500 font-medium">Nearest Academic Center (HEI):</span>
                                                    <span className="font-semibold text-slate-900">{districtDrillData.district.nearestHEI}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-slate-500 font-medium">State:</span>
                                                    <span className="font-semibold text-slate-900">{districtDrillData.district.division}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-slate-500 font-medium">Universities in state:</span>
                                                    <span className="font-mono text-slate-700 font-semibold">{districtDrillData.district.code}</span>
                                                </div>
                                            </div>

                                        </>
                                    ) : null}
                                </div>
                            </motion.div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

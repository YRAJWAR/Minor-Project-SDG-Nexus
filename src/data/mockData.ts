// ============================================================
// SDG Nexus — shared reference data (SDG names/colours) and UI types.
// No demo records live here: all records come from the database.
// ============================================================

export const SDG_INFO = [
    { id: 1, name: 'No Poverty', color: '#e5243b', icon: '🎯' },
    { id: 2, name: 'Zero Hunger', color: '#dda63a', icon: '🌾' },
    { id: 3, name: 'Good Health', color: '#4c9f38', icon: '🏥' },
    { id: 4, name: 'Quality Education', color: '#c5192d', icon: '📚' },
    { id: 5, name: 'Gender Equality', color: '#ff3a21', icon: '⚧' },
    { id: 6, name: 'Clean Water', color: '#26bde2', icon: '💧' },
    { id: 7, name: 'Affordable Energy', color: '#fcc30b', icon: '⚡' },
    { id: 8, name: 'Decent Work', color: '#a21949', icon: '💼' },
    { id: 9, name: 'Industry & Innovation', color: '#fd6e25', icon: '🏭' },
    { id: 10, name: 'Reduced Inequalities', color: '#dd1367', icon: '⚖️' },
    { id: 11, name: 'Sustainable Cities', color: '#fd9d24', icon: '🏙️' },
    { id: 12, name: 'Responsible Consumption', color: '#bf8b2e', icon: '♻️' },
    { id: 13, name: 'Climate Action', color: '#3f7e44', icon: '🌍' },
    { id: 14, name: 'Life Below Water', color: '#0a97d9', icon: '🐟' },
    { id: 15, name: 'Life on Land', color: '#56c02b', icon: '🌲' },
    { id: 16, name: 'Peace & Justice', color: '#0056c8', icon: '⚖️' },
    { id: 17, name: 'Partnerships', color: '#19486a', icon: '🤝' },
];

export type UserRole = 'ngo' | 'government' | 'corporate' | 'hei' | 'citizen' | 'student' | 'admin';

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    organization_name: string;
    organization_id?: string | null; // NGO/CSR users' organisation
    verification_status: 'verified' | 'pending' | 'unverified';
    created_at: string;
    avatar?: string;
}

export interface Project {
    id: string;
    title: string;
    description: string;
    organization_id: string;
    organization_name: string;
    budget: number;
    spent: number;
    location: { lat: number; lng: number; name: string };
    timeline: { start: string; end: string };
    beneficiary_count: number;
    sdg_tags: number[];
    sdg_reasoning?: string;
    status: 'active' | 'completed' | 'planning';
    created_at: string;
    impact_score: number;
}

export interface Activity {
    id: string;
    project_id: string;
    project_title: string;
    description: string;
    timestamp: string;
    hash: string;
    media_url?: string;
    location: string;
    verified: boolean;
}

export interface Donation {
    id: string;
    donor_id: string;
    donor_name: string;
    project_id: string;
    project_title: string;
    amount: number;
    sdg_tags: number[];
    timestamp: string;
}

export interface ImpactScore {
    organization_id: string;
    overall_score: number;
    beneficiary_scale: number;
    outcome_score: number;
    geographic_need: number;
    funding_efficiency: number;
    verification_score: number;
    sdg_breakdown: { sdg: number; score: number }[];
}

// ---------- PARTNER NGOs FOR MATCHING ----------
export interface PartnerNGO {
    id: string;
    name: string;
    sdg_focus: number[];
    location: { lat: number; lng: number; state: string };
    impact_score: number;
    funding_need: number;
    projects_count: number;
    beneficiaries: number;
    verified: boolean;
}

// ---------- HEATMAP DATA ----------
export interface RegionData {
    name: string;
    lat: number;
    lng: number;
    funding: number;
    ngo_count: number;
    primary_sdgs: number[];
    projects: number;
    beneficiaries: number;
}


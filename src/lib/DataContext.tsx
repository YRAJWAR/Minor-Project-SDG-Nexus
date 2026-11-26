'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/AuthContext';
import {
    type Project, type Activity, type Donation, type ImpactScore, type PartnerNGO, type RegionData,
} from '@/data/mockData';
import CryptoJS from 'crypto-js';

interface DataContextType {
    projects: Project[];
    activities: Activity[];
    donations: Donation[];
    impactScores: ImpactScore[];
    organizations: PartnerNGO[];
    regions: RegionData[];
    myCsr: { committed: number; disbursed: number; projects: number; sdgs: number; beneficiaries: number } | null;
    addProject: (project: Omit<Project, 'id' | 'created_at'>) => Project;
    addActivity: (activity: Omit<Activity, 'id' | 'hash'>) => Activity;
    addDonation: (donation: Omit<Donation, 'id'>) => void;
    getProjectsByOrg: (orgId: string) => Project[];
    getActivitiesByProject: (projectId: string) => Activity[];
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
    // Loaded from the database (/api/overview) once the user is signed in; empty until then, never fake.
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [donations, setDonations] = useState<Donation[]>([]);
    const [impactScores, setImpactScores] = useState<ImpactScore[]>([]);
    const [organizations, setOrganizations] = useState<PartnerNGO[]>([]);
    const [regions, setRegions] = useState<RegionData[]>([]);
    const [myCsr, setMyCsr] = useState<DataContextType['myCsr']>(null);

    useEffect(() => {
        if (!user) return;
        fetch('/api/overview', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                if (!j?.success) return;
                setProjects(j.data.projects);
                setActivities(j.data.activities);
                setImpactScores(j.data.impactScores);
                setOrganizations(j.data.organizations);
                setRegions(j.data.regions);
                setMyCsr(j.data.myCsr);
            })
            .catch(() => undefined);
    }, [user]);

    const addProject = useCallback((projectData: Omit<Project, 'id' | 'created_at'>): Project => {
        const newProject: Project = {
            ...projectData,
            id: `p${Date.now()}`,
            created_at: new Date().toISOString().split('T')[0],
        };
        setProjects(prev => [newProject, ...prev]);
        return newProject;
    }, []);

    const addActivity = useCallback((activityData: Omit<Activity, 'id' | 'hash'>): Activity => {
        const hashInput = `${activityData.description}|${activityData.timestamp}|${activityData.location}|${activityData.project_id}`;
        const hash = CryptoJS.SHA256(hashInput).toString();
        const newActivity: Activity = {
            ...activityData,
            id: `a${Date.now()}`,
            hash,
        };
        setActivities(prev => [newActivity, ...prev]);
        return newActivity;
    }, []);

    const addDonation = useCallback((donationData: Omit<Donation, 'id'>) => {
        const newDonation: Donation = { ...donationData, id: `d${Date.now()}` };
        setDonations(prev => [newDonation, ...prev]);
    }, []);

    const getProjectsByOrg = useCallback((orgId: string) => {
        return projects.filter(p => p.organization_id === orgId);
    }, [projects]);

    const getActivitiesByProject = useCallback((projectId: string) => {
        return activities.filter(a => a.project_id === projectId);
    }, [activities]);

    return (
        <DataContext.Provider value={{
            projects, activities, donations, impactScores, organizations, regions, myCsr,
            addProject, addActivity, addDonation, getProjectsByOrg, getActivitiesByProject,
        }}>
            {children}
        </DataContext.Provider>
    );
}

export function useData(): DataContextType {
    const ctx = useContext(DataContext);
    if (!ctx) throw new Error('useData must be used within DataProvider');
    return ctx;
}

'use client';

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
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
    addProject: (project: Omit<Project, 'id' | 'created_at'>) => Project;
    addActivity: (activity: Omit<Activity, 'id' | 'hash'>) => Activity;
    addDonation: (donation: Omit<Donation, 'id'>) => void;
    getProjectsByOrg: (orgId: string) => Project[];
    getActivitiesByProject: (projectId: string) => Activity[];
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
    // ponytail: starts empty (no fake data). Pages still reading this get wired to the real APIs in Phase 2.
    const [projects, setProjects] = useState<Project[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [donations, setDonations] = useState<Donation[]>([]);
    const [impactScores] = useState<ImpactScore[]>([]);
    const [organizations] = useState<PartnerNGO[]>([]);
    const [regions] = useState<RegionData[]>([]);

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
            projects, activities, donations, impactScores, organizations, regions,
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

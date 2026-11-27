'use client';

import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import type { User, UserRole } from '@/data/mockData';

// Server roles (Prisma enum) → the role keys the pages and sidebar use.
const UI_ROLE: Record<string, UserRole> = {
    CITIZEN: 'citizen',
    OFFICER: 'government',
    FACULTY: 'hei',
    STUDENT: 'student',
    NGO: 'ngo',
    CSR: 'corporate',
    ADMIN: 'admin',
};

interface ApiUser {
    id: string;
    name: string;
    email: string;
    role: string;
    organizationId: string | null;
    organizationName: string | null;
    organizationStatus: string | null;
    district: string | null;
    state: string | null;
    createdAt: string;
}

function toUser(u: ApiUser): User {
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: UI_ROLE[u.role] ?? 'citizen',
        organization_id: u.organizationId,
        organization_name: u.organizationName ?? (u.district ? `${u.district}, ${u.state}` : ''),
        verification_status: u.organizationStatus === 'PENDING' ? 'pending' : 'verified',
        created_at: u.createdAt.split('T')[0],
    };
}

export interface RegisterInput {
    name: string;
    email: string;
    password: string;
    role: 'CITIZEN' | 'FACULTY' | 'STUDENT' | 'NGO' | 'CSR';
    inviteCode?: string;
    branch?: string;
    year?: number;
    organizationName?: string;
    state?: string;
    district?: string;
}

/** Result of login/register: null on success, otherwise a message to show the user. */
type AuthResult = string | null;

/** Each role's own starting page (also used by /dashboard to forward signed-in users). */
export const ROLE_HOME: Record<string, string> = {
    ngo: '/dashboard/ngo', government: '/dashboard/government', admin: '/dashboard/admin', corporate: '/dashboard/corporate',
    hei: '/dashboard/hei', citizen: '/dashboard/reports', student: '/dashboard/hei/milestones',
};

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ error: string | null; home: string }>;
    register: (input: RegisterInput) => Promise<AuthResult>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function errorMessage(json: { error?: unknown }): string {
    const e = json?.error as { message?: string; details?: string[] } | string | undefined;
    if (typeof e === 'string') return e;
    if (e?.details?.length) return `${e.message ?? 'Please check the form'}: ${e.details.join('; ')}`;
    return e?.message ?? 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // The session lives in an httpOnly cookie; ask the server who we are.
    useEffect(() => {
        fetch('/api/auth/me', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => setUser(json?.success ? toUser(json.data) : null))
            .catch(() => setUser(null))
            .finally(() => setIsLoading(false));
    }, []);

    const submit = useCallback(async (url: string, body: unknown): Promise<User | string> => {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) return errorMessage(json);
            const u = toUser(json.data);
            setUser(u);
            return u;
        } catch {
            return 'Could not reach the server. Please check your connection.';
        }
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const r = await submit('/api/auth/login', { email, password });
        return typeof r === 'string' ? { error: r, home: '/dashboard' } : { error: null, home: ROLE_HOME[r.role] ?? '/dashboard' };
    }, [submit]);
    const register = useCallback(async (input: RegisterInput) => {
        const r = await submit('/api/auth/register', input);
        return typeof r === 'string' ? r : null;
    }, [submit]);

    const logout = useCallback(async () => {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

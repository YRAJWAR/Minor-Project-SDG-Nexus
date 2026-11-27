'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export default function DashboardRedirect() {
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (user) {
            const rolePaths: Record<string, string> = {
                ngo: '/dashboard/ngo',
                government: '/dashboard/government',
                admin: '/dashboard/admin',
                corporate: '/dashboard/corporate',
                hei: '/dashboard/hei',
                citizen: '/citizen/submit',
                student: '/dashboard/hei/milestones',
            };
            router.replace(rolePaths[user.role] ?? '/citizen/submit');
        }
    }, [user, router]);

    return null;
}

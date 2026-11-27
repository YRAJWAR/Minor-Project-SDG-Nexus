'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, ROLE_HOME } from '@/lib/AuthContext';

export default function DashboardRedirect() {
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (user) {
            router.replace(ROLE_HOME[user.role] ?? '/citizen/submit');
        }
    }, [user, router]);

    return null;
}

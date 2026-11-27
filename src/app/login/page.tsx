'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const router = useRouter();
    // The landing page links here with ?email= to prefill a demo account.
    useEffect(() => { setEmail(new URLSearchParams(window.location.search).get('email') ?? ''); }, []);
    // The free database sleeps when idle; wake it (and the server) while the person is still typing.
    useEffect(() => { fetch('/api/health', { cache: 'no-store' }).catch(() => undefined); }, []);

    const signIn = async (mail: string, pass: string) => {
        setError('');
        setLoading(true);
        const { error: err, home } = await login(mail, pass);
        if (err) {
            setError(err);
            setLoading(false);
            return;
        }
        // Back to the page the guard sent us from, but only same-site paths.
        const next = new URLSearchParams(window.location.search).get('next');
        router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : home);
    };
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); signIn(email, password); };
    // Demo accounts are fictional and share the password published on the home page (prisma/seed.ts).
    const DEMO_PASSWORD = 'Demo@1234';

    // Fictional demo accounts created by prisma/seed.ts.
    const demoAccounts = [
        { label: 'Citizen', email: 'citizen@demo.sdgnexus.in' },
        { label: 'District Officer', email: 'officer.nalgonda@demo.sdgnexus.in' },
        { label: 'Faculty', email: 'faculty@demo.sdgnexus.in' },
        { label: 'Student', email: 'student@demo.sdgnexus.in' },
        { label: 'NGO', email: 'ngo@demo.sdgnexus.in' },
        { label: 'CSR Partner', email: 'csr@demo.sdgnexus.in' },
        { label: 'Admin', email: 'admin@demo.sdgnexus.in' },
    ];

    return (
        <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
            style={{ background: 'var(--color-paper)' }}>
            


            <motion.div
                initial={{ opacity: 1, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="glass-card-dark p-8 w-full max-w-md relative z-10"
            >
                <div className="text-center mb-8">
                    <Image src="/logo.png" alt="SDG Nexus" width={56} height={56}
                        className="rounded-2xl mx-auto mb-4" style={{ objectFit: 'contain' }} />
                    <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
                    <p className="text-sm text-slate-400 mt-1">Sign in to SDG Nexus</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                            className="input-dark-theme" placeholder="your@email.com" required />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                            className="input-dark-theme" placeholder="••••••••" required />
                    </div>

                    {error && (
                        <p role="alert" className="text-sm text-[var(--color-rust)] text-center bg-[var(--color-rust-wash)] rounded py-2">{error}</p>
                    )}

                    <button type="submit" disabled={loading}
                        className="btn-neon w-full py-3 text-sm disabled:opacity-50">
                        {loading ? 'Signing in...' : 'Sign In →'}
                    </button>
                </form>

                {/* Demo accounts */}
                <div className="mt-6">
                    <p className="text-xs text-slate-500 text-center mb-3">One-click demo login (fictional accounts)</p>
                    <div className="grid grid-cols-2 gap-2">
                        {demoAccounts.map(acc => (
                            <button key={acc.email}
                                type="button" disabled={loading} onClick={() => { setEmail(acc.email); signIn(acc.email, DEMO_PASSWORD); }}
                                className="px-3 py-2.5 rounded text-sm font-medium transition-colors flex items-center gap-2 border border-[var(--color-rule)] bg-[var(--color-sheet)] text-[var(--color-ink)] hover:border-[var(--color-survey)] hover:text-[var(--color-survey)] disabled:opacity-50">
                                <span>{acc.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <p className="text-center text-xs text-slate-500 mt-6">
                    Don&apos;t have an account? <Link href="/register" className="text-[var(--color-survey)] font-semibold hover:underline">Register</Link>
                </p>
            </motion.div>
        </div>
    );
}

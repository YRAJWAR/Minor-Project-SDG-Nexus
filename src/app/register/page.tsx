'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useAuth, type RegisterInput } from '@/lib/AuthContext';

type Role = RegisterInput['role'];

// District officers and admins are created by an admin, never self-registered.
const ROLES: { value: Role; label: string; desc: string }[] = [
    { value: 'CITIZEN', label: 'Citizen', desc: 'Report local problems and follow them' },
    { value: 'STUDENT', label: 'Student', desc: 'Join a university team (invite code)' },
    { value: 'FACULTY', label: 'Faculty', desc: 'Lead university projects (invite code)' },
    { value: 'NGO', label: 'NGO', desc: 'Run projects; verified by an admin' },
    { value: 'CSR', label: 'CSR partner', desc: 'Fund milestones; verified by an admin' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-xs font-medium mb-1.5 text-slate-400">{label}</span>
            {children}
        </label>
    );
}

export default function RegisterPage() {
    const { register } = useAuth();
    const router = useRouter();
    const [role, setRole] = useState<Role>('CITIZEN');
    const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', inviteCode: '', branch: '', year: '1', organizationName: '', state: '', district: '' });
    const [regions, setRegions] = useState<{ name: string; districts: string[] }[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

    const needsUni = role === 'FACULTY' || role === 'STUDENT';
    const needsOrg = role === 'NGO' || role === 'CSR';

    useEffect(() => {
        if (!needsOrg || regions.length) return;
        fetch('/api/regions').then((r) => (r.ok ? r.json() : null)).then((j) => setRegions(j?.data ?? [])).catch(() => undefined);
    }, [needsOrg, regions.length]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (f.password !== f.confirm) return setError('Passwords do not match.');
        if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) {
            return setError('Password needs at least 8 characters, with a letter and a number.');
        }
        setLoading(true);
        const err = await register({
            name: f.name, email: f.email, password: f.password, role,
            ...(needsUni ? { inviteCode: f.inviteCode.trim() } : {}),
            ...(role === 'STUDENT' ? { branch: f.branch, year: Number(f.year) } : {}),
            ...(needsOrg ? { organizationName: f.organizationName, state: f.state, district: f.district || undefined } : {}),
        });
        setLoading(false);
        if (err) return setError(err);
        router.push('/dashboard');
    };

    const districts = regions.find((s) => s.name === f.state)?.districts ?? [];

    return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0a0f1e' }}>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                className="glass-card-dark p-8 w-full" style={{ maxWidth: 560 }}>
                <div className="text-center mb-7">
                    <Image src="/logo.png" alt="SDG Nexus" width={52} height={52} className="rounded-2xl mx-auto mb-3" style={{ objectFit: 'contain' }} />
                    <h1 className="text-2xl font-bold text-white">Join SDG Nexus</h1>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <fieldset>
                        <legend className="text-xs font-medium mb-2 text-slate-400">I am a</legend>
                        <div className="grid grid-cols-2 gap-2">
                            {ROLES.map((r) => (
                                <button type="button" key={r.value} aria-pressed={role === r.value}
                                    onClick={() => { setRole(r.value); setError(''); }}
                                    className="p-3 rounded-xl text-left transition-colors"
                                    style={{
                                        background: role === r.value ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${role === r.value ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                    }}>
                                    <p className="text-sm font-semibold text-slate-100">{r.label}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{r.desc}</p>
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <Field label="Full name"><input className="input-dark-theme" value={f.name} onChange={set('name')} required minLength={2} /></Field>
                    <Field label="Email"><input type="email" className="input-dark-theme" value={f.email} onChange={set('email')} required /></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Password"><input type="password" className="input-dark-theme" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" /></Field>
                        <Field label="Confirm password"><input type="password" className="input-dark-theme" value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" /></Field>
                    </div>

                    {needsUni && (
                        <Field label="University invite code (from your university's admin)">
                            <input className="input-dark-theme font-mono" value={f.inviteCode} onChange={set('inviteCode')} required />
                        </Field>
                    )}
                    {role === 'STUDENT' && (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Branch"><input className="input-dark-theme" value={f.branch} onChange={set('branch')} placeholder="e.g. CSE" required /></Field>
                            <Field label="Year">
                                <select className="input-dark-theme" value={f.year} onChange={set('year')}>
                                    {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </Field>
                        </div>
                    )}
                    {needsOrg && (
                        <>
                            <Field label={role === 'NGO' ? 'NGO name' : 'Company name'}>
                                <input className="input-dark-theme" value={f.organizationName} onChange={set('organizationName')} required minLength={2} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="State / UT">
                                    <select className="input-dark-theme" value={f.state} onChange={(e) => setF((p) => ({ ...p, state: e.target.value, district: '' }))} required>
                                        <option value="">{regions.length ? 'Choose…' : 'Loading…'}</option>
                                        {regions.map((s) => <option key={s.name}>{s.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="District (optional)">
                                    <select className="input-dark-theme" value={f.district} onChange={set('district')} disabled={!districts.length}>
                                        <option value="">—</option>
                                        {districts.map((d) => <option key={d}>{d}</option>)}
                                    </select>
                                </Field>
                            </div>
                            <p className="text-xs text-slate-500">Your organisation stays “pending” until an admin verifies it.</p>
                        </>
                    )}

                    {error && <p role="alert" className="text-xs text-red-400 text-center bg-red-400/10 rounded-lg py-2 px-3">{error}</p>}

                    <button type="submit" disabled={loading} className="btn-neon w-full py-3 text-sm disabled:opacity-50">
                        {loading ? 'Creating account…' : 'Create account'}
                    </button>
                </form>

                <p className="text-center text-xs text-slate-500 mt-6">
                    Already registered? <Link href="/login" className="text-cyan-400 hover:underline">Sign in</Link>
                </p>
            </motion.div>
        </div>
    );
}

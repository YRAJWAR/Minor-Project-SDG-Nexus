import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Building2, GraduationCap, HandCoins, Landmark, MapPin, Search, ShieldCheck, Sprout, UserRound, Users } from 'lucide-react';
import prisma from '@/lib/prisma';
import MapSlot from '@/components/landing/MapSlot';

export const dynamic = 'force-dynamic';

// How a report moves, in plain words, with the status each step corresponds to.
const ROUTE = [
    { status: ['SUBMITTED', 'AI_PROCESSED'], name: 'Reported', note: 'A citizen describes the problem; it is tagged with the SDGs it touches.' },
    { status: ['VALIDATED', 'UNIVERSITY_ASSIGNED'], name: 'Verified', note: 'The district officer checks it and opens it to universities.' },
    { status: ['TEAM_FORMED'], name: 'Plan chosen', note: 'Universities propose a team, milestones and a budget; the officer picks one.' },
    { status: ['FUNDED'], name: 'Funded', note: 'CSR partners commit money until the whole budget is covered.' },
    { status: ['IN_PROGRESS'], name: 'In the field', note: 'Students submit proof; each milestone is verified, then its tranche is paid.' },
    { status: ['COMPLETED'], name: 'Fixed', note: 'All milestones paid. The citizen confirms the fix, or disputes it.' },
    { status: ['DEPLOYED'], name: 'Resolved', note: 'The officer records how many people benefit; students earn credentials.' },
];

const ROLES = [
    { icon: UserRound, role: 'Citizen', does: 'Reports a problem, supports similar reports, confirms the fix.', email: 'citizen@demo.sdgnexus.in' },
    { icon: Landmark, role: 'District officer', does: 'Verifies reports, picks the best university plan, verifies every milestone.', email: 'officer.nalgonda@demo.sdgnexus.in' },
    { icon: GraduationCap, role: 'Faculty', does: 'Proposes a plan with a student team and milestones, issues credentials.', email: 'faculty@demo.sdgnexus.in' },
    { icon: Users, role: 'Student', does: 'Does the field work, uploads proof, earns verifiable credits.', email: 'student@demo.sdgnexus.in' },
    { icon: HandCoins, role: 'CSR partner', does: 'Funds selected plans and releases money only for verified milestones.', email: 'csr@demo.sdgnexus.in' },
    { icon: Sprout, role: 'NGO', does: 'Runs field projects and reports problems it finds on the ground.', email: 'ngo@demo.sdgnexus.in' },
    { icon: ShieldCheck, role: 'Admin', does: 'Verifies organisations and sees every district.', email: 'admin@demo.sdgnexus.in' },
];

const inr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} crore` : `₹${(n / 1e5).toFixed(1)} lakh`);

async function loadSheet() {
    try {
        const [byStatus, byDistrict, coords, released, credentials, ledger] = await Promise.all([
            prisma.challenge.groupBy({ by: ['status'], _count: { _all: true } }),
            prisma.challenge.groupBy({ by: ['district', 'state', 'status'], _count: { _all: true } }),
            prisma.district.findMany({ where: { lat: { not: null } }, select: { name: true, lat: true, lng: true, state: { select: { name: true } } } }),
            prisma.milestone.aggregate({ where: { status: 'CSR_APPROVED' }, _sum: { fundReleased: true } }),
            prisma.studentCredential.count(),
            prisma.auditLog.findMany({ where: { hash: { not: null } }, orderBy: { seq: 'desc' }, take: 5, select: { seq: true, action: true, actor_role: true, created_at: true, hash: true } }),
        ]);
        const count = (statuses: string[]) => byStatus.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s._count._all, 0);
        const points = new Map<string, { district: string; state: string; lat: number; lng: number; count: number; open: number }>();
        for (const row of byDistrict) {
            const c = coords.find((d) => d.name.toLowerCase() === row.district.toLowerCase() && (!row.state || d.state.name === row.state));
            if (!c) continue;
            const key = `${c.state.name}|${c.name}`;
            const p = points.get(key) ?? { district: c.name, state: c.state.name, lat: c.lat!, lng: c.lng!, count: 0, open: 0 };
            p.count += row._count._all;
            if (!['DEPLOYED', 'COMPLETED', 'REJECTED', 'MERGED'].includes(row.status)) p.open += row._count._all;
            points.set(key, p);
        }
        const pts = [...points.values()];
        return {
            points: pts,
            stages: ROUTE.map((r) => count(r.status)),
            reports: byStatus.filter((s) => !['REJECTED', 'MERGED'].includes(s.status)).reduce((n, s) => n + s._count._all, 0),
            districts: pts.length,
            states: new Set(pts.map((p) => p.state)).size,
            released: released._sum.fundReleased ?? 0,
            credentials,
            ledger,
        };
    } catch (err) {
        console.error('Landing data unavailable:', err);
        return null; // the page still renders, without numbers, rather than inventing them
    }
}

export default async function LandingPage() {
    const sheet = await loadSheet();
    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
            {/* Sheet header */}
            <header className="border-b border-[var(--color-rule)] bg-[var(--color-sheet)]">
                <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3" aria-label="Main">
                    <Link href="/" className="flex items-center gap-2.5 no-underline">
                        <Image src="/logo.png" alt="" width={30} height={30} className="rounded" />
                        <span className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">SDG Nexus</span>
                    </Link>
                    <div className="flex items-center gap-1 text-sm">
                        <Link href="/track" className="hidden sm:inline-flex items-center gap-1.5 rounded px-3 py-2 text-[var(--color-ink-soft)] hover:text-[var(--color-survey)]">
                            <Search className="h-4 w-4" aria-hidden="true" /> Track a report
                        </Link>
                        <Link href="/login" className="rounded px-3 py-2 font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-survey)]">Sign in</Link>
                        <Link href="/register" className="btn-neon px-3.5 py-2 text-sm no-underline">Join</Link>
                    </div>
                </nav>
            </header>

            <main>
                {/* First viewport: title block + the sheet */}
                <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-12 pt-10 lg:grid-cols-12 lg:gap-10 lg:pt-14">
                    <div className="flex flex-col justify-between lg:col-span-5">
                        <div>
                            <h1 className="font-[family-name:var(--font-display)] text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-6xl">
                                Local problems, verified solutions — district by district.
                            </h1>
                            <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-[var(--color-ink-soft)]">
                                Citizens report what is broken where they live. District officers verify it, universities plan the fix,
                                CSR partners fund it milestone by milestone, and every step is written to a public ledger.
                            </p>
                            <div className="mt-7 flex flex-wrap gap-3">
                                <Link href="/citizen/submit" className="btn-neon inline-flex items-center gap-2 px-5 py-3 text-base no-underline">
                                    Report a problem <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                                <Link href="/login" className="btn-outline inline-flex items-center gap-2 px-5 py-3 text-base no-underline">
                                    Try a demo role
                                </Link>
                            </div>
                        </div>

                        {/* Title block, like the box in a sheet's corner */}
                        <dl className="mt-10 grid grid-cols-2 border border-[var(--color-ink)] text-sm sm:grid-cols-4 lg:grid-cols-2">
                            {[
                                ['Reports', sheet?.reports],
                                ['Districts', sheet ? `${sheet.districts} in ${sheet.states} states` : undefined],
                                ['Released', sheet ? inr(sheet.released) : undefined],
                                ['Credentials', sheet?.credentials],
                            ].map(([k, v], i) => (
                                <div key={k as string} className={`px-3 py-2.5 ${i % 2 ? 'border-l' : ''} ${i > 1 ? 'border-t sm:border-t-0 lg:border-t' : ''} sm:[&:nth-child(n+2)]:border-l border-[var(--color-ink)]`}>
                                    <dt className="text-xs text-[var(--color-ink-muted)]">{k}</dt>
                                    <dd className="font-[family-name:var(--font-display)] text-xl font-semibold tabular">{v ?? '—'}</dd>
                                </div>
                            ))}
                        </dl>
                        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                            Compiled from the database on {today}. Demo data: every person and organisation is fictional.
                        </p>
                    </div>

                    <figure className="lg:col-span-7">
                        <div className="relative h-[420px] border border-[var(--color-ink)] bg-[var(--color-sheet)] p-2 sm:h-[560px]">
                            <div className="relative h-full w-full overflow-hidden border border-[var(--color-rule)]">
                                <MapSlot points={sheet?.points ?? []} />
                                {/* Legend box */}
                                <div className="absolute bottom-3 right-3 z-[600] border border-[var(--color-ink)] bg-[var(--color-sheet)] px-3 py-2 text-xs">
                                    <p className="font-semibold">Legend</p>
                                    <p className="mt-1 flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full border border-[var(--color-ink)] bg-[var(--color-ochre)]" />Open reports</p>
                                    <p className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full border border-[var(--color-ink)] bg-[var(--color-forest)]" />All resolved</p>
                                    <p className="mt-1 text-[var(--color-ink-muted)]">Size = reports in the district</p>
                                </div>
                            </div>
                        </div>
                        <figcaption className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Sheet: India · Problems reported to date · hover a mark for the district
                        </figcaption>
                    </figure>
                </section>

                {/* The route a report takes */}
                <section className="border-y border-[var(--color-rule)] bg-[var(--color-sheet)]" aria-labelledby="route">
                    <div className="mx-auto max-w-7xl px-5 py-14">
                        <h2 id="route" className="max-w-2xl font-[family-name:var(--font-display)] text-3xl font-semibold sm:text-4xl">The route every report takes</h2>
                        <p className="mt-3 max-w-2xl text-[var(--color-ink-soft)]">Seven stations, each owned by one role. The number at each is how many reports stand there today.</p>
                        <ol className="relative mt-10 grid gap-6 md:grid-cols-7 md:gap-3">
                            <span aria-hidden="true" className="absolute left-[11px] top-3 bottom-3 w-px border-l border-dashed border-[var(--color-survey)] md:left-3 md:right-3 md:top-[11px] md:bottom-auto md:h-px md:w-auto md:border-l-0 md:border-t" />
                            {ROUTE.map((r, i) => (
                                <li key={r.name} className="relative flex gap-4 md:block">
                                    <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${i === ROUTE.length - 1 ? 'border-[var(--color-forest)] bg-[var(--color-forest)]' : 'border-[var(--color-survey)] bg-[var(--color-sheet)]'}`} aria-hidden="true" />
                                    <div className="md:mt-4">
                                        <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tabular">{sheet ? sheet.stages[i] : '—'}</p>
                                        <h3 className="mt-0.5 text-base font-semibold">{r.name}</h3>
                                        <p className="mt-1 text-sm leading-snug text-[var(--color-ink-soft)]">{r.note}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                {/* Ledger extract + roles legend */}
                <section className="mx-auto grid max-w-7xl gap-12 px-5 py-14 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Nothing can be quietly changed</h2>
                        <p className="mt-3 text-[var(--color-ink-soft)]">
                            Each action is chained to the one before it by a SHA-256 hash. Edit any old entry and every later hash stops matching —
                            anyone can run the check.
                        </p>
                        <div className="mt-6 border border-[var(--color-ink)] bg-[var(--color-sheet)]">
                            <p className="border-b border-[var(--color-rule)] px-3 py-2 text-xs font-semibold">Latest ledger entries</p>
                            <ol className="divide-y divide-[var(--color-rule-soft)] text-sm">
                                {(sheet?.ledger ?? []).map((e) => (
                                    <li key={e.seq} className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-2 px-3 py-2">
                                        <span className="tabular text-xs text-[var(--color-ink-muted)]">#{e.seq}</span>
                                        <span>{e.action.replace(/^(CHALLENGE|MILESTONE|PROPOSAL)_/, '').replace(/_/g, ' ').toLowerCase()} <span className="text-[var(--color-ink-muted)]">· {e.actor_role.toLowerCase()}</span></span>
                                        <code className="text-xs text-[var(--color-survey)]">{e.hash?.slice(0, 10)}…</code>
                                    </li>
                                ))}
                                {!sheet?.ledger.length && <li className="px-3 py-3 text-[var(--color-ink-muted)]">The ledger is not available right now.</li>}
                            </ol>
                        </div>
                    </div>

                    <div className="lg:col-span-7">
                        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Who does what</h2>
                        <p className="mt-3 text-[var(--color-ink-soft)]">Every role is a real account in the demo. Sign in as any of them — the password is <code className="rounded bg-[var(--color-paper-deep)] px-1.5 py-0.5 text-[var(--color-ink)]">Demo@1234</code>.</p>
                        <table className="mt-6 w-full border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-[var(--color-ink)] text-left text-xs text-[var(--color-ink-muted)]">
                                    <th scope="col" className="py-2 pr-3 font-medium">Role</th>
                                    <th scope="col" className="py-2 pr-3 font-medium">What they do</th>
                                    <th scope="col" className="py-2 font-medium"><span className="sr-only">Sign in</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {ROLES.map(({ icon: Icon, role, does, email }) => (
                                    <tr key={role} className="border-b border-[var(--color-rule-soft)] align-top">
                                        <th scope="row" className="whitespace-nowrap py-3 pr-3 text-left font-semibold">
                                            <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4 text-[var(--color-survey)]" aria-hidden="true" />{role}</span>
                                        </th>
                                        <td className="py-3 pr-3 text-[var(--color-ink-soft)]">{does}</td>
                                        <td className="py-3 text-right">
                                            <Link href={`/login?email=${encodeURIComponent(email)}`} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[var(--color-survey)]">
                                                Sign in <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            <footer className="border-t border-[var(--color-ink)] bg-[var(--color-sheet)]">
                <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 text-xs text-[var(--color-ink-muted)] sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2"><Building2 className="h-4 w-4" aria-hidden="true" />SDG Nexus · B.Tech minor project, Dev Bhoomi Uttarakhand University, 2026</p>
                    <p>Region list: 36 states and UTs, 784 districts. Demo data is fictional.</p>
                </div>
            </footer>
        </div>
    );
}

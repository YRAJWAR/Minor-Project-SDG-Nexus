import type { SessionUser } from '@/server/middleware/auth';

/** The user object sent to the browser: no password hash, no internal-only fields. */
export function publicUser(u: SessionUser) {
    return {
        id: u.id,
        name: u.full_name,
        email: u.email,
        role: u.role,
        universityId: u.hei?.id ?? null,
        universityName: u.hei?.name ?? null,
        organizationId: u.organization?.id ?? null,
        organizationName: u.organization?.name ?? u.hei?.name ?? null,
        organizationStatus: u.organization?.verification_status ?? null,
        district: u.district?.name ?? null,
        state: u.district?.state.name ?? null,
        createdAt: u.created_at.toISOString(),
    };
}

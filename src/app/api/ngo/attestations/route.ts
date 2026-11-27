import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/server/middleware/auth';
import { appendLedger } from '@/server/ledger';

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

// Projects where the signed-in NGO is the field partner: milestones to confirm on the ground, students to rate.
export async function GET(req: NextRequest) {
    const user = await requireUser(req, ['NGO']);
    if (user instanceof NextResponse) return user;
    if (!user.organizationId) return fail('Your account is not linked to an NGO.', 403);
    try {
        const invitations = await prisma.challengeProposal.findMany({
            where: { ngoPartnerId: user.organizationId, ngoStatus: 'INVITED', status: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED'] } },
            select: { id: true, approach: true, budgetRequested: true, timelineWeeks: true, hei: { select: { name: true } }, challenge: { select: { id: true, title: true, district: true, state: true } } },
            orderBy: { createdAt: 'desc' },
        });
        const teams = await prisma.projectTeam.findMany({
            where: { proposal: { status: 'ACCEPTED', ngoPartnerId: user.organizationId, ngoStatus: 'ACCEPTED' } },
            include: {
                hei: { select: { name: true } },
                proposal: { select: { challenge: { select: { id: true, title: true, district: true, state: true, status: true } } } },
                milestones: { orderBy: { dueDate: 'asc' }, select: { id: true, title: true, status: true, createdAt: true, ngoAttestedAt: true, ngoAttestation: true, hours: { select: { hours: true } } } },
                members: { select: { id: true, role: true, ngoRating: true, student: { select: { user: { select: { full_name: true } } } } } },
            },
        });
        return NextResponse.json({
            success: true,
            invitations: invitations.map((i) => ({ proposalId: i.id, university: i.hei.name, challenge: i.challenge, approach: i.approach, budget: i.budgetRequested, weeks: i.timelineWeeks })),
            data: teams.map((t) => ({
                teamId: t.id, university: t.hei.name, challenge: t.proposal.challenge,
                milestones: t.milestones.map((m) => ({ id: m.id, title: m.title, status: m.status, submittedAt: m.status === 'PENDING' ? null : m.createdAt, attestedAt: m.ngoAttestedAt, attestation: m.ngoAttestation, hours: m.hours.reduce((s, h) => s + h.hours, 0) })),
                members: t.members.map((m) => ({ id: m.id, name: m.student.user.full_name, role: m.role, ngoRating: m.ngoRating })),
            })),
        });
    } catch (err) {
        console.error('NGO attestations failed:', err);
        return fail('Field partner work is temporarily unavailable.', 503);
    }
}

// { action: 'RESPOND', proposalId, accept } — accept or decline being named field partner.
// { action: 'ATTEST', milestoneId, note } — confirm submitted work on the ground (once per milestone).
// { action: 'RATE', memberId, rating }     — rate a student 1–5 (counts 40% of their credential rating).
export async function POST(req: NextRequest) {
    const user = await requireUser(req, ['NGO']);
    if (user instanceof NextResponse) return user;
    if (!user.organizationId) return fail('Your account is not linked to an NGO.', 403);
    const body = await req.json().catch(() => ({}));
    try {
        if (body.action === 'RESPOND') {
            const p = await prisma.challengeProposal.findUnique({ where: { id: String(body.proposalId) }, select: { id: true, heiId: true, ngoPartnerId: true, ngoStatus: true, challengeId: true, challenge: { select: { title: true } } } });
            if (!p || p.ngoPartnerId !== user.organizationId) return fail('Invitation not found.', 404);
            if (p.ngoStatus !== 'INVITED') return fail('You have already answered this invitation.', 409);
            const answer = body.accept === true ? 'ACCEPTED' : 'DECLINED';
            await prisma.$transaction(async (tx) => {
                await tx.challengeProposal.update({ where: { id: p.id }, data: { ngoStatus: answer } });
                await appendLedger({ actor_id: user.id, actor_role: user.role, action: `PROPOSAL_NGO_${answer}`, entity_type: 'Proposal', entity_id: p.id, new_value: { challengeId: p.challengeId } }, tx);
                const faculty = await tx.user.findMany({ where: { heiId: p.heiId, role: 'FACULTY' }, select: { id: true } });
                await tx.notification.createMany({ data: faculty.map((f) => ({ userId: f.id, message: `${user.organization?.name ?? 'The NGO'} ${answer === 'ACCEPTED' ? 'accepted' : 'declined'} your invitation to be field partner on “${p.challenge.title}”.`, entityType: 'PROPOSAL', entityId: p.id, challengeId: p.challengeId, priority: 'P2' })) });
            });
            return NextResponse.json({ success: true });
        }
        if (body.action === 'ATTEST') {
            const note = typeof body.note === 'string' ? body.note.trim() : '';
            if (note.length < 10 || note.length > 1000) return fail('Describe what you saw on the ground (10–1000 characters).', 400);
            const m = await prisma.milestone.findUnique({ where: { id: String(body.milestoneId) }, select: { id: true, status: true, ngoAttestedAt: true, team: { select: { proposal: { select: { ngoPartnerId: true, ngoStatus: true, challengeId: true } } } } } });
            if (!m) return fail('Milestone not found.', 404);
            if (m.team.proposal.ngoPartnerId !== user.organizationId || m.team.proposal.ngoStatus !== 'ACCEPTED') return fail('Only the NGO field partner of this project can confirm its milestones.', 403);
            if (m.status === 'PENDING' || m.status === 'REJECTED') return fail('There is no submitted work to confirm on this milestone yet.', 409);
            if (m.ngoAttestedAt) return fail('This milestone is already confirmed.', 409);
            await prisma.$transaction(async (tx) => {
                const { count } = await tx.milestone.updateMany({ where: { id: m.id, ngoAttestedAt: null }, data: { ngoAttestedAt: new Date(), ngoAttestation: note } });
                if (count !== 1) throw new Error('CHANGED');
                await appendLedger({ actor_id: user.id, actor_role: user.role, action: 'MILESTONE_NGO_ATTESTED', entity_type: 'Milestone', entity_id: m.id, new_value: { note, challengeId: m.team.proposal.challengeId } }, tx);
            });
            return NextResponse.json({ success: true });
        }
        if (body.action === 'RATE') {
            const rating = Number(body.rating);
            if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail('Rating must be a whole number from 1 to 5.', 400);
            const member = await prisma.teamMember.findUnique({ where: { id: String(body.memberId) }, select: { id: true, team: { select: { proposal: { select: { ngoPartnerId: true, ngoStatus: true } } } } } });
            if (!member) return fail('Team member not found.', 404);
            if (member.team.proposal.ngoPartnerId !== user.organizationId || member.team.proposal.ngoStatus !== 'ACCEPTED') return fail('Only the NGO field partner of this project can rate its students.', 403);
            await prisma.teamMember.update({ where: { id: member.id }, data: { ngoRating: rating } });
            return NextResponse.json({ success: true });
        }
        return fail('Unknown action.', 400);
    } catch (err) {
        console.error('NGO attestation action failed:', err);
        return fail('Could not save right now. Nothing was changed — please try again.', 503);
    }
}

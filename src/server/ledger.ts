// Tamper-evident ledger on top of the audit_logs table.
// Each entry stores the previous entry's hash and its own hash over (prev_hash + its fields), so changing
// or deleting any old entry breaks every hash after it. verifyLedger() recomputes the chain.
import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export interface LedgerEntry {
    actor_id: string;
    actor_role: string;
    action: string;
    entity_type: string;
    entity_id: string;
    previous_value?: unknown;
    new_value?: unknown;
    ip_address?: string | null;
    at?: Date; // only for seeding history
}

const asText = (v: unknown) => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v));

export function entryHash(e: { prev_hash: string | null; actor_id: string; actor_role: string; action: string; entity_type: string; entity_id: string; previous_value: string | null; new_value: string | null; created_at: Date }) {
    return createHash('sha256')
        .update(JSON.stringify([e.prev_hash, e.actor_id, e.actor_role, e.action, e.entity_type, e.entity_id, e.previous_value, e.new_value, e.created_at.toISOString()]))
        .digest('hex');
}

/** Appends one entry. Pass the transaction client to make it part of the same all-or-nothing write. */
export async function appendLedger(entry: LedgerEntry, db: Db = prisma) {
    const write = async (tx: Prisma.TransactionClient) => {
        // One writer at a time, so two simultaneous appends can't both claim the same previous entry.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7240001)`;
        const last = await tx.auditLog.findFirst({ where: { hash: { not: null } }, orderBy: { seq: 'desc' }, select: { hash: true } });
        const row = {
            actor_id: entry.actor_id, actor_role: entry.actor_role, action: entry.action, entity_type: entry.entity_type, entity_id: entry.entity_id,
            previous_value: asText(entry.previous_value), new_value: asText(entry.new_value), prev_hash: last?.hash ?? null, created_at: entry.at ?? new Date(),
        };
        return tx.auditLog.create({ data: { ...row, ip_address: entry.ip_address ?? null, hash: entryHash(row) } });
    };
    return '$transaction' in db ? (db as PrismaClient).$transaction(write) : write(db as Prisma.TransactionClient);
}

/** Recomputes the whole chain. Returns the first entry that does not match, if any. */
export async function verifyLedger(db: Db = prisma) {
    const rows = await db.auditLog.findMany({ where: { hash: { not: null } }, orderBy: { seq: 'asc' } });
    let prev: string | null = null;
    for (const r of rows) {
        if (r.prev_hash !== prev || entryHash(r) !== r.hash) {
            return { valid: false as const, checked: rows.length, firstBroken: { id: r.id, action: r.action, entity_id: r.entity_id, created_at: r.created_at } };
        }
        prev = r.hash;
    }
    return { valid: true as const, checked: rows.length, firstBroken: null };
}

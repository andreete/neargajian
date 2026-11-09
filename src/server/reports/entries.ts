/**
 * Company posting entries, derived only from fully paid versions (vault status Paid and
 * every row confirmed). Consolidated → one entry; detailed → one entry per paid recipient
 * line. References are opaque (derived from the version ID, never from recipient data).
 * Idempotent: running it again changes nothing.
 */
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { payoutActions, reportEntries, runVersions, versionRows } from '../db/schema.ts';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function referenceBase(versionId: string): string {
  const digest = createHash('sha256').update(`gajian-report:${versionId}`).digest();
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[(digest[i] ?? 0) % ALPHABET.length];
  return `GJN-${out}`;
}

export function createReportEntries(db: Db, versionId: string, now = new Date()): number {
  return db.transaction((tx) => {
    const v = tx.select().from(runVersions).where(eq(runVersions.id, versionId)).get();
    if (!v || v.status !== 'paid') return 0;
    if (tx.select({ id: reportEntries.id }).from(reportEntries).where(eq(reportEntries.versionId, versionId)).get()) return 0;
    const rows = tx.select().from(versionRows).where(eq(versionRows.versionId, versionId)).orderBy(versionRows.rowIndex).all();
    const paid = new Set(tx.select({ rowIndex: payoutActions.rowIndex }).from(payoutActions)
      .where(and(eq(payoutActions.versionId, versionId), eq(payoutActions.kind, 'pay_row'), eq(payoutActions.status, 'succeeded'))).all().map((a) => a.rowIndex));
    if (rows.some((r) => !paid.has(r.rowIndex))) return 0; // never report a run that is not fully confirmed
    const total = rows.reduce((s, r) => s + r.amount, 0n);
    if (total !== v.total) throw new Error('Paid rows do not add up to the approved total.');
    const base = referenceBase(versionId);
    if (v.postingMode === 'consolidated') {
      tx.insert(reportEntries).values({ id: `${versionId}:c`, versionId, postingMode: 'consolidated', reference: base, rowIndex: null, amount: total, currency: 'tUSDC', createdAt: now }).run();
      return 1;
    }
    rows.forEach((r, i) => {
      tx.insert(reportEntries).values({ id: `${versionId}:${r.rowIndex}`, versionId, postingMode: 'detailed', reference: `${base}-${String(i + 1).padStart(4, '0')}`, rowIndex: r.rowIndex, amount: r.amount, currency: 'tUSDC', createdAt: now }).run();
    });
    return rows.length;
  }, { behavior: 'immediate' });
}

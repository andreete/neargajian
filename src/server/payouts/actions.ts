/**
 * Payout-action claims: the durable record the release worker (and maker release) writes
 * BEFORE sending a chain transaction. A partial unique index allows at most one live
 * (non-failed) action per version/kind/row, so two workers, a restart or a double click can
 * never start the same payout twice. A new attempt is possible only after a proven failure.
 */
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { payoutActions, runVersions, type PayoutActionStatus } from '../db/schema.ts';

export type ActionKind = 'release' | 'pay_row';
export type PayoutAction = typeof payoutActions.$inferSelect;

export function actionId(chainRunId: string, kind: ActionKind, rowIndex: number | null, attempt: number): string {
  return `${chainRunId}:${kind}:${rowIndex ?? '-'}:${attempt}`;
}

const sameTarget = (versionId: string, kind: ActionKind, rowIndex: number | null) =>
  and(eq(payoutActions.versionId, versionId), eq(payoutActions.kind, kind),
    rowIndex === null ? isNull(payoutActions.rowIndex) : eq(payoutActions.rowIndex, rowIndex));

export type ClaimResult = { claimed: true; action: PayoutAction } | { claimed: false; existing: PayoutAction };

export function claimPayoutAction(db: Db, input: {
  versionId: string; kind: ActionKind; rowIndex: number | null; workerId: string; now: Date; leaseMs: number;
}): ClaimResult {
  if ((input.kind === 'release') !== (input.rowIndex === null)) throw new RangeError('release has no row; pay_row needs one');
  return db.transaction((tx) => {
    const version = tx.select({ chainRunId: runVersions.chainRunId }).from(runVersions).where(eq(runVersions.id, input.versionId)).get();
    if (!version) throw new RangeError('version not found');
    const latest = tx.select().from(payoutActions).where(sameTarget(input.versionId, input.kind, input.rowIndex))
      .orderBy(desc(payoutActions.attempt)).get();
    if (latest && latest.status !== 'failed') return { claimed: false as const, existing: latest };
    const attempt = (latest?.attempt ?? 0) + 1;
    const action: PayoutAction = {
      id: actionId(version.chainRunId, input.kind, input.rowIndex, attempt),
      versionId: input.versionId, kind: input.kind, rowIndex: input.rowIndex, attempt, status: 'claimed',
      workerId: input.workerId, leaseExpiresAt: new Date(input.now.getTime() + input.leaseMs),
      txHash: null, error: null, createdAt: input.now, updatedAt: input.now, chainBlockTime: null,
    };
    tx.insert(payoutActions).values(action).run();
    return { claimed: true as const, action };
  }, { behavior: 'immediate' });
}

/** Records progress of a claimed action. `succeeded` is final (trigger-enforced). */
export function updatePayoutAction(db: Db, id: string, update: {
  status: PayoutActionStatus; now: Date; txHash?: string; error?: string;
}): void {
  db.update(payoutActions).set({
    status: update.status, updatedAt: update.now,
    ...(update.txHash !== undefined ? { txHash: update.txHash } : {}),
    ...(update.error !== undefined ? { error: update.error } : {}),
  }).where(and(eq(payoutActions.id, id), ne(payoutActions.status, 'succeeded'))).run();
  // A succeeded record is final, including its time (the paid-at time in history and exports):
  // the first confirmation wins. A late answer from the worker after reconciliation already
  // confirmed the payout from the vault (or a late "unknown") leaves it untouched.
}

/**
 * Records the timestamp of the block that includes a succeeded action's transaction (the
 * paid time of a payout). Set once; a later call never changes it (also enforced by a trigger).
 */
export function setChainBlockTime(db: Db, id: string, at: Date): boolean {
  const r = db.update(payoutActions).set({ chainBlockTime: at })
    .where(and(eq(payoutActions.id, id), eq(payoutActions.status, 'succeeded'), isNull(payoutActions.chainBlockTime))).run();
  return r.changes === 1;
}

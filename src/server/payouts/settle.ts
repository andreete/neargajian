/**
 * Settles open payout actions (claimed / submitted / unknown) from what the vault reports
 * (`get_run`, `get_row`) and the transaction status. Shared by the release worker and by
 * run reconciliation, so a version can only become Paid after every row's payout record is
 * confirmed (PRD A06). Unknown outcomes stay unknown until the chain proves them.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { ChainRole, VaultClient } from '../chain/vault-client.ts';
import type { Db } from '../db/client.ts';
import { payoutActions, versionRows, type runVersions } from '../db/schema.ts';
import { updatePayoutAction } from './actions.ts';

interface ChainRow { status: 'InFlight' | 'Paid' | 'Failed'; receiver_id: string; amount: string; attempts: number }
type Version = typeof runVersions.$inferSelect;

export async function settleActions(db: Db, client: VaultClient, v: Version, now = new Date()) {
  const open = db.select().from(payoutActions)
    .where(and(eq(payoutActions.versionId, v.id), inArray(payoutActions.status, ['claimed', 'submitted', 'unknown']))).all();
  for (const a of open) {
    if (!a.txHash) {
      // Claimed but never signed: if the lease expired, nothing was sent.
      if (a.leaseExpiresAt.getTime() < now.getTime()) updatePayoutAction(db, a.id, { status: 'failed', now, error: 'Not sent (worker stopped before signing).' });
      continue;
    }
    if (a.kind === 'release') {
      const run = await client.view<{ status: string } | null>('get_run', { run_id: v.chainRunId });
      if (run && ['Releasing', 'Paid', 'PartiallyPaid'].includes(run.status)) { updatePayoutAction(db, a.id, { status: 'succeeded', now }); continue; }
      const releaseMode = (JSON.parse(v.workflowSnapshot) as { releaseMode: string }).releaseMode;
      const out = await client.txOutcome(a.txHash, (releaseMode === 'maker' ? 'maker' : 'worker') as ChainRole);
      if (out.status === 'failure') updatePayoutAction(db, a.id, { status: 'failed', now, error: out.error ?? 'Refused by the vault.' });
      continue;
    }
    const row = await client.view<ChainRow | null>('get_row', { run_id: v.chainRunId, index: a.rowIndex });
    if (row?.status === 'Paid' && row.attempts >= a.attempt) { updatePayoutAction(db, a.id, { status: 'succeeded', now }); continue; }
    if (row?.status === 'Failed' && row.attempts >= a.attempt) { updatePayoutAction(db, a.id, { status: 'failed', now, error: 'The token transfer failed (proven on-chain).' }); continue; }
    if (row?.status === 'InFlight') continue; // the callback has not run yet
    const out = await client.txOutcome(a.txHash, 'worker');
    if (out.status === 'failure') updatePayoutAction(db, a.id, { status: 'failed', now, error: out.error ?? 'Refused by the vault.' });
  }
}

/** Rows with a confirmed payout (succeeded `pay_row`), their count and their exact sum. */
export function confirmedPayouts(db: Db, versionId: string): { count: number; total: bigint } {
  const done = new Set(db.select({ rowIndex: payoutActions.rowIndex }).from(payoutActions)
    .where(and(eq(payoutActions.versionId, versionId), eq(payoutActions.kind, 'pay_row'), eq(payoutActions.status, 'succeeded'))).all()
    .map((d) => d.rowIndex));
  const rows = db.select({ rowIndex: versionRows.rowIndex, amount: versionRows.amount }).from(versionRows).where(eq(versionRows.versionId, versionId)).all()
    .filter((r) => done.has(r.rowIndex));
  return { count: rows.length, total: rows.reduce((s, r) => s + r.amount, 0n) };
}

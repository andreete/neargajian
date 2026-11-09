/**
 * Release and payouts (Phase 12). Used by the release worker process and by maker release.
 *
 * Safety rules (PRD §5.4, docs/RECOVERY.md):
 * - Every chain action is claimed in `payout_actions` (unique live claim per row) and its tx
 *   hash stored BEFORE sending. A restart resumes from these records.
 * - Before retrying anything, the outcome is read from the vault (`get_row`, `get_run`) and
 *   the tx status. Unknown outcomes stay unknown until the chain proves them.
 * - Only proven failures are retried (bounded attempts, backoff); the vault itself refuses a
 *   second payment of a row that is in flight or paid.
 * - A version becomes Paid only when the vault reports the run as Paid.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { buildPayoutTree, proofFor, toHex } from '../commitments.ts';
import { NO_SIGNER_MESSAGE, type VaultClient } from '../chain/vault-client.ts';
import { DomainError } from '../runs/repository.ts';
import type { Db } from '../db/client.ts';
import { auditEvents, payoutActions, runVersions, versionRows } from '../db/schema.ts';
import { claimPayoutAction, updatePayoutAction, type PayoutAction } from './actions.ts';
import { fillBlockTimes, settleActions } from './settle.ts';
import { assertSameVault, reconcileVersion, snapshotOf, type Version } from '../runs/lifecycle.ts';
import { createReportEntries } from '../reports/entries.ts';

export const MAX_ROW_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = 30_000;
export const RELEASE_RETRY_MS = 60_000;
export const LEASE_MS = 120_000;

function log(db: Db, action: string, versionId: string, detail: Record<string, unknown>, now: Date) {
  db.insert(auditEvents).values({ at: now, action, entityType: 'run_version', entityId: versionId, detail: JSON.stringify(detail) }).run();
}

function actionsOf(db: Db, versionId: string, kind: 'release' | 'pay_row') {
  return db.select().from(payoutActions).where(and(eq(payoutActions.versionId, versionId), eq(payoutActions.kind, kind))).all();
}

function latestPerRow(actions: PayoutAction[]): Map<number, PayoutAction> {
  const m = new Map<number, PayoutAction>();
  for (const a of actions) if (a.rowIndex !== null && (!m.has(a.rowIndex) || a.attempt > m.get(a.rowIndex)!.attempt)) m.set(a.rowIndex, a);
  return m;
}

// ---------------------------------------------------------------------- release

/** Reserves the run total in the vault (start_release). Worker in automatic mode, maker in maker mode. */
export async function requestRelease(db: Db, client: VaultClient, v: Version, opts: { role: 'worker' | 'maker'; workerId: string; now?: Date }) {
  const now = opts.now ?? new Date();
  if (v.status !== 'approved') return { status: v.status };
  assertSameVault(v, client);
  if (!client.canSign(opts.role)) throw new DomainError('conflict', NO_SIGNER_MESSAGE);
  const claim = claimPayoutAction(db, { versionId: v.id, kind: 'release', rowIndex: null, workerId: opts.workerId, now, leaseMs: LEASE_MS });
  if (!claim.claimed) {
    await reconcileActions(db, client, v, now);
    return { status: db.select().from(runVersions).where(eq(runVersions.id, v.id)).get()!.status, action: claim.existing };
  }
  const outcome = await client.call(opts.role, 'start_release', { run_id: v.chainRunId }, {
    gasTgas: 30, onSigned: (h) => updatePayoutAction(db, claim.action.id, { status: 'submitted', now, txHash: h }),
  });
  if (outcome.status === 'success') updatePayoutAction(db, claim.action.id, { status: 'succeeded', now });
  else if (outcome.status === 'failure') updatePayoutAction(db, claim.action.id, { status: 'failed', now, error: outcome.error ?? 'Refused by the vault.' });
  else updatePayoutAction(db, claim.action.id, { status: 'unknown', now });
  log(db, `release.${outcome.status}`, v.id, { by: opts.role, txHash: outcome.txHash, error: outcome.error ?? null }, now);
  const r = await reconcileVersion(db, client, v.id, now);
  return { status: r.status, outcome };
}

// ------------------------------------------------------------------- reconcile

/** Settles claimed / submitted / unknown actions from the vault before anything is retried. */
export const reconcileActions = settleActions;

// ---------------------------------------------------------------------- payouts

function proofsFor(db: Db, v: Version) {
  const rows = db.select().from(versionRows).where(eq(versionRows.versionId, v.id)).orderBy(versionRows.rowIndex).all();
  const tree = buildPayoutTree(rows.map((r) => ({ index: r.rowIndex, accountId: r.nearAccountId, amount: r.amount })));
  if (toHex(tree.root) !== v.payoutRoot) throw new Error('Stored rows do not match the approved payout root.');
  return { rows, tree };
}

/** Pays up to `max` eligible rows, one transaction per row, in row order. */
export async function payRows(db: Db, client: VaultClient, v: Version, opts: { role: 'worker' | 'maker'; workerId: string; max: number; now?: Date }) {
  const now = opts.now ?? new Date();
  if (v.status !== 'releasing') return { paid: 0 };
  assertSameVault(v, client);
  if (!client.canSign(opts.role)) throw new DomainError('conflict', NO_SIGNER_MESSAGE);
  await reconcileActions(db, client, v, now);
  const { rows, tree } = proofsFor(db, v);
  const latest = latestPerRow(actionsOf(db, v.id, 'pay_row'));
  let sent = 0;
  let paid = 0;
  for (const r of rows) {
    if (sent >= opts.max) break;
    const prev = latest.get(r.rowIndex);
    if (prev && prev.status !== 'failed') continue; // paid, in progress or unknown: never resend
    if (prev && (prev.attempt >= MAX_ROW_ATTEMPTS || now.getTime() - prev.updatedAt.getTime() < RETRY_BACKOFF_MS)) continue;
    const claim = claimPayoutAction(db, { versionId: v.id, kind: 'pay_row', rowIndex: r.rowIndex, workerId: opts.workerId, now, leaseMs: LEASE_MS });
    if (!claim.claimed) continue;
    sent += 1;
    const outcome = await client.call(opts.role, 'pay_row', {
      run_id: v.chainRunId, index: r.rowIndex, receiver_id: r.nearAccountId, amount: r.amount.toString(),
      proof: proofFor(tree, r.rowIndex).map(toHex),
    }, { gasTgas: 50, onSigned: (h) => updatePayoutAction(db, claim.action.id, { status: 'submitted', now, txHash: h }) });
    if (outcome.status === 'success' && outcome.value === true) { updatePayoutAction(db, claim.action.id, { status: 'succeeded', now }); paid += 1; }
    else if (outcome.status === 'success') updatePayoutAction(db, claim.action.id, { status: 'failed', now, error: 'The token transfer failed (for example, the recipient is not registered with tUSDC).' });
    else if (outcome.status === 'failure') {
      updatePayoutAction(db, claim.action.id, { status: /already paid|already in flight/i.test(outcome.error ?? '') ? 'unknown' : 'failed', now, error: outcome.error ?? 'Refused by the vault.' });
    } else updatePayoutAction(db, claim.action.id, { status: 'unknown', now });
    log(db, `payout.${outcome.status}`, v.id, { index: r.rowIndex, attempt: claim.action.attempt, txHash: outcome.txHash, value: outcome.value ?? null }, now);
  }
  await reconcileActions(db, client, v, now);
  const r = await reconcileVersion(db, client, v.id, now);
  return { paid, status: r.status };
}

// ------------------------------------------------------------------------- tick

/** One worker pass: reconcile live versions, release automatic ones, pay releasing ones. */
export async function workerTick(db: Db, client: VaultClient, opts: { workerId: string; maxRowsPerTick?: number; now?: Date }) {
  const now = opts.now ?? new Date();
  const live = db.select().from(runVersions)
    .where(and(inArray(runVersions.status, ['submitting', 'pending_approval', 'approved', 'releasing']), eq(runVersions.vaultContractId, client.vaultId))).all();
  const summary = { reconciled: 0, released: 0, paidRows: 0, blockTimes: 0 };
  for (const v0 of live) {
    const r = await reconcileVersion(db, client, v0.id, now);
    summary.reconciled += 1;
    let v = db.select().from(runVersions).where(eq(runVersions.id, v0.id)).get()!;
    const mode = snapshotOf(v).releaseMode;
    if (r.status === 'approved' && mode === 'automatic') {
      const last = actionsOf(db, v.id, 'release').sort((a, b) => b.attempt - a.attempt)[0];
      const due = !last || (last.status === 'failed' && now.getTime() - last.updatedAt.getTime() >= RELEASE_RETRY_MS);
      if (due || (last && last.status !== 'failed' && last.status !== 'succeeded')) {
        const res = await requestRelease(db, client, v, { role: 'worker', workerId: opts.workerId, now });
        if (res.status === 'releasing') summary.released += 1;
      }
      v = db.select().from(runVersions).where(eq(runVersions.id, v0.id)).get()!;
    }
    if (v.status === 'releasing') {
      const res = await payRows(db, client, v, { role: 'worker', workerId: opts.workerId, max: opts.maxRowsPerTick ?? 5, now });
      summary.paidRows += res.paid;
    } else if (v.status === 'paid') {
      createReportEntries(db, v.id, now);
    }
  }
  // Confirmed actions whose block time could not be read yet (RPC hiccup), including paid runs.
  const pending = db.selectDistinct({ versionId: payoutActions.versionId }).from(payoutActions).innerJoin(runVersions, eq(runVersions.id, payoutActions.versionId))
    .where(and(eq(payoutActions.status, 'succeeded'), isNull(payoutActions.chainBlockTime), eq(runVersions.vaultContractId, client.vaultId))).limit(20).all();
  for (const p of pending) {
    const v = db.select().from(runVersions).where(eq(runVersions.id, p.versionId)).get()!;
    summary.blockTimes += await fillBlockTimes(db, client, v);
  }
  return summary;
}

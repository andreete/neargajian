/**
 * Admin workflow changes, integrated with the vault contract. The app never shows a
 * workflow as active until the vault confirms it:
 *   1. validate (distinct, enabled approver accounts; count matches the template)
 *   2. insert revision N+1 as `pending` (N = the vault's current revision)
 *   3. sign `update_workflow` with the admin's restricted key; store the tx hash before sending
 *   4. success → re-read the vault, check it matches, then activate (previous → superseded)
 *      failure → `failed`, previous stays active; unknown → stays `pending` until reconciled
 * Submitted runs keep the snapshot they were created with (createVersion copies it).
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { NO_SIGNER_MESSAGE, type ChainWorkflow, type TxOutcome, type VaultClient } from '../chain/vault-client.ts';
import type { Db } from '../db/client.ts';
import { activeWorkflowWhere } from './vault.ts';
import { auditEvents, users, workflowConfigs, type ReleaseMode, type WorkflowKind } from '../db/schema.ts';
import type { WorkflowSnapshot } from '../runs/repository.ts';

export const KIND_TO_CHAIN: Record<WorkflowKind, ChainWorkflow['kind']> = { one: 'One', two_sequential: 'TwoSequential', two_parallel: 'TwoParallel' };
export const RELEASE_TO_CHAIN: Record<ReleaseMode, ChainWorkflow['release_mode']> = { automatic: 'Automatic', maker: 'Maker' };
const APPROVER_COUNT: Record<WorkflowKind, number> = { one: 1, two_sequential: 2, two_parallel: 2 };

export interface WorkflowInput {
  kind: WorkflowKind;
  approverUserIds: string[];
  releaseMode: ReleaseMode;
  /** The active revision the admin was looking at (optimistic concurrency). */
  expectedRevision: number;
}

export interface FieldError { field: 'kind' | 'approver1' | 'approver2' | 'releaseMode' | 'form'; message: string }

export type UpdateResult =
  | { status: 'invalid'; errors: FieldError[] }
  | { status: 'conflict'; message: string }
  | { status: 'active' | 'pending' | 'failed'; revision: number; txHash?: string; error?: string };

export function approverOptions(db: Db) {
  return db.select({ id: users.id, displayName: users.displayName, email: users.email, chainAccountId: users.chainAccountId })
    .from(users).where(eq(users.role, 'approver')).all();
}

export function validateWorkflowInput(db: Db, input: Partial<WorkflowInput>): { errors: FieldError[]; approvers: { id: string; chainAccountId: string }[] } {
  const errors: FieldError[] = [];
  const kind = input.kind;
  if (!kind || !(kind in APPROVER_COUNT)) errors.push({ field: 'kind', message: 'Choose an approval template.' });
  if (input.releaseMode !== 'automatic' && input.releaseMode !== 'maker') errors.push({ field: 'releaseMode', message: 'Choose how payments are released.' });
  const ids = Array.isArray(input.approverUserIds) ? input.approverUserIds.filter((x): x is string => typeof x === 'string') : [];
  const need = kind && kind in APPROVER_COUNT ? APPROVER_COUNT[kind] : 0;
  if (need >= 1 && !ids[0]) errors.push({ field: 'approver1', message: 'Choose Approver 1.' });
  if (need === 2 && !ids[1]) errors.push({ field: 'approver2', message: 'Choose Approver 2.' });
  if (need === 2 && ids[0] && ids[1] && ids[0] === ids[1]) errors.push({ field: 'approver2', message: 'Choose two different reviewers.' });
  const wanted = ids.slice(0, need);
  const found = wanted.length ? db.select().from(users).where(inArray(users.id, wanted)).all() : [];
  const approvers: { id: string; chainAccountId: string }[] = [];
  wanted.forEach((id, i) => {
    const u = found.find((f) => f.id === id);
    const field = i === 0 ? 'approver1' : 'approver2';
    if (!u || u.role !== 'approver' || u.disabledAt) errors.push({ field, message: 'This person cannot review runs.' });
    else if (!u.chainAccountId) errors.push({ field, message: 'This reviewer has no testnet signer account.' });
    else approvers.push({ id: u.id, chainAccountId: u.chainAccountId });
  });
  return { errors, approvers };
}

function audit(db: Db, actor: string, action: string, detail: Record<string, unknown>, now: Date) {
  db.insert(auditEvents).values({ at: now, actorUserId: actor, action, entityType: 'workflow', entityId: String(detail.revision ?? ''), detail: JSON.stringify(detail) }).run();
}

function matches(chain: ChainWorkflow, row: typeof workflowConfigs.$inferSelect, accounts: string[]): boolean {
  return chain.revision === row.revision && chain.kind === KIND_TO_CHAIN[row.kind] && chain.release_mode === RELEASE_TO_CHAIN[row.releaseMode]
    && chain.approvers.length === accounts.length && chain.approvers.every((a, i) => a === accounts[i]);
}

function accountsOf(db: Db, row: typeof workflowConfigs.$inferSelect): string[] {
  const ids = [row.approver1UserId, row.approver2UserId].filter((x): x is string => Boolean(x));
  const people = db.select().from(users).where(inArray(users.id, ids)).all();
  return ids.map((id) => people.find((p) => p.id === id)?.chainAccountId ?? '');
}

function activate(db: Db, row: typeof workflowConfigs.$inferSelect, txHash: string | null, now: Date) {
  db.transaction((tx) => {
    tx.update(workflowConfigs).set({ chainStatus: 'superseded' }).where(eq(workflowConfigs.chainStatus, 'active')).run();
    tx.update(workflowConfigs).set({ chainStatus: 'active', activatedAt: now, ...(txHash ? { chainTxHash: txHash } : {}) })
      .where(eq(workflowConfigs.id, row.id)).run();
  }, { behavior: 'immediate' });
}

async function settle(db: Db, client: VaultClient, row: typeof workflowConfigs.$inferSelect, outcome: TxOutcome, actor: string, now: Date): Promise<UpdateResult> {
  if (outcome.status === 'success') {
    const chain = await client.view<ChainWorkflow>('get_workflow', {});
    if (matches(chain, row, accountsOf(db, row))) {
      activate(db, row, outcome.txHash, now);
      audit(db, actor, 'workflow.updated', { revision: row.revision, txHash: outcome.txHash }, now);
      return { status: 'active', revision: row.revision, txHash: outcome.txHash };
    }
    return { status: 'pending', revision: row.revision, txHash: outcome.txHash, error: 'Transaction succeeded but the vault does not show this revision yet. Refresh to check again.' };
  }
  if (outcome.status === 'failure') {
    db.update(workflowConfigs).set({ chainStatus: 'failed' }).where(eq(workflowConfigs.id, row.id)).run();
    audit(db, actor, 'workflow.update_failed', { revision: row.revision, txHash: outcome.txHash, error: outcome.error ?? null }, now);
    return { status: 'failed', revision: row.revision, txHash: outcome.txHash, ...(outcome.error ? { error: outcome.error } : {}) };
  }
  return { status: 'pending', revision: row.revision, txHash: outcome.txHash, error: 'No final result from NEAR yet. The change stays pending; refresh to check again.' };
}

export async function updateWorkflow(db: Db, client: VaultClient, adminUserId: string, input: Partial<WorkflowInput>, now = new Date()): Promise<UpdateResult> {
  const { errors, approvers } = validateWorkflowInput(db, input);
  if (errors.length) return { status: 'invalid', errors };
  const kind = input.kind as WorkflowKind;
  const releaseMode = input.releaseMode as ReleaseMode;
  if (db.select({ id: workflowConfigs.id }).from(workflowConfigs).where(eq(workflowConfigs.chainStatus, 'pending')).get()) {
    return { status: 'conflict', message: 'A workflow change is still waiting for confirmation on NEAR. Refresh its status first.' };
  }
  if (!client.canSign('admin')) return { status: 'conflict', message: NO_SIGNER_MESSAGE };
  const active = db.select().from(workflowConfigs).where(activeWorkflowWhere()).get();
  if (!active || active.revision !== input.expectedRevision) {
    return { status: 'conflict', message: 'The workflow changed since you opened this page. Reload and try again.' };
  }
  const chain = await client.view<ChainWorkflow>('get_workflow', {});
  if (chain.revision !== active.revision) {
    return { status: 'conflict', message: `The vault is at revision ${chain.revision} but the app shows ${active.revision}. An operator must reconcile before changes are allowed.` };
  }
  const unchanged = active.kind === kind && active.releaseMode === releaseMode && active.approver1UserId === approvers[0]?.id && (active.approver2UserId ?? undefined) === approvers[1]?.id;
  if (unchanged) return { status: 'invalid', errors: [{ field: 'form', message: 'Nothing changed: this is already the active workflow.' }] };

  const revision = chain.revision + 1;
  const row = {
    id: `wf_rev_${revision}_${randomUUID().slice(0, 8)}`, revision, kind, approver1UserId: approvers[0]!.id, approver2UserId: approvers[1]?.id ?? null, releaseMode,
    maxRowAmount: active.maxRowAmount, maxRunTotal: active.maxRunTotal, chainStatus: 'pending' as const, chainTxHash: null, vaultContractId: active.vaultContractId,
    createdByUserId: adminUserId, createdAt: now, activatedAt: null,
  };
  db.insert(workflowConfigs).values(row).run();
  audit(db, adminUserId, 'workflow.update_requested', { revision, kind, releaseMode }, now);

  const outcome = await client.call('admin', 'update_workflow', {
    kind: KIND_TO_CHAIN[kind], approvers: approvers.map((a) => a.chainAccountId), release_mode: RELEASE_TO_CHAIN[releaseMode],
    maker: client.accountFor('maker'), worker: client.accountFor('worker'),
    max_row_amount: active.maxRowAmount.toString(), max_run_total: active.maxRunTotal.toString(),
  }, { gasTgas: 30, onSigned: (txHash) => db.update(workflowConfigs).set({ chainTxHash: txHash }).where(eq(workflowConfigs.id, row.id)).run() });
  const stored = db.select().from(workflowConfigs).where(eq(workflowConfigs.id, row.id)).get();
  return settle(db, client, stored!, outcome, adminUserId, now);
}

/** Re-checks a pending change against the chain (after a timeout or unknown outcome). */
export async function reconcilePendingWorkflow(db: Db, client: VaultClient, actor: string, now = new Date()): Promise<UpdateResult | null> {
  const pending = db.select().from(workflowConfigs).where(eq(workflowConfigs.chainStatus, 'pending')).get();
  if (!pending) return null;
  const chain = await client.view<ChainWorkflow>('get_workflow', {});
  if (matches(chain, pending, accountsOf(db, pending))) {
    activate(db, pending, null, now);
    audit(db, actor, 'workflow.updated', { revision: pending.revision, reconciled: true }, now);
    return { status: 'active', revision: pending.revision, ...(pending.chainTxHash ? { txHash: pending.chainTxHash } : {}) };
  }
  if (!pending.chainTxHash) {
    // Never signed (crashed before signing): nothing can be on-chain.
    db.update(workflowConfigs).set({ chainStatus: 'failed' }).where(and(eq(workflowConfigs.id, pending.id), eq(workflowConfigs.chainStatus, 'pending'))).run();
    return { status: 'failed', revision: pending.revision, error: 'The change was never sent.' };
  }
  const outcome = await client.txOutcome(pending.chainTxHash, 'admin');
  return settle(db, client, pending, outcome, actor, now);
}

/** Snapshot of the active workflow for a new run version (copied into the version). */
export function activeSnapshot(db: Db): WorkflowSnapshot | null {
  const wf = db.select().from(workflowConfigs).where(activeWorkflowWhere()).get();
  if (!wf) return null;
  const ids = [wf.approver1UserId, wf.approver2UserId].filter((x): x is string => Boolean(x));
  const people = db.select().from(users).where(inArray(users.id, ids)).all();
  return {
    revision: wf.revision, kind: wf.kind, releaseMode: wf.releaseMode,
    approvers: ids.map((id) => ({ userId: id, chainAccountId: people.find((p) => p.id === id)?.chainAccountId ?? '' })),
    maxRowAmount: wf.maxRowAmount.toString(), maxRunTotal: wf.maxRunTotal.toString(),
  };
}

export function pendingWorkflow(db: Db) {
  return db.select().from(workflowConfigs).where(eq(workflowConfigs.chainStatus, 'pending')).get() ?? null;
}

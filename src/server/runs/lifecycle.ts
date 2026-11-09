/**
 * Run version lifecycle against the vault (Phases 10–12): submit, reconcile with the chain,
 * cancel, approve/reject, release. Rules:
 * - A version is frozen locally (createVersion) BEFORE anything is signed; the tx hash is
 *   stored before the transaction is sent; statuses advance only from what the vault reports.
 * - Unknown outcomes stay pending and are reconciled from `get_run` / `get_row` and tx status.
 * - The chain run ID is deterministic, so a retried submit can never create a second run.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { can, type Principal, type RunContext } from '../auth/policy.ts';
import { NO_SIGNER_MESSAGE, roleForAccount, type VaultClient } from '../chain/vault-client.ts';
import type { Db } from '../db/client.ts';
import {
  approvalEvents, auditEvents, payoutActions, payrollRuns, runVersions, users, versionRows, type VersionStatus,
} from '../db/schema.ts';
import { validateRows } from '../payroll/validate.ts';
import { activeSnapshot } from '../workflow/service.ts';
import { activeLimits, toRaw } from './draft-service.ts';
import { confirmedPayouts, settleActions } from '../payouts/settle.ts';
import { createReportEntries } from '../reports/entries.ts';
import { createVersion, DomainError, getDraftRows, setVersionStatus, type WorkflowSnapshot } from './repository.ts';

export type Version = typeof runVersions.$inferSelect;

export interface ChainRun {
  maker: string;
  policy: { revision: number; kind: string; approvers: string[]; release_mode: string };
  row_count: number;
  total: string;
  payout_root: string;
  review_digest: string;
  status: 'PendingApproval' | 'Approved' | 'Rejected' | 'Cancelled' | 'Releasing' | 'Paid' | 'PartiallyPaid';
  approvals: string[];
  rejected_by: string | null;
  superseded_by: string | null;
  reserved: string;
  committed: string;
  paid: string;
  paid_count: number;
  in_flight_count: number;
}

const CHAIN_TO_STATUS: Record<ChainRun['status'], VersionStatus> = {
  PendingApproval: 'pending_approval', Approved: 'approved', Rejected: 'rejected', Cancelled: 'cancelled',
  Releasing: 'releasing', Paid: 'paid', PartiallyPaid: 'partially_paid',
};
const ORDER: Record<VersionStatus, number> = {
  submitting: 0, submit_failed: 9, pending_approval: 1, approved: 2, releasing: 3, paid: 9, partially_paid: 9, rejected: 9, cancelled: 9,
};
export const LIVE_STATUSES: VersionStatus[] = ['submitting', 'pending_approval', 'approved', 'releasing'];
export const TERMINAL_STATUSES: VersionStatus[] = ['submit_failed', 'rejected', 'cancelled', 'paid', 'partially_paid'];

function audit(db: Db, actor: string | null, action: string, versionId: string, detail: Record<string, unknown>, now: Date) {
  db.insert(auditEvents).values({ at: now, actorUserId: actor, action, entityType: 'run_version', entityId: versionId, detail: JSON.stringify(detail) }).run();
}

/** Refuses any chain action on a version that lives in another vault (after a vault switch). */
export function assertSameVault(v: Version, client: VaultClient) {
  if (v.vaultContractId !== client.vaultId) {
    throw new DomainError('conflict', `This version was submitted to ${v.vaultContractId}; the app now works with ${client.vaultId}. Nothing was sent.`);
  }
}

export function versionsOf(db: Db, runId: string): Version[] {
  return db.select().from(runVersions).where(eq(runVersions.runId, runId)).orderBy(desc(runVersions.versionNo)).all();
}

export function latestVersion(db: Db, runId: string): Version | null {
  return versionsOf(db, runId)[0] ?? null;
}

export function snapshotOf(v: Version): WorkflowSnapshot {
  return JSON.parse(v.workflowSnapshot) as WorkflowSnapshot;
}

/** Authorization context: the maker plus every approver snapshotted into any version. */
export function contextOf(db: Db, runId: string): (RunContext & { run: typeof payrollRuns.$inferSelect }) | null {
  const run = db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run) return null;
  const assigned = new Set<string>();
  for (const v of versionsOf(db, runId)) for (const a of snapshotOf(v).approvers) assigned.add(a.userId);
  return { run, makerUserId: run.makerUserId, assignedApproverIds: [...assigned] };
}

// --------------------------------------------------------------------- submit

export interface SubmitResult { versionId: string; versionNo: number; status: VersionStatus; txHash: string | null; error?: string }

/** Freezes the draft into a new version and sends create_run with the maker's restricted key. */
export async function submitRun(db: Db, client: VaultClient, principal: Principal, runId: string, input: {
  expectedRevision: number; supersede?: boolean; now?: Date;
}): Promise<SubmitResult> {
  const now = input.now ?? new Date();
  const ctx = contextOf(db, runId);
  if (!ctx || !can(principal, 'run.submit', ctx)) throw new DomainError('not_found', 'Payroll run not found.');
  const run = ctx.run;
  if (run.draftRevision !== input.expectedRevision) throw new DomainError('conflict', 'The draft changed since you reviewed it. Review it again.');
  const live = versionsOf(db, runId).find((v) => LIVE_STATUSES.includes(v.status));
  if (live?.status === 'submitting') {
    const r = await reconcileVersion(db, client, live.id, now);
    return { versionId: live.id, versionNo: live.versionNo, status: r.status, txHash: live.submitTxHash };
  }
  if (live?.status === 'releasing') throw new DomainError('conflict', 'This run is being paid and cannot be replaced.');
  if (live && !input.supersede) throw new DomainError('conflict', `Version ${live.versionNo} is still ${live.status === 'approved' ? 'approved' : 'waiting for approval'}. Submit as a new version to replace it.`);

  const draft = getDraftRows(db, runId);
  const summary = validateRows(draft.map(toRaw), activeLimits(db));
  if (summary.invalidCount > 0 || summary.runErrors.length || summary.validCount === 0) {
    throw new DomainError('invalid', 'Every row must be valid before submission. Fix or remove the invalid rows first.');
  }
  const snapshot = activeSnapshot(db);
  if (!snapshot) throw new DomainError('invalid', 'No active approval workflow. Ask the admin to set one.');
  if (!client.canSign('maker')) throw new DomainError('conflict', NO_SIGNER_MESSAGE);
  const rows = summary.rows.map((r, i) => ({ ...r.valid!, sourceLine: draft[i]?.sourceLine ?? null }));
  const version = createVersion(db, {
    runId, makerUserId: principal.id, rows, workflow: snapshot, postingMode: run.postingMode, now, vaultContractId: client.vaultId,
    source: run.source === 'upload' && run.draftFilename && run.draftFileSha256 ? { filename: run.draftFilename, sha256: run.draftFileSha256 } : null,
  });
  const stored = db.select().from(runVersions).where(eq(runVersions.id, version.id)).get()!;
  audit(db, principal.id, 'run.submit_requested', version.id, { versionNo: version.versionNo, rows: version.rowCount, supersedes: live?.chainRunId ?? null }, now);

  const outcome = await client.call('maker', 'create_run', {
    run_id: version.chainRunId, workflow_revision: snapshot.revision, row_count: version.rowCount, total: version.total.toString(),
    payout_root: stored.payoutRoot, review_digest: stored.reviewDigest, supersedes: live?.chainRunId ?? null,
  }, { gasTgas: 50, waitUntil: 'INCLUDED', onSigned: (h) => db.update(runVersions).set({ submitTxHash: h }).where(eq(runVersions.id, version.id)).run() });

  if (outcome.status === 'failure') {
    // Already-existing run id means an earlier attempt landed: reconcile instead of failing.
    if (/Run already exists/.test(outcome.error ?? '')) return { ...(await reconcileSummary(db, client, version.id, now)), txHash: outcome.txHash };
    db.update(runVersions).set({ status: 'submit_failed', statusUpdatedAt: now, statusDetail: outcome.error ?? 'The vault rejected the submission.' }).where(eq(runVersions.id, version.id)).run();
    audit(db, principal.id, 'run.submit_failed', version.id, { error: outcome.error ?? null }, now);
    return { versionId: version.id, versionNo: version.versionNo, status: 'submit_failed', txHash: outcome.txHash, ...(outcome.error ? { error: outcome.error } : {}) };
  }
  return { versionId: version.id, versionNo: version.versionNo, status: 'submitting', txHash: outcome.txHash };
}

async function reconcileSummary(db: Db, client: VaultClient, versionId: string, now: Date) {
  const r = await reconcileVersion(db, client, versionId, now);
  const v = db.select().from(runVersions).where(eq(runVersions.id, versionId)).get()!;
  return { versionId, versionNo: v.versionNo, status: r.status };
}

// ------------------------------------------------------------------ reconcile

/** Brings a version, its approval events and its supersede link in line with the vault. */
export async function reconcileVersion(db: Db, client: VaultClient, versionId: string, now = new Date()): Promise<{ status: VersionStatus; chain: ChainRun | null }> {
  const v = db.select().from(runVersions).where(eq(runVersions.id, versionId)).get();
  if (!v) throw new DomainError('not_found', 'Version not found.');
  // A version submitted to another vault (before a vault switch) is never reconciled against
  // this one: its state stays as last confirmed by its own vault.
  if (v.vaultContractId !== client.vaultId) return { status: v.status, chain: null };
  const chain = await client.view<ChainRun | null>('get_run', { run_id: v.chainRunId });

  if (v.status === 'submitting') {
    if (!chain) {
      if (v.submitTxHash) {
        const out = await client.txOutcome(v.submitTxHash, 'maker');
        if (out.status === 'failure') {
          db.update(runVersions).set({ status: 'submit_failed', statusUpdatedAt: now, statusDetail: out.error ?? 'The vault rejected the submission.' }).where(eq(runVersions.id, versionId)).run();
          return { status: 'submit_failed', chain };
        }
      }
      return { status: 'submitting', chain };
    }
    const snap = snapshotOf(v);
    const matches = chain.payout_root === v.payoutRoot && chain.total === v.total.toString() && chain.row_count === v.rowCount && chain.policy.revision === snap.revision;
    if (!matches) {
      db.update(runVersions).set({ status: 'submit_failed', statusUpdatedAt: now, statusDetail: 'The vault holds a different run under this ID.' }).where(eq(runVersions.id, versionId)).run();
      return { status: 'submit_failed', chain };
    }
  }

  // Approval events: confirm from the chain's approval list or the transaction outcome.
  const events = db.select().from(approvalEvents).where(and(eq(approvalEvents.versionId, versionId), eq(approvalEvents.status, 'pending'))).all();
  for (const e of events) {
    const approver = db.select({ chainAccountId: users.chainAccountId }).from(users).where(eq(users.id, e.approverUserId)).get();
    const onChain = chain && approver?.chainAccountId
      ? (e.decision === 'approve' ? chain.approvals.includes(approver.chainAccountId) : chain.rejected_by === approver.chainAccountId)
      : false;
    if (onChain) {
      db.update(approvalEvents).set({ status: 'confirmed', confirmedAt: now }).where(eq(approvalEvents.id, e.id)).run();
      continue;
    }
    if (e.chainTxHash && approver?.chainAccountId) {
      const out = await client.txOutcome(e.chainTxHash, roleForAccount(client, approver.chainAccountId));
      if (out.status === 'failure') db.update(approvalEvents).set({ status: 'failed', error: out.error ?? 'The vault refused this decision.' }).where(eq(approvalEvents.id, e.id)).run();
    }
  }

  let status = db.select().from(runVersions).where(eq(runVersions.id, versionId)).get()!.status;
  if (chain) {
    let target = CHAIN_TO_STATUS[chain.status];
    if (target === 'paid' || target === 'partially_paid') {
      // The vault can report Paid before this app has recorded the last payout (the worker
      // waits for finality). Settle every open payout record from `get_row` first; the version
      // becomes Paid only when every row is confirmed locally and count and total match the
      // approved version exactly (PRD A06). Otherwise it stays Releasing until they do.
      await settleActions(db, client, v, now);
      const done = confirmedPayouts(db, versionId);
      if (target === 'paid' && (done.count !== v.rowCount || done.total !== v.total)) target = 'releasing';
    }
    if (target !== status && ORDER[target] > ORDER[status] && !TERMINAL_STATUSES.includes(status)) {
      setVersionStatus(db, versionId, target, now);
      status = target;
      audit(db, null, 'run.status_from_chain', versionId, { status: target }, now);
    }
    if (status === 'paid') createReportEntries(db, versionId, now);
    if (chain.superseded_by) {
      const newer = db.select({ id: runVersions.id }).from(runVersions).where(eq(runVersions.chainRunId, chain.superseded_by)).get();
      if (newer) db.update(runVersions).set({ supersededByVersionId: newer.id }).where(eq(runVersions.id, versionId)).run();
    }
  }
  // When a newer version superseded older ones on-chain, bring those up to date too.
  if (status === 'pending_approval') {
    const older = versionsOf(db, v.runId).filter((o) => o.id !== v.id && (o.status === 'pending_approval' || o.status === 'approved'));
    for (const o of older) await reconcileVersion(db, client, o.id, now);
  }
  return { status, chain };
}

// --------------------------------------------------------------------- cancel

export async function cancelVersion(db: Db, client: VaultClient, principal: Principal, runId: string, now = new Date()) {
  const ctx = contextOf(db, runId);
  if (!ctx || !can(principal, 'run.cancel', ctx)) throw new DomainError('not_found', 'Payroll run not found.');
  const v = latestVersion(db, runId);
  if (!v || (v.status !== 'pending_approval' && v.status !== 'approved')) throw new DomainError('conflict', 'Only a version that is waiting for approval or approved can be cancelled.');
  assertSameVault(v, client);
  if (!client.canSign('maker')) throw new DomainError('conflict', NO_SIGNER_MESSAGE);
  audit(db, principal.id, 'run.cancel_requested', v.id, {}, now);
  const outcome = await client.call('maker', 'cancel_run', { run_id: v.chainRunId }, { gasTgas: 30 });
  if (outcome.status === 'failure') throw new DomainError('conflict', `The vault refused the cancellation: ${outcome.error ?? 'unknown reason'}.`);
  const r = await reconcileVersion(db, client, v.id, now);
  return { status: r.status, txHash: outcome.txHash };
}

// ---------------------------------------------------------------- read models

export interface RunDetail {
  run: typeof payrollRuns.$inferSelect;
  version: Version | null;
  versions: Version[];
  snapshot: WorkflowSnapshot | null;
  approvers: { userId: string; displayName: string; chainAccountId: string; step: number }[];
  events: (typeof approvalEvents.$inferSelect)[];
  rows: (typeof versionRows.$inferSelect)[];
  actions: (typeof payoutActions.$inferSelect)[];
  canViewRecipients: boolean;
}

export function runDetail(db: Db, principal: Principal, runId: string): RunDetail {
  const ctx = contextOf(db, runId);
  if (!ctx || !can(principal, 'run.view', ctx)) throw new DomainError('not_found', 'Payroll run not found.');
  const versions = versionsOf(db, runId);
  const version = versions[0] ?? null;
  const snapshot = version ? snapshotOf(version) : null;
  const people = snapshot ? db.select().from(users).where(inArray(users.id, snapshot.approvers.map((a) => a.userId))).all() : [];
  return {
    run: ctx.run, version, versions, snapshot,
    approvers: (snapshot?.approvers ?? []).map((a, i) => ({ userId: a.userId, chainAccountId: a.chainAccountId, step: i + 1, displayName: people.find((p) => p.id === a.userId)?.displayName ?? 'Unknown' })),
    events: version ? db.select().from(approvalEvents).where(eq(approvalEvents.versionId, version.id)).orderBy(approvalEvents.createdAt).all() : [],
    rows: version ? db.select().from(versionRows).where(eq(versionRows.versionId, version.id)).orderBy(versionRows.rowIndex).all() : [],
    actions: version ? db.select().from(payoutActions).where(eq(payoutActions.versionId, version.id)).orderBy(payoutActions.createdAt).all() : [],
    canViewRecipients: can(principal, 'run.view_recipients', ctx),
  };
}

// ------------------------------------------------------------------ decisions

export const MAX_REASON = 500;

/**
 * An assigned approver approves or rejects the exact version shown to them. Server-side
 * mirror of the vault's rules (assignment, order, once per approver); the vault decides.
 * The event is stored as `pending` with its tx hash before sending; the run page reconciles.
 */
export async function decide(db: Db, client: VaultClient, principal: Principal, runId: string, input: {
  versionId: string; decision: 'approve' | 'reject'; reason?: string; now?: Date;
}) {
  const now = input.now ?? new Date();
  const ctx = contextOf(db, runId);
  if (!ctx || !can(principal, 'run.decide', ctx)) throw new DomainError('not_found', 'Payroll run not found.');
  const v = latestVersion(db, runId);
  if (!v || v.id !== input.versionId) throw new DomainError('conflict', 'This version was replaced. Open the latest version and review it again.');
  if (v.status !== 'pending_approval') throw new DomainError('conflict', 'This version is not waiting for approval.');
  assertSameVault(v, client);
  const snap = snapshotOf(v);
  const step = snap.approvers.findIndex((a) => a.userId === principal.id) + 1;
  if (step === 0) throw new DomainError('forbidden', 'You are not assigned to this version.');
  const events = db.select().from(approvalEvents).where(eq(approvalEvents.versionId, v.id)).all();
  if (events.some((e) => e.approverUserId === principal.id && e.status !== 'failed')) throw new DomainError('conflict', 'You already decided on this version.');
  if (snap.kind === 'two_sequential' && step === 2 && !events.some((e) => e.step === 1 && e.decision === 'approve' && e.status === 'confirmed')) {
    throw new DomainError('conflict', 'Approver 2 can act only after approver 1 has approved on NEAR.');
  }
  const reason = input.reason?.trim() ?? '';
  if (input.decision === 'reject' && (reason.length < 3 || reason.length > MAX_REASON)) throw new DomainError('invalid', `Give a reason for the rejection (3–${MAX_REASON} characters).`);
  const account = snap.approvers[step - 1]!.chainAccountId;
  if (!client.canSign(roleForAccount(client, account))) throw new DomainError('conflict', NO_SIGNER_MESSAGE);
  const id = `${v.id}:${principal.id}:${now.getTime()}`;
  try {
    db.insert(approvalEvents).values({
      id, versionId: v.id, approverUserId: principal.id, step, decision: input.decision, reason: input.decision === 'reject' ? reason : null,
      status: 'pending', createdAt: now,
    }).run();
  } catch {
    throw new DomainError('conflict', 'You already decided on this version.');
  }
  audit(db, principal.id, `run.${input.decision}_requested`, v.id, { step }, now);
  const outcome = await client.call(roleForAccount(client, account), input.decision, { run_id: v.chainRunId }, {
    gasTgas: 30, waitUntil: 'INCLUDED', onSigned: (h) => db.update(approvalEvents).set({ chainTxHash: h }).where(eq(approvalEvents.id, id)).run(),
  });
  if (outcome.status === 'failure') {
    db.update(approvalEvents).set({ status: 'failed', error: outcome.error ?? 'Refused by the vault.' }).where(eq(approvalEvents.id, id)).run();
    throw new DomainError('conflict', `The vault refused this decision: ${outcome.error ?? 'unknown reason'}.`);
  }
  return { status: 'pending' as const, txHash: outcome.txHash, step };
}

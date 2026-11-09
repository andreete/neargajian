/**
 * Read models for the role dashboards. Every function is scoped by the caller's identity;
 * route handlers and pages pass the session user, never a client-supplied ID.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Queryable } from '../db/client.ts';
import {
  approvalEvents, draftRows, payrollRuns, runVersions, testnetRunEvents, testnetRunRows, testnetRuns, users, workflowConfigs,
  type PostingMode, type ReleaseMode, type VersionStatus, type WorkflowKind,
} from '../db/schema.ts';
import { parseAmount } from '../money.ts';
import type { RunContext } from '../auth/policy.ts';
import type { WorkflowSnapshot } from '../runs/repository.ts';

export type RunDisplayStatus = 'draft' | VersionStatus;

export interface RunSummary {
  id: string;
  title: string;
  postingMode: PostingMode;
  source: 'manual' | 'upload';
  status: RunDisplayStatus;
  versionNo: number | null;
  rowCount: number;
  /** Exact total of valid rows (draft) or of the latest version, in base units. */
  total: bigint;
  invalidRows: number;
  updatedAt: Date;
}

export function makerRuns(db: Queryable, makerUserId: string): RunSummary[] {
  const runs = db.select().from(payrollRuns).where(eq(payrollRuns.makerUserId, makerUserId)).orderBy(desc(payrollRuns.updatedAt)).all();
  if (runs.length === 0) return [];
  const ids = runs.map((r) => r.id);
  const versions = db.select().from(runVersions).where(inArray(runVersions.runId, ids)).orderBy(desc(runVersions.versionNo)).all();
  const drafts = db.select({ runId: draftRows.runId, amount: draftRows.amount }).from(draftRows).where(inArray(draftRows.runId, ids)).all();
  return runs.map((run) => {
    const latest = versions.find((v) => v.runId === run.id);
    if (latest) {
      return {
        id: run.id, title: run.title, postingMode: latest.postingMode, source: run.source, status: latest.status,
        versionNo: latest.versionNo, rowCount: latest.rowCount, total: latest.total, invalidRows: 0, updatedAt: latest.statusUpdatedAt,
      };
    }
    let total = 0n;
    let invalid = 0;
    const rows = drafts.filter((d) => d.runId === run.id);
    for (const r of rows) {
      const parsed = parseAmount(r.amount);
      if (parsed.ok) total += parsed.value;
      else invalid += 1;
    }
    return {
      id: run.id, title: run.title, postingMode: run.postingMode, source: run.source, status: 'draft' as const,
      versionNo: null, rowCount: rows.length, total, invalidRows: invalid, updatedAt: run.updatedAt,
    };
  });
}

export interface QueueItem {
  versionId: string;
  runId: string;
  title: string;
  versionNo: number;
  rowCount: number;
  total: bigint;
  postingMode: PostingMode;
  status: VersionStatus;
  myStep: number;
  actionable: boolean;
  submittedAt: Date;
}

/** Versions whose snapshotted workflow assigns this approver. */
export function approverQueue(db: Queryable, approverUserId: string): { pending: QueueItem[]; reviewed: QueueItem[] } {
  const rows = db.select({ v: runVersions, title: payrollRuns.title }).from(runVersions)
    .innerJoin(payrollRuns, eq(runVersions.runId, payrollRuns.id)).orderBy(desc(runVersions.createdAt)).all();
  const decided = new Set(db.select({ versionId: approvalEvents.versionId }).from(approvalEvents)
    .where(and(eq(approvalEvents.approverUserId, approverUserId), inArray(approvalEvents.status, ['pending', 'confirmed']))).all().map((e) => e.versionId));
  const pending: QueueItem[] = [];
  const reviewed: QueueItem[] = [];
  for (const { v, title } of rows) {
    const snapshot = JSON.parse(v.workflowSnapshot) as WorkflowSnapshot;
    const step = snapshot.approvers.findIndex((a) => a.userId === approverUserId);
    if (step < 0) continue;
    const confirmedBefore = db.select({ id: approvalEvents.id }).from(approvalEvents)
      .where(and(eq(approvalEvents.versionId, v.id), eq(approvalEvents.status, 'confirmed'), eq(approvalEvents.decision, 'approve'))).all().length;
    const actionable = v.status === 'pending_approval' && !decided.has(v.id)
      && (snapshot.kind !== 'two_sequential' || step === confirmedBefore);
    const item: QueueItem = {
      versionId: v.id, runId: v.runId, title, versionNo: v.versionNo, rowCount: v.rowCount, total: v.total,
      postingMode: v.postingMode, status: v.status, myStep: step + 1, actionable, submittedAt: v.createdAt,
    };
    (v.status === 'pending_approval' && !decided.has(v.id) ? pending : reviewed).push(item);
  }
  return { pending, reviewed };
}

export interface ActiveWorkflow {
  revision: number;
  kind: WorkflowKind;
  releaseMode: ReleaseMode;
  approvers: { userId: string; displayName: string; email: string; chainAccountId: string | null }[];
  maxRowAmount: bigint;
  maxRunTotal: bigint;
  chainTxHash: string | null;
  activatedAt: Date | null;
}

export function activeWorkflow(db: Queryable): ActiveWorkflow | null {
  const wf = db.select().from(workflowConfigs).where(eq(workflowConfigs.chainStatus, 'active')).get();
  if (!wf) return null;
  const ids = [wf.approver1UserId, wf.approver2UserId].filter((x): x is string => Boolean(x));
  const people = db.select().from(users).where(inArray(users.id, ids)).all();
  return {
    revision: wf.revision, kind: wf.kind, releaseMode: wf.releaseMode,
    approvers: ids.map((id) => {
      const u = people.find((p) => p.id === id);
      return { userId: id, displayName: u?.displayName ?? 'Unknown', email: u?.email ?? '', chainAccountId: u?.chainAccountId ?? null };
    }),
    maxRowAmount: wf.maxRowAmount, maxRunTotal: wf.maxRunTotal, chainTxHash: wf.chainTxHash, activatedAt: wf.activatedAt,
  };
}

/** Authorization context of a run, loaded from the database. */
export function runContext(db: Queryable, runId: string): (RunContext & { title: string }) | null {
  const run = db.select({ makerUserId: payrollRuns.makerUserId, title: payrollRuns.title }).from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run) return null;
  const snapshots = db.select({ s: runVersions.workflowSnapshot }).from(runVersions).where(eq(runVersions.runId, runId)).all();
  const assigned = new Set<string>();
  for (const { s } of snapshots) for (const a of (JSON.parse(s) as WorkflowSnapshot).approvers) assigned.add(a.userId);
  return { makerUserId: run.makerUserId, assignedApproverIds: [...assigned], title: run.title };
}

// ------------------------------------------------------------- imported testnet history

export interface TestnetRunSummary {
  id: string;
  title: string;
  /** payroll runs count toward payroll totals; operations transfers never do. */
  category: 'payroll' | 'operations';
  status: 'paid' | 'rejected' | 'incomplete';
  kind: WorkflowKind;
  releaseMode: ReleaseMode;
  rowCount: number;
  total: bigint;
  paidTotal: bigint;
  createdAt: Date;
  createdTxHash: string;
  lastPaidTxHash: string | null;
  vaultGeneration: string;
  rejectionReason: string | null;
}

function summarizeTestnetRuns(db: Queryable, runs: (typeof testnetRuns.$inferSelect)[]): TestnetRunSummary[] {
  if (runs.length === 0) return [];
  const rows = db.select().from(testnetRunRows).where(inArray(testnetRunRows.runId, runs.map((r) => r.id))).all();
  return runs.map((r) => {
    const mine = rows.filter((x) => x.runId === r.id);
    const paid = mine.filter((x) => x.paidTxHash);
    const last = paid.sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0))[0];
    return {
      id: r.id, title: r.title, category: r.category, status: r.status, kind: r.kind, releaseMode: r.releaseMode, rowCount: r.rowCount, total: r.total,
      paidTotal: paid.reduce((s, x) => s + x.amount, 0n), createdAt: r.createdAt, createdTxHash: r.createdTxHash,
      lastPaidTxHash: last?.paidTxHash ?? null, vaultGeneration: r.vaultGeneration, rejectionReason: r.rejectionReason,
    };
  });
}

export function makerTestnetRuns(db: Queryable, makerUserId: string): TestnetRunSummary[] {
  return summarizeTestnetRuns(db, db.select().from(testnetRuns).where(eq(testnetRuns.makerUserId, makerUserId)).orderBy(desc(testnetRuns.createdAt)).all());
}

export function allTestnetRuns(db: Queryable): TestnetRunSummary[] {
  return summarizeTestnetRuns(db, db.select().from(testnetRuns).orderBy(desc(testnetRuns.createdAt)).all());
}

export interface TestnetDecision extends TestnetRunSummary {
  decision: 'approved' | 'rejected';
  decidedAt: Date;
  decisionTxHash: string;
}

/** Imported runs this approver approved or rejected on-chain (successful transactions only). */
export function approverTestnetDecisions(db: Queryable, chainAccountId: string | null): TestnetDecision[] {
  if (!chainAccountId) return [];
  const events = db.select().from(testnetRunEvents)
    .where(and(eq(testnetRunEvents.signerAccount, chainAccountId), eq(testnetRunEvents.success, true), inArray(testnetRunEvents.method, ['approve', 'reject']))).all();
  if (events.length === 0) return [];
  const runs = summarizeTestnetRuns(db, db.select().from(testnetRuns).where(inArray(testnetRuns.id, events.map((e) => e.runId))).all());
  return events.map((e) => {
    const run = runs.find((r) => r.id === e.runId);
    if (!run) throw new Error('missing run');
    return { ...run, decision: e.method === 'approve' ? 'approved' as const : 'rejected' as const, decidedAt: e.at, decisionTxHash: e.txHash };
  }).sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime());
}

export interface TestnetTotals {
  runs: number;
  paidRuns: number;
  rejectedRuns: number;
  payouts: number;
  paidTotal: bigint;
  refusedAttempts: number;
  duplicatePayoutsRefused: number;
}

/** Payroll totals from imported testnet runs. Operations transfers are excluded. */
export function testnetTotals(db: Queryable): TestnetTotals {
  const runs = db.select().from(testnetRuns).where(eq(testnetRuns.category, 'payroll')).all();
  const ids = new Set(runs.map((r) => r.id));
  const rows = db.select().from(testnetRunRows).all().filter((r) => ids.has(r.runId));
  const events = db.select().from(testnetRunEvents).all().filter((e) => ids.has(e.runId));
  const paidRows = rows.filter((r) => r.paidTxHash);
  return {
    runs: runs.length,
    paidRuns: runs.filter((r) => r.status === 'paid').length,
    rejectedRuns: runs.filter((r) => r.status === 'rejected').length,
    payouts: paidRows.length,
    paidTotal: paidRows.reduce((s, r) => s + r.amount, 0n),
    refusedAttempts: events.filter((e) => !e.success).length,
    duplicatePayoutsRefused: events.filter((e) => !e.success && e.method === 'pay_row' && /already paid|not releasing/i.test(e.error ?? '')).length,
  };
}

/** Imported operations transfers (not payroll), shown separately with their proof links. */
export function operationsTransfers(db: Queryable): TestnetRunSummary[] {
  return summarizeTestnetRuns(db, db.select().from(testnetRuns).where(eq(testnetRuns.category, 'operations')).orderBy(desc(testnetRuns.createdAt)).all());
}

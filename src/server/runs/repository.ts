/**
 * Payroll runs, drafts and immutable versions. Every state change is one SQLite
 * transaction; callers pass the authenticated user, and ownership is checked here too
 * (defence in depth; route handlers also check the authorization policy).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, eq, max } from 'drizzle-orm';
import { buildPayoutTree, reviewDigest, toHex, type PayoutLeaf, type ReviewRow } from '../commitments.ts';
import type { Db, Queryable } from '../db/client.ts';
import {
  draftRows, payrollRuns, runVersions, versionRows,
  type PostingMode, type VersionStatus, type WorkflowKind, type ReleaseMode,
} from '../db/schema.ts';

export type DomainErrorCode = 'not_found' | 'forbidden' | 'conflict' | 'invalid';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export interface DraftRowInput {
  nearAccountId: string;
  receiverName: string;
  currency: string;
  amount: string;
  mobilePhone: string;
  email: string;
  sourceLine?: number | null;
}

export interface NewRunInput {
  makerUserId: string;
  title: string;
  postingMode: PostingMode;
  source: 'manual' | 'upload';
  now: Date;
  id?: string;
  /** Set when the payroll assistant drafted the run (fixed afterwards, trigger). */
  assistant?: { requestId: string; requestText: string };
}

export function createRun(db: Queryable, input: NewRunInput): string {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 120) throw new DomainError('invalid', 'Title must be 1-120 characters.');
  const id = input.id ?? randomUUID();
  db.insert(payrollRuns).values({
    id, makerUserId: input.makerUserId, title, postingMode: input.postingMode, source: input.source,
    draftRevision: 0, createdAt: input.now, updatedAt: input.now,
    ...(input.assistant ? { assistantRequestId: input.assistant.requestId, assistantRequestText: input.assistant.requestText } : {}),
  }).run();
  return id;
}

function ownedRun(db: Queryable, runId: string, makerUserId: string) {
  const run = db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run) throw new DomainError('not_found', 'Payroll run not found.');
  if (run.makerUserId !== makerUserId) throw new DomainError('forbidden', 'Only the run maker can change it.');
  return run;
}

/**
 * Replaces the whole draft atomically (manual save or accepted upload). Optimistic
 * concurrency: `expectedRevision` must match. Any failure rolls back, so the previously
 * accepted draft stays intact.
 */
export function replaceDraft(db: Db, input: {
  runId: string; makerUserId: string; expectedRevision: number; rows: DraftRowInput[];
  file?: { filename: string; sha256: string } | null; now: Date;
  meta?: { title?: string; postingMode?: PostingMode; source?: 'manual' | 'upload' };
}): number {
  if (input.rows.length > 1000) throw new DomainError('invalid', 'A run has at most 1,000 rows.');
  return db.transaction((tx) => {
    const run = ownedRun(tx, input.runId, input.makerUserId);
    if (run.draftRevision !== input.expectedRevision) {
      throw new DomainError('conflict', 'The draft changed in another window. Reload and try again.');
    }
    tx.delete(draftRows).where(eq(draftRows.runId, input.runId)).run();
    input.rows.forEach((r, position) => {
      tx.insert(draftRows).values({ runId: input.runId, position, ...r, sourceLine: r.sourceLine ?? null }).run();
    });
    const next = run.draftRevision + 1;
    const title = input.meta?.title?.trim();
    if (title !== undefined && (title.length < 1 || title.length > 120)) throw new DomainError('invalid', 'Title must be 1-120 characters.');
    tx.update(payrollRuns).set({
      ...(title ? { title } : {}),
      ...(input.meta?.postingMode ? { postingMode: input.meta.postingMode } : {}),
      ...(input.meta?.source ? { source: input.meta.source } : {}),
      draftRevision: next, updatedAt: input.now,
      draftFilename: input.file?.filename ?? null, draftFileSha256: input.file?.sha256 ?? null,
    }).where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.draftRevision, input.expectedRevision))).run();
    return next;
  }, { behavior: 'immediate' });
}

export function getDraftRows(db: Queryable, runId: string) {
  return db.select().from(draftRows).where(eq(draftRows.runId, runId)).orderBy(asc(draftRows.position)).all();
}

export interface WorkflowSnapshot {
  revision: number;
  kind: WorkflowKind;
  releaseMode: ReleaseMode;
  approvers: { userId: string; chainAccountId: string }[];
  maxRowAmount: string;
  maxRunTotal: string;
}

export interface ValidatedRow extends ReviewRow {
  sourceLine?: number | null;
}

/** Deterministic vault run ID: stable for a given run and version number. */
export function chainRunIdFor(runId: string, versionNo: number): string {
  return `gjn-${runId.replace(/-/g, '').slice(0, 20)}-v${versionNo}`;
}

/**
 * Freezes validated rows into a new immutable version in status `submitting`, with its
 * payout commitment and salted review digest. Rows can only be added in this transaction
 * (a trigger refuses later inserts once the status moves on).
 */
export function createVersion(db: Db, input: {
  runId: string; makerUserId: string; rows: ValidatedRow[]; workflow: WorkflowSnapshot; now: Date;
  postingMode: PostingMode; source?: { filename: string; sha256: string } | null; salt?: Buffer;
  /** The vault contract the version is submitted to. */
  vaultContractId?: string;
  /** Recipient-directory check at submission (Phase 19), frozen with the version. */
  directoryCheck?: { enforced: boolean; matched: number; rows: number } | null;
}) {
  if (input.rows.length < 1 || input.rows.length > 1000) throw new DomainError('invalid', 'A version needs 1-1,000 rows.');
  const leaves: PayoutLeaf[] = input.rows.map((r, index) => ({ index, accountId: r.accountId, amount: r.amount }));
  const tree = buildPayoutTree(leaves);
  if (tree.total > BigInt(input.workflow.maxRunTotal)) throw new DomainError('invalid', 'The run total is above the run cap.');
  if (input.rows.some((r) => r.amount > BigInt(input.workflow.maxRowAmount))) {
    throw new DomainError('invalid', 'A row amount is above the per-row cap.');
  }
  const salt = input.salt ?? randomBytes(32);
  const digest = reviewDigest(salt, input.postingMode, input.rows);
  return db.transaction((tx) => {
    ownedRun(tx, input.runId, input.makerUserId);
    const last = tx.select({ n: max(runVersions.versionNo) }).from(runVersions).where(eq(runVersions.runId, input.runId)).get();
    const versionNo = (last?.n ?? 0) + 1;
    const id = randomUUID();
    const status: VersionStatus = 'submitting';
    tx.insert(runVersions).values({
      id, runId: input.runId, versionNo, chainRunId: chainRunIdFor(input.runId, versionNo), ...(input.vaultContractId ? { vaultContractId: input.vaultContractId } : {}),
      postingMode: input.postingMode, workflowRevision: input.workflow.revision,
      workflowSnapshot: JSON.stringify(input.workflow), rowCount: tree.rowCount, total: tree.total,
      payoutRoot: toHex(tree.root), reviewDigest: toHex(digest), reviewSalt: salt.toString('hex'),
      sourceFilename: input.source?.filename ?? null, sourceSha256: input.source?.sha256 ?? null,
      createdByUserId: input.makerUserId, createdAt: input.now, status, statusUpdatedAt: input.now,
      directoryCheck: input.directoryCheck ? JSON.stringify(input.directoryCheck) : null,
    }).run();
    input.rows.forEach((r, rowIndex) => {
      tx.insert(versionRows).values({
        versionId: id, rowIndex, nearAccountId: r.accountId, receiverName: r.receiverName, currency: r.currency,
        amount: r.amount, mobilePhone: r.mobilePhone, email: r.email, sourceLine: r.sourceLine ?? null,
      }).run();
    });
    return { id, versionNo, chainRunId: chainRunIdFor(input.runId, versionNo), total: tree.total, rowCount: tree.rowCount, payoutRoot: toHex(tree.root) };
  }, { behavior: 'immediate' });
}

/** Moves a version to a new status. Terminal statuses are protected by a trigger. */
export function setVersionStatus(db: Queryable, versionId: string, status: VersionStatus, now: Date, extra: { submitTxHash?: string } = {}) {
  db.update(runVersions).set({ status, statusUpdatedAt: now, ...extra }).where(eq(runVersions.id, versionId)).run();
}

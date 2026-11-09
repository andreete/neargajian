/**
 * Draft use cases for the maker (manual builder; the importer reuses saveDraftRows).
 * Authorization: only the run's maker (policy `run.edit_draft`), checked here as well as in
 * the route. Validation always runs on the server with the active workflow's caps.
 */
import { eq } from 'drizzle-orm';
import { can, type Principal } from '../auth/policy.ts';
import type { Db } from '../db/client.ts';
import { payrollRuns, workflowConfigs, type PostingMode } from '../db/schema.ts';
import { validateRows, type Limits, type RawRow, type ValidationSummary } from '../payroll/validate.ts';
import { DomainError, getDraftRows, replaceDraft, type DraftRowInput } from './repository.ts';
import { importPayrollFile } from '../payroll/import.ts';

export function activeLimits(db: Db): Limits {
  const wf = db.select().from(workflowConfigs).where(eq(workflowConfigs.chainStatus, 'active')).get();
  return { maxRowAmount: wf?.maxRowAmount ?? 1_000_000n, maxRunTotal: wf?.maxRunTotal ?? 100_000_000n };
}

export function toRaw(r: DraftRowInput): RawRow {
  return { near_account_id: r.nearAccountId, receiver_name: r.receiverName, currency: r.currency, amount: r.amount, mobile_phone: r.mobilePhone, email: r.email };
}

export function fromRaw(r: Partial<RawRow>, sourceLine: number | null = null): DraftRowInput {
  const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 500) : '');
  return { nearAccountId: s(r.near_account_id), receiverName: s(r.receiver_name), currency: s(r.currency), amount: s(r.amount), mobilePhone: s(r.mobile_phone), email: s(r.email), sourceLine };
}

/** Loads a run the principal may edit, or throws not_found (no existence leak). */
export function editableRun(db: Db, principal: Principal, runId: string) {
  const run = db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run || !can(principal, 'run.edit_draft', { makerUserId: run.makerUserId, assignedApproverIds: [] })) {
    throw new DomainError('not_found', 'Payroll run not found.');
  }
  return run;
}

export interface DraftView {
  run: { id: string; title: string; postingMode: PostingMode; source: 'manual' | 'upload'; draftRevision: number; draftFilename: string | null; draftFileSha256: string | null };
  rows: (RawRow & { sourceLine: number | null })[];
  summary: ValidationSummary;
}

export function draftView(db: Db, principal: Principal, runId: string): DraftView {
  const run = editableRun(db, principal, runId);
  const rows = getDraftRows(db, runId).map((r) => ({ ...toRaw(r), sourceLine: r.sourceLine }));
  return {
    run: { id: run.id, title: run.title, postingMode: run.postingMode, source: run.source, draftRevision: run.draftRevision, draftFilename: run.draftFilename, draftFileSha256: run.draftFileSha256 },
    rows,
    summary: validateRows(rows, activeLimits(db)),
  };
}

/** Saves the manual draft as entered (invalid rows are kept so the maker can fix them). */
export function saveManualDraft(db: Db, principal: Principal, runId: string, input: {
  expectedRevision: number; title?: string; postingMode?: PostingMode; rows: Partial<RawRow>[]; now: Date;
}) {
  const run = editableRun(db, principal, runId);
  if (run.source !== 'manual') throw new DomainError('invalid', 'This run was created from a file. Upload a corrected file instead.');
  if (input.rows.length > 1000) throw new DomainError('invalid', 'A run has at most 1,000 rows.');
  const revision = replaceDraft(db, {
    runId, makerUserId: principal.id, expectedRevision: input.expectedRevision, now: input.now,
    rows: input.rows.map((r) => fromRaw(r)),
    meta: { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.postingMode ? { postingMode: input.postingMode } : {}) },
  });
  return { revision, summary: validateRows(input.rows, activeLimits(db)) };
}

/**
 * Removes the invalid rows only after the maker explicitly confirmed exactly which rows go.
 * If the server's set of invalid rows differs from the confirmed set, nothing changes.
 */
export function confirmValidSubset(db: Db, principal: Principal, runId: string, input: { expectedRevision: number; removeIndexes: number[]; now: Date }) {
  const view = draftView(db, principal, runId);
  if (view.run.draftRevision !== input.expectedRevision) throw new DomainError('conflict', 'The draft changed in another window. Reload and review again.');
  const invalid = view.summary.rows.filter((r) => !r.valid).map((r) => r.index);
  const confirmed = [...new Set(input.removeIndexes)].sort((a, b) => a - b);
  if (invalid.length === 0) throw new DomainError('invalid', 'There are no invalid rows to remove.');
  if (invalid.length !== confirmed.length || invalid.some((x, i) => x !== confirmed[i])) {
    throw new DomainError('conflict', 'The rows to remove no longer match the invalid rows. Review the draft again.');
  }
  const keep = view.rows.filter((_, i) => !invalid.includes(i));
  if (keep.length === 0) throw new DomainError('invalid', 'Every row is invalid. Fix at least one row first.');
  const revision = replaceDraft(db, {
    runId, makerUserId: principal.id, expectedRevision: input.expectedRevision, now: input.now,
    rows: keep.map((r) => fromRaw(r, r.sourceLine)),
  });
  return { revision, removed: invalid.length, summary: validateRows(keep, activeLimits(db)) };
}

/**
 * Upload: validate the whole file first; only an accepted file replaces the draft (atomic,
 * with file name, SHA-256 and each row's source line). A rejected file changes nothing.
 */
export function uploadToDraft(db: Db, principal: Principal, runId: string, input: {
  filename: string; bytes: Uint8Array; expectedRevision: number; now: Date;
}) {
  const run = editableRun(db, principal, runId);
  if (run.source !== 'upload') throw new DomainError('invalid', 'This run uses manual entry. Create an upload run to import a file.');
  if (run.draftRevision !== input.expectedRevision) throw new DomainError('conflict', 'The draft changed in another window. Reload and upload again.');
  const result = importPayrollFile({ filename: input.filename, bytes: input.bytes, limits: activeLimits(db) });
  if (!result.ok) return { result, revision: run.draftRevision };
  const revision = replaceDraft(db, {
    runId, makerUserId: principal.id, expectedRevision: input.expectedRevision, now: input.now,
    rows: result.rows.map((r) => fromRaw(r.raw, r.line)),
    file: { filename: result.filename, sha256: result.sha256 },
    meta: { source: 'upload' },
  });
  return { result, revision };
}

export function setPostingMode(db: Db, principal: Principal, runId: string, postingMode: PostingMode, now: Date) {
  editableRun(db, principal, runId);
  db.update(payrollRuns).set({ postingMode, updatedAt: now }).where(eq(payrollRuns.id, runId)).run();
}

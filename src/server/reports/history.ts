/**
 * Transaction history and accounting exports (Phase 13, PRD J07).
 * - Scope: maker → own runs; approver → runs they are assigned to; admin → all runs, but
 *   company-level only (never recipient identity, contact, wallet or recipient tx links).
 * - Consolidated view: one line per fully paid run. Detailed view: one line per paid payout
 *   line. Both come from the same confirmed payout records and must reconcile exactly.
 * - Company CSV follows each run's posting mode locked at submission; the recipient-detail
 *   CSV is a separate, separately authorized export.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { can, type Principal } from '../auth/policy.ts';
import type { Db } from '../db/client.ts';
import { payoutActions, payrollRuns, reportEntries, runVersions, versionRows } from '../db/schema.ts';
import { formatAmount } from '../money.ts';
import { escapeCsvCell } from '../payroll/error-report.ts';
import { contextOf } from '../runs/lifecycle.ts';
import { referenceBase } from './entries.ts';
import { displayStatusFor } from '../runs/status.ts';
import type { RunStatus } from '../../components/status-chip.tsx';

export interface PaidLine {
  reference: string;
  lineNo: number;
  rowIndex: number;
  amount: bigint;
  paidAt: Date | null;
  /** Recipient fields: only present when the caller may see recipient details. */
  recipient: { accountId: string; name: string; email: string; sourceLine: number | null; txHash: string | null } | null;
}

export interface HistoryRun {
  runId: string;
  versionId: string;
  title: string;
  versionNo: number;
  postingMode: 'consolidated' | 'detailed';
  status: string;
  /** Same derived status as the run page (never Paid before every payout is confirmed). */
  displayStatus: RunStatus;
  chainRunId: string;
  rowCount: number;
  total: bigint;
  confirmedTotal: bigint;
  paidCount: number;
  paidAt: Date | null;
  reference: string;
  lines: PaidLine[];
}

export interface History {
  paid: HistoryRun[];
  inProgress: HistoryRun[];
  totals: { runs: number; lines: number; consolidatedTotal: bigint; detailedTotal: bigint; reconciles: boolean };
  canExportRecipients: boolean;
}

function visibleRunIds(db: Db, principal: Principal): string[] {
  const runs = db.select({ id: payrollRuns.id }).from(payrollRuns).all();
  return runs.map((r) => r.id).filter((id) => {
    if (principal.role === 'admin') return true;
    const ctx = contextOf(db, id);
    return ctx ? can(principal, 'run.view', ctx) : false;
  });
}

export function historyFor(db: Db, principal: Principal): History {
  const ids = visibleRunIds(db, principal);
  const out: History = { paid: [], inProgress: [], totals: { runs: 0, lines: 0, consolidatedTotal: 0n, detailedTotal: 0n, reconciles: true }, canExportRecipients: false };
  if (!ids.length) return out;
  const versions = db.select({ v: runVersions, title: payrollRuns.title }).from(runVersions).innerJoin(payrollRuns, eq(runVersions.runId, payrollRuns.id))
    .where(and(inArray(runVersions.runId, ids), inArray(runVersions.status, ['paid', 'partially_paid', 'releasing']))).all();
  for (const { v, title } of versions) {
    const ctx = contextOf(db, v.runId)!;
    const recipientsAllowed = can(principal, 'report.recipients', ctx);
    if (recipientsAllowed) out.canExportRecipients = true;
    const rows = db.select().from(versionRows).where(eq(versionRows.versionId, v.id)).orderBy(versionRows.rowIndex).all();
    const paidActions = db.select().from(payoutActions).where(and(eq(payoutActions.versionId, v.id), eq(payoutActions.kind, 'pay_row'), eq(payoutActions.status, 'succeeded'))).all();
    const paidBy = new Map(paidActions.map((a) => [a.rowIndex, a]));
    const entries = db.select().from(reportEntries).where(eq(reportEntries.versionId, v.id)).all();
    const base = referenceBase(v.id);
    const lines: PaidLine[] = rows.filter((r) => paidBy.has(r.rowIndex)).map((r, i) => {
      const a = paidBy.get(r.rowIndex)!;
      const detailedRef = entries.find((e) => e.rowIndex === r.rowIndex)?.reference ?? `${base}-${String(i + 1).padStart(4, '0')}`;
      return {
        reference: detailedRef, lineNo: r.rowIndex + 1, rowIndex: r.rowIndex, amount: r.amount, paidAt: a.updatedAt,
        recipient: recipientsAllowed ? { accountId: r.nearAccountId, name: r.receiverName, email: r.email, sourceLine: r.sourceLine, txHash: a.txHash } : null,
      };
    });
    const confirmed = lines.reduce((s, l) => s + l.amount, 0n);
    const paidAt = lines.reduce<Date | null>((m, l) => (l.paidAt && (!m || l.paidAt > m) ? l.paidAt : m), null);
    const run: HistoryRun = {
      runId: v.runId, versionId: v.id, title, versionNo: v.versionNo, postingMode: v.postingMode, status: v.status, displayStatus: displayStatusFor(db, v), chainRunId: v.chainRunId,
      rowCount: v.rowCount, total: v.total, confirmedTotal: confirmed, paidCount: lines.length, paidAt,
      reference: entries.find((e) => e.rowIndex === null)?.reference ?? base, lines,
    };
    if (v.status === 'paid' && lines.length === v.rowCount && confirmed === v.total) out.paid.push(run);
    else out.inProgress.push(run);
  }
  out.paid.sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));
  const consolidatedTotal = out.paid.reduce((s, r) => s + r.total, 0n);
  const detailedTotal = out.paid.reduce((s, r) => s + r.lines.reduce((x, l) => x + l.amount, 0n), 0n);
  out.totals = { runs: out.paid.length, lines: out.paid.reduce((s, r) => s + r.lines.length, 0), consolidatedTotal, detailedTotal, reconciles: consolidatedTotal === detailedTotal };
  return out;
}

/** UTC timestamp to whole seconds (accounting exports do not carry milliseconds). */
const iso = (d: Date | null) => (d ? d.toISOString().replace(/\.\d{3}Z$/, 'Z') : '');

/** Company CSV: fully paid runs only, each in its locked posting mode. No recipient fields. */
export function companyCsv(db: Db, principal: Principal): string {
  const h = historyFor(db, principal);
  const lines = [['reference', 'posting_mode', 'run_title', 'run_version', 'vault_run_id', 'line', 'paid_at_utc', 'amount', 'currency', 'status'].join(',')];
  for (const r of h.paid) {
    if (r.postingMode === 'consolidated') {
      lines.push([escapeCsvCell(r.reference), 'consolidated', escapeCsvCell(r.title), String(r.versionNo), r.chainRunId, '', iso(r.paidAt), formatAmount(r.total), 'tUSDC', 'paid'].join(','));
    } else {
      for (const l of r.lines) lines.push([escapeCsvCell(l.reference), 'detailed', escapeCsvCell(r.title), String(r.versionNo), r.chainRunId, String(l.lineNo), iso(l.paidAt), formatAmount(l.amount), 'tUSDC', 'paid'].join(','));
    }
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Recipient-detail CSV: only lines of runs the caller may see recipient details for. */
export function recipientCsv(db: Db, principal: Principal, explorerTxUrl: string): string {
  const h = historyFor(db, principal);
  const lines = [['reference', 'run_title', 'run_version', 'file_row', 'near_account_id', 'receiver_name', 'email', 'paid_at_utc', 'amount', 'currency', 'tx_hash', 'explorer_url'].join(',')];
  for (const r of h.paid) {
    for (const l of r.lines) {
      if (!l.recipient) continue;
      lines.push([
        escapeCsvCell(l.reference), escapeCsvCell(r.title), String(r.versionNo), l.recipient.sourceLine === null ? '' : String(l.recipient.sourceLine),
        escapeCsvCell(l.recipient.accountId), escapeCsvCell(l.recipient.name), escapeCsvCell(l.recipient.email), iso(l.paidAt), formatAmount(l.amount), 'tUSDC',
        l.recipient.txHash ?? '', l.recipient.txHash ? `${explorerTxUrl}${l.recipient.txHash}` : '',
      ].join(','));
    }
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

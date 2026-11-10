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
import { advanceLedger } from '../db/schema.ts';
import { deductionsOf, runKinds, syncAdvances } from '../advance/ledger.ts';
import { monthKey, monthLabel } from '../advance/terms.ts';

export interface PaidLine {
  reference: string;
  lineNo: number;
  rowIndex: number;
  /** Net: the amount paid on-chain. */
  amount: bigint;
  /** Payroll rows: gross pay and the Payroll Advance instalment (amount = gross − instalment). */
  gross: bigint;
  instalment: bigint;
  /** Advance runs: the advance owed by the employee and the fee (amount = advance − fee). */
  advance: bigint;
  fee: bigint;
  /** Timestamp of the block that includes the payout's pay_row transaction (explorer time). */
  paidAt: Date | null;
  /** Recipient fields: only present when the caller may see recipient details. */
  recipient: { accountId: string; name: string; email: string; sourceLine: number | null; txHash: string | null } | null;
}

export interface HistoryRun {
  runId: string;
  versionId: string;
  title: string;
  /** Phase 23: payroll or a Payroll Advance run. */
  kind: 'payroll' | 'advance';
  /** Company-level title: an advance run never shows the employee's name ("Payroll Advance, November 2026"). */
  companyTitle: string;
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
  totals: {
    runs: number; lines: number; consolidatedTotal: bigint; detailedTotal: bigint; reconciles: boolean;
    /** Phase 23 (paid runs in view): payroll gross, instalments, advances owed, fees; ledger check. */
    grossTotal: bigint; instalmentTotal: bigint; advanceTotal: bigint; feeTotal: bigint; outstanding: bigint; ledgerMatches: boolean;
  };
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
  syncAdvances(db);
  const ids = visibleRunIds(db, principal);
  const zero = { grossTotal: 0n, instalmentTotal: 0n, advanceTotal: 0n, feeTotal: 0n, outstanding: 0n, ledgerMatches: true };
  const out: History = { paid: [], inProgress: [], totals: { runs: 0, lines: 0, consolidatedTotal: 0n, detailedTotal: 0n, reconciles: true, ...zero }, canExportRecipients: false };
  if (!ids.length) return out;
  const versions = db.select({ v: runVersions, title: payrollRuns.title }).from(runVersions).innerJoin(payrollRuns, eq(runVersions.runId, payrollRuns.id))
    .where(and(inArray(runVersions.runId, ids), inArray(runVersions.status, ['paid', 'partially_paid', 'releasing']))).all();
  const kinds = runKinds(db, [...new Set(versions.map((x) => x.v.runId))]);
  const deds = deductionsOf(db, { versionIds: versions.map((x) => x.v.id) });
  for (const { v, title } of versions) {
    const k = kinds.get(v.runId);
    const adv = k?.kind === 'advance' ? k.advance : null;
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
      const d = deds.find((x) => x.versionId === v.id && x.rowIndex === r.rowIndex);
      return {
        reference: detailedRef, lineNo: r.rowIndex + 1, rowIndex: r.rowIndex, amount: r.amount, paidAt: a.chainBlockTime,
        gross: adv ? 0n : d ? d.gross : r.amount, instalment: d ? d.instalment : 0n, advance: adv ? adv.amount : 0n, fee: adv ? adv.fee : 0n,
        recipient: recipientsAllowed ? { accountId: r.nearAccountId, name: r.receiverName, email: r.email, sourceLine: r.sourceLine, txHash: a.txHash } : null,
      };
    });
    const confirmed = lines.reduce((s, l) => s + l.amount, 0n);
    const paidAt = lines.reduce<Date | null>((m, l) => (l.paidAt && (!m || l.paidAt > m) ? l.paidAt : m), null);
    const run: HistoryRun = {
      runId: v.runId, versionId: v.id, title, kind: adv ? 'advance' : 'payroll', companyTitle: adv ? `Payroll Advance, ${monthLabel(monthKey(v.createdAt))}` : title, versionNo: v.versionNo, postingMode: v.postingMode, status: v.status, displayStatus: displayStatusFor(db, v), chainRunId: v.chainRunId,
      rowCount: v.rowCount, total: v.total, confirmedTotal: confirmed, paidCount: lines.length, paidAt,
      reference: entries.find((e) => e.rowIndex === null)?.reference ?? base, lines,
    };
    // Reports need every paid time from the chain; until the block times are read, the run waits.
    if (v.status === 'paid' && lines.length === v.rowCount && confirmed === v.total && lines.every((l) => l.paidAt)) out.paid.push(run);
    else out.inProgress.push(run);
  }
  out.paid.sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));
  const consolidatedTotal = out.paid.reduce((s, r) => s + r.total, 0n);
  const detailedTotal = out.paid.reduce((s, r) => s + r.lines.reduce((x, l) => x + l.amount, 0n), 0n);
  const lines = out.paid.flatMap((r) => r.lines);
  const sum = (k: 'gross' | 'instalment' | 'advance' | 'fee') => lines.reduce((s, l) => s + l[k], 0n);
  // The ledger, for exactly the paid versions in view, must agree with the lines.
  const ledger = out.paid.length ? db.select({ kind: advanceLedger.kind, amount: advanceLedger.amount }).from(advanceLedger).where(inArray(advanceLedger.versionId, out.paid.map((r) => r.versionId))).all() : [];
  const ledgerAdvances = ledger.filter((l) => l.kind === 'advance').reduce((s, l) => s + l.amount, 0n);
  const ledgerInstalments = ledger.filter((l) => l.kind === 'instalment').reduce((s, l) => s + l.amount, 0n);
  const grossTotal = sum('gross');
  const instalmentTotal = sum('instalment');
  const advanceTotal = sum('advance');
  const feeTotal = sum('fee');
  // Every paid line's net = gross − instalment (payroll) or advance − fee (advance).
  const linesConsistent = lines.every((l) => (l.advance > 0n ? l.amount === l.advance - l.fee : l.amount === l.gross - l.instalment));
  const ledgerMatches = ledgerAdvances === advanceTotal && ledgerInstalments === instalmentTotal;
  out.totals = {
    runs: out.paid.length, lines: lines.length, consolidatedTotal, detailedTotal,
    reconciles: consolidatedTotal === detailedTotal && linesConsistent && ledgerMatches,
    grossTotal, instalmentTotal, advanceTotal, feeTotal, outstanding: advanceTotal - instalmentTotal, ledgerMatches,
  };
  return out;
}

/** UTC timestamp to whole seconds (accounting exports do not carry milliseconds). */
const iso = (d: Date | null) => (d ? d.toISOString().replace(/\.\d{3}Z$/, 'Z') : '');

/** Company CSV: fully paid runs only, each in its locked posting mode. No recipient fields. */
export function companyCsv(db: Db, principal: Principal): string {
  const h = historyFor(db, principal);
  const lines = [['reference', 'posting_mode', 'run_kind', 'run_title', 'run_version', 'vault_run_id', 'line', 'paid_at_utc', 'gross_amount', 'advance_instalment', 'advance_amount', 'advance_fee', 'amount', 'currency', 'status'].join(',')];
  const money = (ls: PaidLine[]) => (['gross', 'instalment', 'advance', 'fee'] as const).map((k) => formatAmount(ls.reduce((s, l) => s + l[k], 0n)));
  for (const r of h.paid) {
    // Company-level: an advance run's title never carries the employee's name.
    if (r.postingMode === 'consolidated') {
      lines.push([escapeCsvCell(r.reference), 'consolidated', r.kind, escapeCsvCell(r.companyTitle), String(r.versionNo), r.chainRunId, '', iso(r.paidAt), ...money(r.lines), formatAmount(r.total), 'tUSDC', 'paid'].join(','));
    } else {
      for (const l of r.lines) lines.push([escapeCsvCell(l.reference), 'detailed', r.kind, escapeCsvCell(r.companyTitle), String(r.versionNo), r.chainRunId, String(l.lineNo), iso(l.paidAt), ...money([l]), formatAmount(l.amount), 'tUSDC', 'paid'].join(','));
    }
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Recipient-detail CSV: only lines of runs the caller may see recipient details for. */
export function recipientCsv(db: Db, principal: Principal, explorerTxUrl: string): string {
  const h = historyFor(db, principal);
  const lines = [['reference', 'run_kind', 'run_title', 'run_version', 'file_row', 'near_account_id', 'receiver_name', 'email', 'paid_at_utc', 'gross_amount', 'advance_instalment', 'advance_amount', 'advance_fee', 'amount', 'currency', 'tx_hash', 'explorer_url'].join(',')];
  for (const r of h.paid) {
    for (const l of r.lines) {
      if (!l.recipient) continue;
      lines.push([
        escapeCsvCell(l.reference), r.kind, escapeCsvCell(r.title), String(r.versionNo), l.recipient.sourceLine === null ? '' : String(l.recipient.sourceLine),
        escapeCsvCell(l.recipient.accountId), escapeCsvCell(l.recipient.name), escapeCsvCell(l.recipient.email), iso(l.paidAt),
        formatAmount(l.gross), formatAmount(l.instalment), formatAmount(l.advance), formatAmount(l.fee), formatAmount(l.amount), 'tUSDC',
        l.recipient.txHash ?? '', l.recipient.txHash ? `${explorerTxUrl}${l.recipient.txHash}` : '',
      ].join(','));
    }
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

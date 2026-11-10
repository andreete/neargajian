/**
 * Payroll Advance repayment through payroll (Phase 23): which instalment a payroll row carries,
 * and the append-only ledger.
 *
 * - An instalment is frozen with the payroll version that carries it (advance_deductions). It is
 *   "pending" while the version is live, "repaid" once that row's payout is confirmed, and
 *   "released" when the version is cancelled, rejected or failed, or the row was not paid.
 * - The ledger (advance_ledger) records the advance when its one-row run is paid on-chain and each
 *   instalment when the payroll row that carries it is paid. Nothing is ever edited or removed.
 * - syncAdvances() derives request statuses and ledger entries from the confirmed payout records.
 *   It is idempotent and runs after every reconciliation (worker, run pages) and on the advance
 *   pages. It never sends anything to the chain.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db, Queryable } from '../db/client.ts';
import {
  advanceDeductions, advanceLedger, approvalEvents, auditEvents, payoutActions, payrollAdvances, payrollRuns, recipients, runVersions,
  type AdvanceStatus, type VersionStatus,
} from '../db/schema.ts';
import { deductionFor, monthKey, scheduleFor } from './terms.ts';

export type Advance = typeof payrollAdvances.$inferSelect;

const LIVE: VersionStatus[] = ['submitting', 'pending_approval', 'approved', 'releasing'];

/** Rows of a version whose pay_row is confirmed. */
function paidRowsOf(db: Queryable, versionIds: string[]): Map<string, { txHash: string | null; at: Date }> {
  const out = new Map<string, { txHash: string | null; at: Date }>();
  if (!versionIds.length) return out;
  for (const a of db.select().from(payoutActions).where(and(inArray(payoutActions.versionId, versionIds), eq(payoutActions.kind, 'pay_row'), eq(payoutActions.status, 'succeeded'))).all()) {
    out.set(`${a.versionId}:${a.rowIndex}`, { txHash: a.txHash, at: a.chainBlockTime ?? a.updatedAt });
  }
  return out;
}

export type DeductionState = 'pending' | 'repaid' | 'released';

export interface DeductionRecord {
  versionId: string; rowIndex: number; advanceId: string; recipientId: string; month: string;
  gross: bigint; instalment: bigint; net: bigint; createdAt: Date;
  versionStatus: VersionStatus; state: DeductionState; runId: string; paidTxHash: string | null; paidAt: Date | null;
}

export function deductionsOf(db: Queryable, where: { advanceIds?: string[]; versionIds?: string[] }): DeductionRecord[] {
  const cond = where.advanceIds ? inArray(advanceDeductions.advanceId, where.advanceIds) : where.versionIds ? inArray(advanceDeductions.versionId, where.versionIds) : undefined;
  if ((where.advanceIds && !where.advanceIds.length) || (where.versionIds && !where.versionIds.length)) return [];
  const rows = db.select({ d: advanceDeductions, status: runVersions.status, runId: runVersions.runId }).from(advanceDeductions)
    .innerJoin(runVersions, eq(advanceDeductions.versionId, runVersions.id)).where(cond).all();
  const paid = paidRowsOf(db, [...new Set(rows.map((r) => r.d.versionId))]);
  return rows.map(({ d, status, runId }) => {
    const p = paid.get(`${d.versionId}:${d.rowIndex}`);
    const state: DeductionState = p ? 'repaid' : LIVE.includes(status) ? 'pending' : 'released';
    return { ...d, versionStatus: status, state, runId, paidTxHash: p?.txHash ?? null, paidAt: p?.at ?? null };
  }).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.versionId.localeCompare(b.versionId));
}

/** Repayment position of one advance from its frozen instalments. */
export function repaymentOf(db: Queryable, advance: Advance) {
  const records = deductionsOf(db, { advanceIds: [advance.id] });
  const counted = records.filter((r) => r.state !== 'released');
  const repaid = counted.filter((r) => r.state === 'repaid').reduce((s, r) => s + r.instalment, 0n);
  const pending = counted.filter((r) => r.state === 'pending').reduce((s, r) => s + r.instalment, 0n);
  const months = [...new Set(counted.map((r) => r.month))].sort();
  return { records, repaid, pending, deducted: repaid + pending, firstMonth: months[0] ?? null, months: new Set(months), balance: advance.amount - repaid };
}

export interface PlannedDeduction {
  rowIndex: number; recipientId: string; advanceId: string; name: string; accountId: string;
  gross: bigint; instalment: bigint; net: bigint; month: string; due: bigint; carried: bigint;
}

/**
 * The Payroll Advance instalments a payroll run would carry if submitted now. Only advances that
 * were paid out (status `paid`) are repaid; one row per employee (the first) carries it.
 */
export function planDeductions(db: Queryable, rows: { accountId: string; amount: bigint }[], now: Date): PlannedDeduction[] {
  const open = db.select({ a: payrollAdvances, account: recipients.nearAccountId, name: recipients.name }).from(payrollAdvances)
    .innerJoin(recipients, eq(payrollAdvances.recipientId, recipients.id)).where(eq(payrollAdvances.status, 'paid')).all();
  if (!open.length) return [];
  const byAccount = new Map(open.map((o) => [o.account, o]));
  const month = monthKey(now);
  const seen = new Set<string>();
  const out: PlannedDeduction[] = [];
  rows.forEach((row, rowIndex) => {
    const hit = byAccount.get(row.accountId);
    if (!hit || seen.has(row.accountId)) return;
    seen.add(row.accountId);
    const pos = repaymentOf(db, hit.a);
    const d = deductionFor({
      schedule: scheduleFor(hit.a.amount, hit.a.instalmentCount).amounts, firstMonth: pos.firstMonth, month,
      alreadyDeducted: pos.deducted, monthAlreadyDeducted: pos.months.has(month), gross: row.amount,
    });
    if (d.instalment <= 0n) return;
    out.push({ rowIndex, recipientId: hit.a.recipientId, advanceId: hit.a.id, name: hit.name, accountId: row.accountId, gross: row.amount, instalment: d.instalment, net: d.net, month, due: d.due, carried: d.carried });
  });
  return out;
}

/** A short fingerprint of a plan: the review page sends it back with the submission. */
export function planFingerprint(plan: PlannedDeduction[]): string {
  return plan.map((p) => `${p.rowIndex}:${p.advanceId}:${p.instalment}:${p.month}`).join('|');
}

/** Same plan, compared field by field (the review the maker saw vs. the plan at submission). */
export function samePlan(a: PlannedDeduction[], b: PlannedDeduction[]): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i]!;
    return x.rowIndex === y.rowIndex && x.advanceId === y.advanceId && x.instalment === y.instalment && x.gross === y.gross && x.month === y.month;
  });
}

export function insertDeductions(db: Queryable, versionId: string, plan: PlannedDeduction[], now: Date) {
  for (const d of plan) {
    db.insert(advanceDeductions).values({ versionId, rowIndex: d.rowIndex, advanceId: d.advanceId, recipientId: d.recipientId, month: d.month, gross: d.gross, instalment: d.instalment, net: d.net, createdAt: now }).run();
  }
}

// ------------------------------------------------------------------ sync

const STATUS_FROM_VERSION: Partial<Record<VersionStatus, AdvanceStatus>> = {
  submitting: 'submitted', pending_approval: 'submitted', approved: 'approved', releasing: 'approved',
  rejected: 'rejected', cancelled: 'cancelled', partially_paid: 'failed',
};

/**
 * Brings request statuses and the ledger in line with the confirmed records. Returns the number of
 * ledger entries added. Safe to call any time, from any process (one immediate transaction).
 */
export function syncAdvances(db: Db, now = new Date()): number {
  return db.transaction((tx) => {
    let added = 0;
    const advances = tx.select().from(payrollAdvances).where(inArray(payrollAdvances.status, ['requested', 'submitted', 'approved', 'paid'])).all();
    if (!advances.length) return 0;

    // 1. The advance's own run: status and, once its row is paid on-chain, the ledger entry.
    for (const adv of advances.filter((a) => a.runId && a.status !== 'paid')) {
      const v = tx.select().from(runVersions).where(eq(runVersions.runId, adv.runId!)).orderBy(sql`${runVersions.versionNo} DESC`).get();
      if (!v) continue;
      const paid = paidRowsOf(tx, [v.id]).get(`${v.id}:0`);
      if (paid) {
        const r = tx.insert(advanceLedger).values({ advanceId: adv.id, recipientId: adv.recipientId, kind: 'advance', amount: adv.amount, versionId: v.id, rowIndex: 0, txHash: paid.txHash, at: paid.at })
          .onConflictDoNothing().run();
        added += r.changes;
        tx.update(payrollAdvances).set({ status: 'paid', paidAt: paid.at, updatedAt: now }).where(eq(payrollAdvances.id, adv.id)).run();
        tx.insert(auditEvents).values({ at: now, actorUserId: null, action: 'advance.paid', entityType: 'payroll_advance', entityId: adv.id, detail: JSON.stringify({ versionId: v.id }) }).run();
        continue;
      }
      let next = STATUS_FROM_VERSION[v.status];
      let detail: string | null = adv.statusDetail;
      if (v.status === 'submit_failed') { next = 'requested'; detail = `The submission to the vault failed (${v.statusDetail ?? 'refused'}). The maker can submit it again.`; }
      if (v.status === 'rejected') {
        const ev = tx.select().from(approvalEvents).where(and(eq(approvalEvents.versionId, v.id), eq(approvalEvents.decision, 'reject'), eq(approvalEvents.status, 'confirmed'))).get();
        detail = ev?.reason ?? 'Rejected by an approver.';
      }
      if (v.status === 'cancelled') detail = 'The maker cancelled the run before payment.';
      if (v.status === 'partially_paid') detail = 'The payout failed on-chain; nothing was received.';
      if (next && (next !== adv.status || detail !== adv.statusDetail)) {
        tx.update(payrollAdvances).set({ status: next, statusDetail: detail, updatedAt: now }).where(eq(payrollAdvances.id, adv.id)).run();
      }
    }

    // 2. Instalments: each paid payroll row that carries one.
    const paidAdvances = tx.select().from(payrollAdvances).where(eq(payrollAdvances.status, 'paid')).all();
    if (paidAdvances.length) {
      for (const d of deductionsOf(tx, { advanceIds: paidAdvances.map((a) => a.id) })) {
        if (d.state !== 'repaid') continue;
        const r = tx.insert(advanceLedger).values({ advanceId: d.advanceId, recipientId: d.recipientId, kind: 'instalment', amount: d.instalment, versionId: d.versionId, rowIndex: d.rowIndex, txHash: d.paidTxHash, at: d.paidAt ?? now })
          .onConflictDoNothing().run();
        added += r.changes;
      }
      // 3. Fully repaid → closed (a new request is possible).
      for (const adv of paidAdvances) {
        const repaid = ledgerTotals(tx, adv.id).instalments;
        if (repaid >= adv.amount) {
          tx.update(payrollAdvances).set({ status: 'repaid', repaidAt: now, updatedAt: now }).where(eq(payrollAdvances.id, adv.id)).run();
          tx.insert(auditEvents).values({ at: now, actorUserId: null, action: 'advance.repaid', entityType: 'payroll_advance', entityId: adv.id, detail: '{}' }).run();
        }
      }
    }
    return added;
  }, { behavior: 'immediate' });
}

export function ledgerTotals(db: Queryable, advanceId: string) {
  const rows = db.select({ kind: advanceLedger.kind, amount: advanceLedger.amount }).from(advanceLedger).where(eq(advanceLedger.advanceId, advanceId)).all();
  return {
    advance: rows.filter((r) => r.kind === 'advance').reduce((s, r) => s + r.amount, 0n),
    instalments: rows.filter((r) => r.kind === 'instalment').reduce((s, r) => s + r.amount, 0n),
  };
}

export function ledgerOf(db: Queryable, recipientId: string) {
  return db.select().from(advanceLedger).where(eq(advanceLedger.recipientId, recipientId)).orderBy(advanceLedger.id).all();
}

/** Company totals from the ledger: advances paid, instalments repaid, outstanding. */
export function companyLedgerTotals(db: Queryable) {
  const rows = db.select({ kind: advanceLedger.kind, amount: advanceLedger.amount }).from(advanceLedger).all();
  const advances = rows.filter((r) => r.kind === 'advance').reduce((s, r) => s + r.amount, 0n);
  const instalments = rows.filter((r) => r.kind === 'instalment').reduce((s, r) => s + r.amount, 0n);
  return { advances, instalments, outstanding: advances - instalments };
}

/** The kind and advance of each run (for history and reports). */
export function runKinds(db: Queryable, runIds: string[]) {
  if (!runIds.length) return new Map<string, { kind: 'payroll' | 'advance'; advance: Advance | null }>();
  const runs = db.select({ id: payrollRuns.id, kind: payrollRuns.kind, advanceId: payrollRuns.advanceId }).from(payrollRuns).where(inArray(payrollRuns.id, runIds)).all();
  const advIds = runs.flatMap((r) => (r.advanceId ? [r.advanceId] : []));
  const advs = advIds.length ? db.select().from(payrollAdvances).where(inArray(payrollAdvances.id, advIds)).all() : [];
  return new Map(runs.map((r) => [r.id, { kind: r.kind, advance: advs.find((a) => a.id === r.advanceId) ?? null }]));
}

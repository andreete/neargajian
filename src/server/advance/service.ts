/**
 * Payroll Advance use cases (Phase 23). A salary advance repaid like a loan: the employee asks
 * for an amount A with explicit consent to the salary deductions; the maker declines it or
 * submits it as an ordinary ONE-ROW run (A − fee) through the normal create_run and the vault's
 * approvals; the instalments come back through payroll (ledger.ts). No contract change.
 *
 * Authorization: employees act only on their own linked recipient; the maker (run owner) declines
 * or submits; approvers see the advance only through a run assigned to them. Every check runs on
 * the server; two requests at the same moment cannot both succeed (immediate transaction + the
 * partial unique index payroll_advances_one_open_uq).
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Principal } from '../auth/policy.ts';
import type { VaultClient } from '../chain/vault-client.ts';
import type { Db, Queryable } from '../db/client.ts';
import {
  auditEvents, draftRows, payoutActions, payrollAdvances, payrollRuns, recipients, runVersions, testnetRunRows, testnetRuns, users, versionRows,
  type AdvanceStatus,
} from '../db/schema.ts';
import { formatAmount, formatAmountShort, parseAmount } from '../money.ts';
import { createRun, DomainError } from '../runs/repository.ts';
import { submitRun, type SubmitResult } from '../runs/lifecycle.ts';
import { advanceApprovalProblem, eligibilityFor, expectedMonths, failedChecks, type Eligibility, type Recipient } from './eligibility.ts';
export { advanceApprovalProblem };
import { deductionsOf, ledgerOf, repaymentOf, syncAdvances, type Advance, type DeductionRecord } from './ledger.ts';
import { getPolicy } from './policy.ts';
import { addMonths, CONSENT_TEXT, MIN_ADVANCE, monthKey, monthLabel, termsFor, type AdvancePolicy } from './terms.ts';

export const MAX_ADVANCE_REASON = 200;
export const MAX_DECLINE_REASON = 500;

export const ADVANCE_STATUS_LABEL: Record<AdvanceStatus, string> = {
  requested: 'Requested', declined: 'Declined', submitted: 'Submitted', approved: 'Approved', paid: 'Paid',
  repaid: 'Repaid', rejected: 'Rejected', cancelled: 'Cancelled', failed: 'Payout failed',
};

function audit(db: Queryable, actor: string | null, action: string, id: string, detail: Record<string, unknown>, now: Date) {
  db.insert(auditEvents).values({ at: now, actorUserId: actor, action, entityType: 'payroll_advance', entityId: id, detail: JSON.stringify(detail) }).run();
}

/** The directory recipient an employee login is linked to. */
export function employeeRecipient(db: Queryable, principal: Principal): Recipient {
  if (principal.role !== 'employee') throw new DomainError('forbidden', 'Only employees use Payroll Advance self-service.');
  const u = db.select({ recipientId: users.recipientId }).from(users).where(eq(users.id, principal.id)).get();
  const r = u?.recipientId ? db.select().from(recipients).where(eq(recipients.id, u.recipientId)).get() : undefined;
  if (!r) throw new DomainError('not_found', 'Your login is not linked to a recipient. Ask the admin.');
  return r;
}

export function getAdvance(db: Queryable, id: string): Advance {
  const a = db.select().from(payrollAdvances).where(eq(payrollAdvances.id, id)).get();
  if (!a) throw new DomainError('not_found', 'Payroll Advance request not found.');
  return a;
}

// ------------------------------------------------------------------ request (employee)

export interface AdvanceRequestInput { amount?: unknown; reason?: unknown; consent?: unknown }

export function requestAdvance(db: Db, principal: Principal, input: AdvanceRequestInput, now = new Date()): Advance {
  const recipient = employeeRecipient(db, principal);
  const policy = getPolicy(db);
  const parsed = typeof input.amount === 'string' ? parseAmount(input.amount.trim()) : null;
  if (!parsed || !parsed.ok) throw new DomainError('invalid', `Amount: ${parsed && !parsed.ok ? parsed.message : 'enter an amount in tUSDC, e.g. 0.30.'}`);
  const reason = typeof input.reason === 'string' ? input.reason.trim().replace(/\s+/g, ' ') : '';
  if (reason.length > MAX_ADVANCE_REASON) throw new DomainError('invalid', `Reason: at most ${MAX_ADVANCE_REASON} characters.`);
  if (input.consent !== true) throw new DomainError('invalid', `Tick “${CONSENT_TEXT(policy.instalments)}” to request the advance.`);
  const id = randomUUID();
  try {
    return db.transaction((tx) => {
      const fresh = tx.select().from(recipients).where(eq(recipients.id, recipient.id)).get()!;
      const e = eligibilityFor(tx, fresh, { now, policy });
      if (!e.eligible) throw new DomainError('invalid', `Not eligible for a Payroll Advance now: ${failedChecks(e)}.`);
      const amount = parsed.value;
      if (amount < MIN_ADVANCE || amount > BigInt(e.max)) throw new DomainError('invalid', `Choose an amount from 0.01 to ${formatAmountShort(BigInt(e.max))} tUSDC.`);
      const t = termsFor(amount, policy);
      tx.insert(payrollAdvances).values({
        id, recipientId: fresh.id, employeeUserId: principal.id, amount, fee: t.fee, net: t.net, instalmentCount: policy.instalments,
        instalment: t.schedule.regular, lastInstalment: t.schedule.last, reason: reason || null,
        consentText: CONSENT_TEXT(policy.instalments), consentedAt: now, expectedMonths: JSON.stringify(expectedMonths(tx, fresh, policy.instalments, now)),
        policySnapshot: JSON.stringify(policy), eligibilityAtRequest: JSON.stringify(e), status: 'requested', createdAt: now, updatedAt: now,
      }).run();
      audit(tx, principal.id, 'advance.requested', id, { amount: amount.toString(), fee: t.fee.toString(), instalments: policy.instalments }, now);
      return tx.select().from(payrollAdvances).where(eq(payrollAdvances.id, id)).get()!;
    }, { behavior: 'immediate' });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: payroll_advances\.recipient_id/.test(error.message)) {
      throw new DomainError('conflict', 'You already have a Payroll Advance open. A new one is possible after it is declined, rejected or fully repaid.');
    }
    throw error;
  }
}

// ------------------------------------------------------------------ maker

function requireMaker(p: Principal) {
  if (p.role !== 'maker') throw new DomainError('forbidden', 'Only a maker handles Payroll Advance requests.');
}

export function declineAdvance(db: Db, principal: Principal, id: string, reasonInput: unknown, now = new Date()) {
  requireMaker(principal);
  const reason = typeof reasonInput === 'string' ? reasonInput.trim() : '';
  if (reason.length < 3 || reason.length > MAX_DECLINE_REASON) throw new DomainError('invalid', `Give a reason for the decline (3–${MAX_DECLINE_REASON} characters).`);
  return db.transaction((tx) => {
    const a = getAdvance(tx, id);
    if (a.status !== 'requested') throw new DomainError('conflict', `This request is ${ADVANCE_STATUS_LABEL[a.status].toLowerCase()}, so it cannot be declined.`);
    if (a.runId && tx.select({ id: runVersions.id }).from(runVersions).where(eq(runVersions.runId, a.runId)).get()) {
      throw new DomainError('conflict', 'This request was already submitted to the vault once. Cancel that run instead.');
    }
    tx.update(payrollAdvances).set({ status: 'declined', statusDetail: reason, decidedByUserId: principal.id, decidedAt: now, updatedAt: now }).where(and(eq(payrollAdvances.id, id), eq(payrollAdvances.status, 'requested'))).run();
    audit(tx, principal.id, 'advance.declined', id, {}, now);
    return getAdvance(tx, id);
  }, { behavior: 'immediate' });
}

export function advanceRunTitle(name: string, at: Date): string {
  return `Payroll Advance: ${name}, ${monthLabel(monthKey(at))}`;
}

/**
 * The maker submits a request: eligibility and the money rules are checked again, the one-row run
 * "Payroll Advance: <name>, <month year>" paying A − fee is created (once) and goes through the
 * normal create_run. On any failure the request stays "Requested" with the reason.
 */
export async function submitAdvance(db: Db, client: VaultClient, principal: Principal, id: string, now = new Date()): Promise<{ advance: Advance; runId: string; submit: SubmitResult }> {
  requireMaker(principal);
  const prepared = db.transaction((tx) => {
    const a = getAdvance(tx, id);
    if (a.status !== 'requested') throw new DomainError('conflict', `This request is ${ADVANCE_STATUS_LABEL[a.status].toLowerCase()}; only a requested advance can be submitted.`);
    const r = tx.select().from(recipients).where(eq(recipients.id, a.recipientId)).get()!;
    const policy = JSON.parse(a.policySnapshot) as AdvancePolicy;
    const e = eligibilityFor(tx, r, { now, excludeAdvanceId: a.id });
    if (!e.eligible) throw new DomainError('invalid', `Not eligible any more: ${failedChecks(e)}. Decline the request with a reason.`);
    if (a.amount > BigInt(e.max)) throw new DomainError('invalid', `The advance of ${formatAmountShort(a.amount)} tUSDC is above today's maximum of ${formatAmountShort(BigInt(e.max))} tUSDC. Decline it with a reason.`);
    const t = termsFor(a.amount, policy);
    if (t.fee !== a.fee || t.net !== a.net || t.schedule.regular !== a.instalment || t.schedule.last !== a.lastInstalment || policy.instalments !== a.instalmentCount) {
      throw new DomainError('invalid', 'The stored terms do not match the money rules. Nothing was sent.');
    }
    let runId = a.runId;
    if (runId) {
      const run = tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get()!;
      if (run.makerUserId !== principal.id) throw new DomainError('conflict', 'Another maker submitted this request before. That maker can submit it again.');
    } else {
      runId = createRun(tx, { makerUserId: principal.id, title: advanceRunTitle(r.name, now), postingMode: 'detailed', source: 'manual', now, kind: 'advance', advanceId: a.id });
      tx.insert(draftRows).values({ runId, position: 0, nearAccountId: r.nearAccountId, receiverName: r.name, currency: 'tUSDC', amount: formatAmount(a.net), mobilePhone: r.mobilePhone, email: r.email, sourceLine: null }).run();
      tx.update(payrollRuns).set({ draftRevision: 1, updatedAt: now }).where(eq(payrollRuns.id, runId)).run();
    }
    const changed = tx.update(payrollAdvances).set({ status: 'submitted', statusDetail: null, runId, eligibilityAtSubmit: JSON.stringify(e), decidedByUserId: principal.id, decidedAt: now, updatedAt: now })
      .where(and(eq(payrollAdvances.id, id), eq(payrollAdvances.status, 'requested'))).run();
    if (changed.changes !== 1) throw new DomainError('conflict', 'This request changed in another window. Reload.');
    audit(tx, principal.id, 'advance.submit_requested', id, { runId }, now);
    const run = tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get()!;
    return { runId, revision: run.draftRevision };
  }, { behavior: 'immediate' });

  const revert = (detail: string) => db.update(payrollAdvances).set({ status: 'requested', statusDetail: detail, updatedAt: new Date() })
    .where(and(eq(payrollAdvances.id, id), eq(payrollAdvances.status, 'submitted'))).run();
  let submit: SubmitResult;
  try {
    submit = await submitRun(db, client, principal, prepared.runId, { expectedRevision: prepared.revision, now, advance: true });
  } catch (error) {
    revert(error instanceof Error ? error.message : 'The submission failed.');
    throw error;
  }
  if (submit.status === 'submit_failed') revert(`The vault refused the submission: ${submit.error ?? 'unknown reason'}. Nothing was paid.`);
  syncAdvances(db, now);
  return { advance: getAdvance(db, id), runId: prepared.runId, submit };
}

// ------------------------------------------------------------------ read models

export interface ScheduleItem { n: number; month: string; amount: bigint; status: 'repaid' | 'pending' | 'due' | 'upcoming'; }

export function scheduleView(db: Queryable, a: Advance, now: Date): { items: ScheduleItem[]; repaid: bigint; pending: bigint; balance: bigint; left: number; firstMonth: string | null } {
  const pos = repaymentOf(db, a);
  const expected = JSON.parse(a.expectedMonths) as string[];
  const start = pos.firstMonth ?? (a.status === 'paid' && expected[0]! < monthKey(now) ? monthKey(now) : expected[0]!);
  const amounts = Array.from({ length: a.instalmentCount }, (_, i) => (i === a.instalmentCount - 1 ? a.lastInstalment : a.instalment));
  let cum = 0n;
  const items = amounts.map((amount, i): ScheduleItem => {
    cum += amount;
    const month = addMonths(start, i);
    const status = cum <= pos.repaid ? 'repaid' : cum <= pos.repaid + pos.pending ? 'pending' : month <= monthKey(now) && a.status === 'paid' ? 'due' : 'upcoming';
    return { n: i + 1, month, amount, status };
  });
  return { items, repaid: pos.repaid, pending: pos.pending, balance: a.amount - pos.repaid, left: items.filter((x) => x.status !== 'repaid').length, firstMonth: pos.firstMonth };
}

export interface PaidLine {
  at: Date | null; kind: 'payroll' | 'advance' | 'testnet'; title: string; received: bigint; gross: bigint | null; instalment: bigint | null; txHash: string | null;
}

/** The employee's own paid lines: payroll rows and advance payouts to their account, newest first. */
export function paidLinesFor(db: Queryable, account: string): PaidLine[] {
  const rows = db.select({ r: versionRows, v: runVersions, run: payrollRuns }).from(versionRows)
    .innerJoin(runVersions, eq(versionRows.versionId, runVersions.id)).innerJoin(payrollRuns, eq(runVersions.runId, payrollRuns.id))
    .where(eq(versionRows.nearAccountId, account)).all();
  const versionIds = [...new Set(rows.map((x) => x.v.id))];
  const paid = versionIds.length ? db.select().from(payoutActions).where(and(inArray(payoutActions.versionId, versionIds), eq(payoutActions.kind, 'pay_row'), eq(payoutActions.status, 'succeeded'))).all() : [];
  const deds = deductionsOf(db, { versionIds });
  const out: PaidLine[] = [];
  for (const { r, v, run } of rows) {
    const a = paid.find((p) => p.versionId === v.id && p.rowIndex === r.rowIndex);
    if (!a) continue;
    const d = deds.find((x) => x.versionId === v.id && x.rowIndex === r.rowIndex);
    out.push({ at: a.chainBlockTime ?? a.updatedAt, kind: run.kind, title: run.kind === 'advance' ? 'Payroll Advance' : run.title, received: r.amount, gross: d ? d.gross : run.kind === 'payroll' ? r.amount : null, instalment: d ? d.instalment : null, txHash: a.txHash });
  }
  const history = db.select({ row: testnetRunRows, title: testnetRuns.title }).from(testnetRunRows).innerJoin(testnetRuns, eq(testnetRunRows.runId, testnetRuns.id))
    .where(and(eq(testnetRunRows.receiverAccount, account), eq(testnetRuns.category, 'payroll'))).all();
  for (const h of history) if (h.row.paidTxHash) out.push({ at: h.row.paidAt, kind: 'testnet', title: h.title, received: h.row.amount, gross: h.row.amount, instalment: null, txHash: h.row.paidTxHash });
  return out.sort((x, y) => (y.at?.getTime() ?? 0) - (x.at?.getTime() ?? 0));
}

export interface EmployeeView {
  recipient: Recipient;
  policy: AdvancePolicy;
  eligibility: Eligibility;
  expectedMonths: string[];
  current: (Advance & { schedule: ReturnType<typeof scheduleView> }) | null;
  requests: Advance[];
  paidLines: PaidLine[];
  ledger: ReturnType<typeof ledgerOf>;
}

export function employeeView(db: Db, principal: Principal, now = new Date()): EmployeeView {
  syncAdvances(db, now);
  const recipient = employeeRecipient(db, principal);
  const policy = getPolicy(db);
  const requests = db.select().from(payrollAdvances).where(eq(payrollAdvances.recipientId, recipient.id)).orderBy(desc(payrollAdvances.createdAt)).all();
  const open = requests.find((a) => ['requested', 'submitted', 'approved', 'paid'].includes(a.status)) ?? null;
  return {
    recipient, policy, eligibility: eligibilityFor(db, recipient, { now, policy }), expectedMonths: expectedMonths(db, recipient, policy.instalments, now),
    current: open ? { ...open, schedule: scheduleView(db, open, now) } : null,
    requests, paidLines: paidLinesFor(db, recipient.nearAccountId), ledger: ledgerOf(db, recipient.id),
  };
}

export interface QueueEntry {
  advance: Advance; name: string; account: string; division: string; employeeEmail: string;
  eligibilityNow: Eligibility; eligibilityAtRequest: Eligibility; months: string[]; runVersionStatus: string | null;
}

/** Maker: every request, open ones first, with the eligibility re-checked now. */
export function advanceQueue(db: Db, principal: Principal, now = new Date()): { open: QueueEntry[]; done: QueueEntry[] } {
  requireMaker(principal);
  syncAdvances(db, now);
  const rows = db.select({ a: payrollAdvances, r: recipients, email: users.email }).from(payrollAdvances)
    .innerJoin(recipients, eq(payrollAdvances.recipientId, recipients.id)).innerJoin(users, eq(payrollAdvances.employeeUserId, users.id))
    .orderBy(desc(payrollAdvances.createdAt)).all();
  const entries = rows.map(({ a, r, email }): QueueEntry => {
    const latest = a.runId ? db.select({ status: runVersions.status }).from(runVersions).where(eq(runVersions.runId, a.runId)).orderBy(desc(runVersions.versionNo)).get() : undefined;
    return {
      advance: a, name: r.name, account: r.nearAccountId, division: r.division, employeeEmail: email,
      eligibilityNow: eligibilityFor(db, r, { now, excludeAdvanceId: a.id }), eligibilityAtRequest: JSON.parse(a.eligibilityAtRequest) as Eligibility,
      months: JSON.parse(a.expectedMonths) as string[], runVersionStatus: latest?.status ?? null,
    };
  });
  return { open: entries.filter((e) => e.advance.status === 'requested'), done: entries.filter((e) => e.advance.status !== 'requested') };
}

export interface RunAdvanceView {
  advance: Advance; name: string; account: string; months: string[];
  eligibilityAtRequest: Eligibility; eligibilityAtSubmit: Eligibility | null; eligibilityNow: Eligibility | null; problemNow: string | null;
}

/** The Payroll Advance behind an advance run (maker and approvers on the run page). */
export function advanceForRun(db: Queryable, runId: string, now: Date, opts: { live: boolean }): RunAdvanceView | null {
  const run = db.select({ kind: payrollRuns.kind, advanceId: payrollRuns.advanceId }).from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run || run.kind !== 'advance' || !run.advanceId) return null;
  const a = getAdvance(db, run.advanceId);
  const r = db.select().from(recipients).where(eq(recipients.id, a.recipientId)).get()!;
  return {
    advance: a, name: r.name, account: r.nearAccountId, months: JSON.parse(a.expectedMonths) as string[],
    eligibilityAtRequest: JSON.parse(a.eligibilityAtRequest) as Eligibility,
    eligibilityAtSubmit: a.eligibilityAtSubmit ? JSON.parse(a.eligibilityAtSubmit) as Eligibility : null,
    eligibilityNow: opts.live ? eligibilityFor(db, r, { now, excludeAdvanceId: a.id }) : null,
    problemNow: opts.live ? advanceApprovalProblem(db, runId, now) : null,
  };
}

/** Instalments frozen with a version (run page: gross, instalment, net per row). */
export function deductionsForVersion(db: Queryable, versionId: string): DeductionRecord[] {
  return deductionsOf(db, { versionIds: [versionId] }).sort((x, y) => x.rowIndex - y.rowIndex);
}

export interface OutstandingEntry { advance: Advance; name: string; account: string; active: boolean; balance: bigint; left: number; repaid: bigint }

/** Admin: advances paid out and not fully repaid; inactive employees are "to settle outside SentFund". */
export function outstandingAdvances(db: Db, now = new Date()): OutstandingEntry[] {
  syncAdvances(db, now);
  return db.select({ a: payrollAdvances, r: recipients }).from(payrollAdvances).innerJoin(recipients, eq(payrollAdvances.recipientId, recipients.id))
    .where(eq(payrollAdvances.status, 'paid')).orderBy(desc(payrollAdvances.paidAt)).all()
    .map(({ a, r }) => {
      const s = scheduleView(db, a, now);
      return { advance: a, name: r.name, account: r.nearAccountId, active: r.active, balance: s.balance, left: s.left, repaid: s.repaid };
    });
}

/** Count of requests waiting for the maker (navigation badge). */
export function openRequestCount(db: Queryable): number {
  return db.select({ id: payrollAdvances.id }).from(payrollAdvances).where(eq(payrollAdvances.status, 'requested')).all().length;
}


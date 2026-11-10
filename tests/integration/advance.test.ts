/**
 * Phase 23 · Payroll Advance end to end against the contract-faithful stand-in vault: eligibility,
 * consent, concurrent requests, decline, withdraw (Phase 23b; also at the same moment as the maker's submit), maker submit (one-row run through create_run), approver
 * re-check, reject, payout and ledger, repayment through payroll (50% rule, carry-over, one
 * deduction per month, released on cancel), reports that reconcile, settle-outside, policy log.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import { seedDemo } from '@/server/db/seed';
import { advanceDeductions, advanceLedger, payrollAdvances, payrollRuns, recipients, runVersions, versionRows } from '@/server/db/schema';
import { recordReadiness, setRecipientActive, updateRecipient } from '@/server/recipients/directory';
import { createRun, DomainError } from '@/server/runs/repository';
import { saveManualDraft } from '@/server/runs/draft-service';
import { cancelVersion, decide, latestVersion, reconcileVersion, submitRun } from '@/server/runs/lifecycle';
import { payRows, requestRelease } from '@/server/payouts/release';
import {
  advanceForRun, advanceQueue, declineAdvance, employeeView, openRequestCount, outstandingAdvances, requestAdvance, submitAdvance, withdrawAdvance,
} from '@/server/advance/service';
import { planDeductions, planFingerprint } from '@/server/advance/ledger';
import { policyLog, setPolicy } from '@/server/advance/policy';
import { companyCsv, historyFor, recipientCsv } from '@/server/reports/history';
import { FakeVault } from '../helpers/fake-vault';

const dir = mkdtempSync(join(tmpdir(), 'sentfund-adv-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const maker = { id: 'usr_maker', role: 'maker' as const };
const app1 = { id: 'usr_app1', role: 'approver' as const };
const app2 = { id: 'usr_app2', role: 'approver' as const };
const admin = { id: 'usr_admin', role: 'admin' as const };
const emma = { id: 'usr_emp_emma', role: 'employee' as const };
const daniel = { id: 'usr_emp_daniel', role: 'employee' as const };
const NOW = new Date('2026-11-10T09:00:00Z');
const at = (iso: string) => new Date(iso);
const EMMA = 'recipient1.sentfund-payroll.testnet';
const DANIEL = 'recipient2.sentfund-payroll.testnet';
let h: DatabaseHandle;
let fake: FakeVault;
let k = 0;

const rid = (account: string) => h.db.select().from(recipients).where(eq(recipients.nearAccountId, account)).get()!;

beforeEach(async () => {
  k += 1;
  h = openDatabase(join(dir, `a${k}.sqlite`));
  await seedDemo(h.db, { env: { DEMO_MODE: 'true' }, now: at('2026-11-01T00:00:00Z'), recipientDirectory: true, testnetHistory: false, demoDraft: false });
  for (const a of [EMMA, DANIEL, 'recipient3.sentfund-payroll.testnet']) recordReadiness(h.db, 'usr_admin', rid(a).id, 'ready', at('2026-11-01T00:00:00Z'));
  fake = new FakeVault();
  fake.balance = 2_000_000n;
});

/** Approve by both approvers, release and pay, reconciling like the worker does. */
async function approveAndPay(runId: string, now: Date) {
  const v = () => latestVersion(h.db, runId)!;
  await reconcileVersion(h.db, fake, v().id, now);
  await decide(h.db, fake, app1, runId, { versionId: v().id, decision: 'approve', now });
  await reconcileVersion(h.db, fake, v().id, now);
  await decide(h.db, fake, app2, runId, { versionId: v().id, decision: 'approve', now });
  await reconcileVersion(h.db, fake, v().id, now);
  await requestRelease(h.db, fake, v(), { role: 'worker', workerId: 'test', now });
  await payRows(h.db, fake, v(), { role: 'worker', workerId: 'test', max: 100, now });
  await reconcileVersion(h.db, fake, v().id, now);
  return v();
}

/** A manual payroll run; amounts are the gross pay. */
function payrollDraft(title: string, rows: [string, string, string][], now: Date) {
  const id = createRun(h.db, { makerUserId: maker.id, title, postingMode: 'detailed', source: 'manual', now });
  saveManualDraft(h.db, maker, id, { expectedRevision: 0, now, rows: rows.map(([account, name, amount]) => ({ near_account_id: account, receiver_name: name, currency: 'tUSDC', amount, mobile_phone: '+44 7700 900101', email: 'x@example.com' })) });
  return id;
}

async function paidAdvance(amount = '0.30', now = NOW) {
  const adv = requestAdvance(h.db, emma, { amount, consent: true, reason: 'Car repair' }, now);
  const { runId } = await submitAdvance(h.db, fake, maker, adv.id, now);
  await approveAndPay(runId, now);
  return { adv: h.db.select().from(payrollAdvances).where(eq(payrollAdvances.id, adv.id)).get()!, runId };
}

describe('eligibility and the request', () => {
  it('the seeded employees are eligible for up to 0.30 (300% of 0.10), with six expected months from November', () => {
    const v = employeeView(h.db, emma, NOW);
    expect(v.recipient.nearAccountId).toBe(EMMA);
    expect(v.eligibility.eligible).toBe(true);
    expect(v.eligibility.max).toBe('300000');
    expect(v.eligibility.maxBasis).toBe('300% of the monthly net pay');
    expect(v.expectedMonths).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
    expect(v.current).toBeNull();
  });

  it('each eligibility rule is enforced on the server: tenure, identity, readiness, active, net pay, policy off', () => {
    const r = rid('recipient3.sentfund-payroll.testnet');
    const grace = { id: 'usr_emp_grace', role: 'employee' as const };
    updateRecipient(h.db, admin, r.id, { name: r.name, division: r.division, email: r.email, mobilePhone: r.mobilePhone, maxAmount: '0.30', startDate: '2026-10-01' }, 1_000_000n, NOW);
    expect(() => requestAdvance(h.db, grace, { amount: '0.10', consent: true }, NOW)).toThrow(/At least 90 days since the start date \(40 days since 2026-10-01\)/);
    h.sqlite.prepare("update recipients set identity_status = 'needs_review' where id = ?").run(rid(DANIEL).id);
    expect(() => requestAdvance(h.db, daniel, { amount: '0.10', consent: true }, NOW)).toThrow(/Identity verified/);
    h.sqlite.prepare("update recipients set identity_status = 'verified', readiness = 'not_registered' where id = ?").run(rid(DANIEL).id);
    expect(() => requestAdvance(h.db, daniel, { amount: '0.10', consent: true }, NOW)).toThrow(/Ready to receive tUSDC/);
    setRecipientActive(h.db, admin, rid(EMMA).id, false, NOW);
    expect(() => requestAdvance(h.db, emma, { amount: '0.10', consent: true }, NOW)).toThrow(/Active in the recipient directory/);
    setRecipientActive(h.db, admin, rid(EMMA).id, true, NOW);
    expect(setPolicy(h.db, admin, { enabled: false, maxPercent: 300, feeBps: 200, instalments: 6, minDays: 90 }, NOW).ok).toBe(true);
    expect(() => requestAdvance(h.db, emma, { amount: '0.10', consent: true }, NOW)).toThrow(/Payroll Advance is on/);
    expect(h.db.select().from(payrollAdvances).all()).toEqual([]);
  });

  it('consent is required, the amount stays within 0.01 and the maximum, and the terms and consent are stored', () => {
    expect(() => requestAdvance(h.db, emma, { amount: '0.30' }, NOW)).toThrow(/Tick “I agree to these 6 salary deductions”/);
    expect(() => requestAdvance(h.db, emma, { amount: '0.31', consent: true }, NOW)).toThrow(/from 0\.01 to 0\.30 tUSDC/);
    expect(() => requestAdvance(h.db, emma, { amount: '0.009', consent: true }, NOW)).toThrow(/from 0\.01 to 0\.30 tUSDC/);
    expect(() => requestAdvance(h.db, emma, { amount: '0,30', consent: true }, NOW)).toThrow(/Amount/);
    expect(() => requestAdvance(h.db, maker, { amount: '0.30', consent: true }, NOW)).toThrow(/Only employees/);
    const a = requestAdvance(h.db, emma, { amount: '0.30', consent: true, reason: '  Car   repair ' }, NOW);
    expect(a).toMatchObject({ status: 'requested', amount: 300_000n, fee: 6_000n, net: 294_000n, instalmentCount: 6, instalment: 50_000n, lastInstalment: 50_000n, reason: 'Car repair', consentText: 'I agree to these 6 salary deductions' });
    expect(JSON.parse(a.expectedMonths)).toHaveLength(6);
    expect(() => h.sqlite.prepare('update payroll_advances set amount = ? where id = ?').run('1', a.id)).toThrow(/terms and the consent of a request are fixed/);
    expect(() => h.sqlite.prepare('delete from payroll_advances where id = ?').run(a.id)).toThrow(/never deleted/);
  });

  it('two requests at the same moment never both succeed (service check and the partial unique index)', async () => {
    const results = await Promise.allSettled([0, 1].map(async () => requestAdvance(h.db, emma, { amount: '0.20', consent: true }, NOW)));
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((failed.reason as DomainError).message).toMatch(/already have a Payroll Advance open|Another request is already open/);
    // Even a write that skipped the service check is refused by the database.
    const one = h.db.select().from(payrollAdvances).get()!;
    expect(() => h.db.insert(payrollAdvances).values({ ...one, id: 'dup' }).run()).toThrow(/UNIQUE constraint failed: payroll_advances\.recipient_id/);
    expect(h.db.select().from(payrollAdvances).all()).toHaveLength(1);
  });
});

describe('maker and approvers', () => {
  it('decline with a reason: the employee sees it and may request again', () => {
    const a = requestAdvance(h.db, emma, { amount: '0.20', consent: true }, NOW);
    expect(() => declineAdvance(h.db, maker, a.id, 'no', NOW)).toThrow(/reason/);
    expect(() => declineAdvance(h.db, app1, a.id, 'Not this month', NOW)).toThrow(/Only a maker/);
    expect(declineAdvance(h.db, maker, a.id, 'Not this month, sorry', NOW)).toMatchObject({ status: 'declined', statusDetail: 'Not this month, sorry' });
    expect(employeeView(h.db, emma, NOW).requests[0]).toMatchObject({ status: 'declined', statusDetail: 'Not this month, sorry' });
    expect(requestAdvance(h.db, emma, { amount: '0.10', consent: true }, NOW).status).toBe('requested');
    expect(fake.calls).toEqual([]);
  });

  it('submit creates the one-row run "Payroll Advance: Emma Clark, November 2026" paying A − fee through create_run; it cannot be edited or resubmitted as payroll', async () => {
    const a = requestAdvance(h.db, emma, { amount: '0.30', consent: true }, NOW);
    expect(advanceQueue(h.db, maker, NOW).open.map((e) => [e.name, e.eligibilityNow.eligible])).toEqual([['Emma Clark', true]]);
    const r = await submitAdvance(h.db, fake, maker, a.id, NOW);
    const run = h.db.select().from(payrollRuns).where(eq(payrollRuns.id, r.runId)).get()!;
    expect(run).toMatchObject({ kind: 'advance', advanceId: a.id, title: 'Payroll Advance: Emma Clark, November 2026' });
    const v = latestVersion(h.db, r.runId)!;
    expect([v.rowCount, v.total]).toEqual([1, 294_000n]);
    expect(h.db.select().from(versionRows).where(eq(versionRows.versionId, v.id)).all().map((x) => [x.nearAccountId, x.amount])).toEqual([[EMMA, 294_000n]]);
    expect(fake.calls.filter((c) => c.method === 'create_run').map((c) => [c.role, c.args.row_count, c.args.total])).toEqual([['maker', 1, '294000']]);
    expect(employeeView(h.db, emma, NOW).current?.status).toBe('submitted');
    await expect(submitAdvance(h.db, fake, maker, a.id, NOW)).rejects.toThrow(/submitted; only a requested advance/);
    expect(() => saveManualDraft(h.db, maker, r.runId, { expectedRevision: 1, now: NOW, rows: [] })).toThrow(/cannot be edited/);
    await expect(submitRun(h.db, fake, maker, r.runId, { expectedRevision: 1, now: NOW })).rejects.toThrow(/submitted from "Payroll Advance requests"/);
    expect(() => h.sqlite.prepare("update payroll_runs set kind = 'payroll', advance_id = null where id = ?").run(r.runId)).toThrow(/kind and its advance are fixed/);
  });

  it('approvers see it as a Payroll Advance; the server re-checks eligibility and refuses an approval when it no longer holds; reject → Rejected with the reason', async () => {
    const a = requestAdvance(h.db, emma, { amount: '0.30', consent: true }, NOW);
    const { runId } = await submitAdvance(h.db, fake, maker, a.id, NOW);
    const v = latestVersion(h.db, runId)!;
    await reconcileVersion(h.db, fake, v.id, NOW);
    const view = advanceForRun(h.db, runId, NOW, { live: true })!;
    expect(view).toMatchObject({ name: 'Emma Clark', problemNow: null, eligibilityNow: { eligible: true } });
    expect(view.eligibilityAtSubmit?.eligible).toBe(true);
    setRecipientActive(h.db, admin, rid(EMMA).id, false, NOW);
    await expect(decide(h.db, fake, app1, runId, { versionId: v.id, decision: 'approve', now: NOW })).rejects.toThrow(/not eligible any more/);
    expect(fake.calls.filter((c) => c.method === 'approve')).toEqual([]);
    await decide(h.db, fake, app1, runId, { versionId: v.id, decision: 'reject', reason: 'Employee left the company', now: NOW });
    await reconcileVersion(h.db, fake, v.id, NOW);
    expect(h.db.select().from(payrollAdvances).get()).toMatchObject({ status: 'rejected', statusDetail: 'Employee left the company' });
  });

  it('cancelled by the maker → Cancelled; a failed submission keeps it Requested with the reason', async () => {
    const a = requestAdvance(h.db, emma, { amount: '0.10', consent: true }, NOW);
    fake.noKeys.add('maker');
    await expect(submitAdvance(h.db, fake, maker, a.id, NOW)).rejects.toThrow(/no signer keys/);
    expect(h.db.select().from(payrollAdvances).get()).toMatchObject({ status: 'requested', statusDetail: expect.stringMatching(/no signer keys/) });
    fake.noKeys.delete('maker');
    const { runId } = await submitAdvance(h.db, fake, maker, a.id, NOW);
    await reconcileVersion(h.db, fake, latestVersion(h.db, runId)!.id, NOW);
    await cancelVersion(h.db, fake, maker, runId, NOW);
    expect(h.db.select().from(payrollAdvances).get()).toMatchObject({ status: 'cancelled' });
  });
});

describe('withdraw (Phase 23b)', () => {
  it('the employee withdraws their own requested advance: Withdrawn, gone from the maker queue, and a new request is possible', () => {
    const a = requestAdvance(h.db, emma, { amount: '0.20', consent: true }, NOW);
    expect(openRequestCount(h.db)).toBe(1);
    expect(() => withdrawAdvance(h.db, daniel, a.id, NOW)).toThrow(/not found/); // another employee: like a missing request
    expect(() => withdrawAdvance(h.db, maker, a.id, NOW)).toThrow(/Only employees/);
    expect(() => withdrawAdvance(h.db, emma, 'nope', NOW)).toThrow(/not found/);
    expect(withdrawAdvance(h.db, emma, a.id, NOW)).toMatchObject({ status: 'withdrawn', decidedByUserId: emma.id });
    expect(advanceQueue(h.db, maker, NOW).open).toEqual([]);
    expect(advanceQueue(h.db, maker, NOW).done.map((e) => e.advance.status)).toEqual(['withdrawn']);
    expect(openRequestCount(h.db)).toBe(0);
    expect(employeeView(h.db, emma, NOW)).toMatchObject({ current: null, eligibility: { eligible: true } });
    expect(() => withdrawAdvance(h.db, emma, a.id, NOW)).toThrow(/withdrawn, so there is nothing to withdraw/);
    expect(() => declineAdvance(h.db, maker, a.id, 'Too late now', NOW)).toThrow(/withdrawn, so it cannot be declined/);
    expect(requestAdvance(h.db, emma, { amount: '0.10', consent: true }, NOW).status).toBe('requested');
    expect(h.sqlite.prepare("select action from audit_events where entity_id = ? order by id").all(a.id)).toEqual([{ action: 'advance.requested' }, { action: 'advance.withdrawn' }]);
    expect(fake.calls).toEqual([]);
  });

  it('once the maker has submitted it, withdrawing is no longer possible', async () => {
    const a = requestAdvance(h.db, emma, { amount: '0.30', consent: true }, NOW);
    await submitAdvance(h.db, fake, maker, a.id, NOW);
    expect(() => withdrawAdvance(h.db, emma, a.id, NOW)).toThrow(/already submitted this request, so it can no longer be withdrawn/);
    expect(h.db.select().from(payrollAdvances).get()!.status).toBe('submitted');
  });

  it('withdraw at the same moment as the maker submits: exactly one wins, in either order', async () => {
    for (const first of ['submit', 'withdraw'] as const) {
      k += 1;
      h = openDatabase(join(dir, `race-${first}-${k}.sqlite`));
      await seedDemo(h.db, { env: { DEMO_MODE: 'true' }, now: at('2026-11-01T00:00:00Z'), recipientDirectory: true, testnetHistory: false, demoDraft: false });
      recordReadiness(h.db, 'usr_admin', rid(EMMA).id, 'ready', at('2026-11-01T00:00:00Z'));
      fake = new FakeVault();
      const a = requestAdvance(h.db, emma, { amount: '0.30', consent: true }, NOW);
      const submit = () => submitAdvance(h.db, fake, maker, a.id, NOW);
      const withdraw = async () => withdrawAdvance(h.db, emma, a.id, NOW);
      const results = await Promise.allSettled(first === 'submit' ? [submit(), withdraw()] : [withdraw(), submit()]);
      expect(results.map((r) => r.status), first).toEqual(['fulfilled', 'rejected']);
      const loser = (results[1] as PromiseRejectedResult).reason as DomainError;
      expect(loser.code).toBe('conflict');
      const status = h.db.select().from(payrollAdvances).get()!.status;
      const creates = fake.calls.filter((c) => c.method === 'create_run').length;
      if (first === 'submit') expect([status, creates, loser.message]).toEqual(['submitted', 1, 'The payroll maker has already submitted this request, so it can no longer be withdrawn.']);
      else expect([status, creates, h.db.select().from(payrollRuns).all().length, loser.message]).toEqual(['withdrawn', 0, 0, 'This request is withdrawn; only a requested advance can be submitted.']);
    }
  });

  it('a withdrawal while the submission is still on its way to NEAR is refused; the submission completes', async () => {
    const a = requestAdvance(h.db, emma, { amount: '0.30', consent: true }, NOW);
    const call = fake.call.bind(fake);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    fake.call = async (...args: Parameters<FakeVault['call']>) => { await gate; return call(...args); };
    const submitting = submitAdvance(h.db, fake, maker, a.id, NOW);
    expect(() => withdrawAdvance(h.db, emma, a.id, NOW)).toThrow(/can no longer be withdrawn/);
    open();
    expect((await submitting).advance.status).toBe('submitted');
  });
});

describe('payout, repayment through payroll and the ledger', () => {
  it('paid: the ledger records A when the row is paid on-chain; the fee stays in the vault', async () => {
    const before = fake.balance;
    const { adv, runId } = await paidAdvance();
    expect(adv.status).toBe('paid');
    expect(fake.balance).toBe(before - 294_000n);
    expect(fake.paidTo.get(EMMA)).toBe(294_000n);
    const ledger = h.db.select().from(advanceLedger).all();
    expect(ledger.map((l) => [l.kind, l.amount, l.rowIndex])).toEqual([['advance', 300_000n, 0]]);
    expect(ledger[0]!.versionId).toBe(latestVersion(h.db, runId)!.id);
    const view = employeeView(h.db, emma, NOW);
    expect(view.current?.schedule).toMatchObject({ balance: 300_000n, left: 6, repaid: 0n });
    expect(view.paidLines[0]).toMatchObject({ kind: 'advance', received: 294_000n });
    expect(view.eligibility.eligible).toBe(false); // one at a time
    expect(() => h.db.update(advanceLedger).set({ amount: 1n }).run()).toThrow(/append-only/);
  });

  it('the first payroll of the month deducts the instalment (gross 0.10 → net 0.05), only when the maker confirms; balance 0.25 with 5 left once paid', async () => {
    await paidAdvance();
    const t = at('2026-11-10T10:00:00Z');
    const id = payrollDraft('November salaries', [[EMMA, 'Emma Clark', '0.10'], [DANIEL, 'Daniel Hall', '0.05']], t);
    const plan = planDeductions(h.db, [{ accountId: EMMA, amount: 100_000n }, { accountId: DANIEL, amount: 50_000n }], t);
    expect(plan.map((p) => [p.rowIndex, p.gross, p.instalment, p.net, p.month])).toEqual([[0, 100_000n, 50_000n, 50_000n, '2026-11']]);
    await expect(submitRun(h.db, fake, maker, id, { expectedRevision: 1, now: t })).rejects.toThrow(/confirm "Apply Payroll Advance instalments"/);
    await expect(submitRun(h.db, fake, maker, id, { expectedRevision: 1, now: t, applyInstalments: true, expectedInstalments: 'stale' })).rejects.toThrow(/changed since you reviewed/);
    expect(fake.calls.filter((c) => c.method === 'create_run')).toHaveLength(1); // only the advance run
    await submitRun(h.db, fake, maker, id, { expectedRevision: 1, now: t, applyInstalments: true, expectedInstalments: planFingerprint(plan) });
    const v = latestVersion(h.db, id)!;
    expect(v.total).toBe(100_000n); // 0.05 + 0.05 committed on-chain
    expect(h.db.select().from(versionRows).where(eq(versionRows.versionId, v.id)).all().map((r) => r.amount)).toEqual([50_000n, 50_000n]);
    expect(h.db.select().from(advanceDeductions).all().map((d) => [d.rowIndex, d.gross, d.instalment, d.net])).toEqual([[0, 100_000n, 50_000n, 50_000n]]);
    expect(employeeView(h.db, emma, t).current?.schedule).toMatchObject({ pending: 50_000n, repaid: 0n, balance: 300_000n });
    // The instalment counts only when its row is paid.
    expect(h.db.select().from(advanceLedger).all()).toHaveLength(1);
    await approveAndPay(id, t);
    const view = employeeView(h.db, emma, t);
    expect(view.current?.schedule).toMatchObject({ repaid: 50_000n, balance: 250_000n, left: 5, firstMonth: '2026-11' });
    expect(view.current?.schedule.items.map((i) => i.status)).toEqual(['repaid', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(view.paidLines.find((l) => l.kind === 'payroll')).toMatchObject({ gross: 100_000n, instalment: 50_000n, received: 50_000n });
    // A later payroll in the same month (a bonus) does not deduct again.
    expect(planDeductions(h.db, [{ accountId: EMMA, amount: 500_000n }], at('2026-11-25T10:00:00Z'))).toEqual([]);
  });

  it('50% rule with carry-over, released on cancel, and "apply" off leaves the instalment due', async () => {
    await paidAdvance();
    const nov = at('2026-11-12T10:00:00Z');
    // November: gross 0.06 → at most 0.03 (50%), 0.02 carries over.
    const p1 = payrollDraft('November', [[EMMA, 'Emma Clark', '0.06']], nov);
    const plan1 = planDeductions(h.db, [{ accountId: EMMA, amount: 60_000n }], nov);
    expect(plan1[0]).toMatchObject({ instalment: 30_000n, net: 30_000n, carried: 20_000n });
    await submitRun(h.db, fake, maker, p1, { expectedRevision: 1, now: nov, applyInstalments: true });
    await approveAndPay(p1, nov);
    // December: a payroll with "apply" off pays the gross and keeps the month open.
    const dec = at('2026-12-05T10:00:00Z');
    const p2 = payrollDraft('December (no deduction)', [[EMMA, 'Emma Clark', '0.10']], dec);
    await submitRun(h.db, fake, maker, p2, { expectedRevision: 1, now: dec, applyInstalments: false });
    expect(latestVersion(h.db, p2)!.total).toBe(100_000n);
    // A December payroll that is cancelled releases its instalment.
    const p3 = payrollDraft('December', [[EMMA, 'Emma Clark', '0.30']], dec);
    expect(planDeductions(h.db, [{ accountId: EMMA, amount: 300_000n }], dec)[0]).toMatchObject({ due: 70_000n, instalment: 70_000n }); // instalment 2 + carried 0.02
    await submitRun(h.db, fake, maker, p3, { expectedRevision: 1, now: dec, applyInstalments: true });
    expect(planDeductions(h.db, [{ accountId: EMMA, amount: 300_000n }], dec)).toEqual([]); // the month is taken
    await reconcileVersion(h.db, fake, latestVersion(h.db, p3)!.id, dec);
    await cancelVersion(h.db, fake, maker, p3, dec);
    expect(planDeductions(h.db, [{ accountId: EMMA, amount: 300_000n }], dec)[0]).toMatchObject({ instalment: 70_000n }); // released
    expect(outstandingAdvances(h.db, dec)[0]).toMatchObject({ balance: 270_000n, repaid: 30_000n });
  });

  it('fully repaid closes the advance and allows a new one; the policy change is logged with who and when', async () => {
    expect(setPolicy(h.db, admin, { enabled: true, maxPercent: 300, feeBps: 200, instalments: 1, minDays: 90 }, NOW)).toMatchObject({ ok: true, changed: ['instalments'] });
    expect(policyLog(h.db)[0]).toMatchObject({ actor: 'Adam Admin', changes: { instalments: [6, 1] } });
    expect(setPolicy(h.db, admin, { enabled: true, maxPercent: 301, feeBps: 200, instalments: 1, minDays: 90 }, NOW)).toMatchObject({ ok: false });
    expect(() => setPolicy(h.db, maker, { enabled: true, maxPercent: 300, feeBps: 200, instalments: 1, minDays: 90 }, NOW)).toThrow(/Only the admin/);
    await paidAdvance('0.04');
    const t = at('2026-11-15T10:00:00Z');
    const p = payrollDraft('November', [[EMMA, 'Emma Clark', '0.10']], t);
    await submitRun(h.db, fake, maker, p, { expectedRevision: 1, now: t, applyInstalments: true });
    await approveAndPay(p, t);
    expect(h.db.select().from(payrollAdvances).get()).toMatchObject({ status: 'repaid' });
    expect(employeeView(h.db, emma, t).eligibility.eligible).toBe(true);
    expect(requestAdvance(h.db, emma, { amount: '0.10', consent: true }, t).status).toBe('requested');
  });

  it('an inactive employee with a balance is shown as "to settle outside SentFund"', async () => {
    await paidAdvance();
    setRecipientActive(h.db, admin, rid(EMMA).id, false, NOW);
    expect(outstandingAdvances(h.db, NOW).map((o) => [o.name, o.active, o.balance])).toEqual([['Emma Clark', false, 300_000n]]);
  });
});

describe('accounting', () => {
  it('history and both CSVs show the advance, the fee, the net payout, the instalment and gross/net, and reconcile; the company CSV has no personal data', async () => {
    await paidAdvance();
    const t = at('2026-11-10T10:00:00Z');
    const id = payrollDraft('November salaries', [[EMMA, 'Emma Clark', '0.10'], [DANIEL, 'Daniel Hall', '0.05']], t);
    await submitRun(h.db, fake, maker, id, { expectedRevision: 1, now: t, applyInstalments: true });
    await approveAndPay(id, t);
    const hist = historyFor(h.db, maker);
    expect(hist.paid.map((r) => [r.kind, r.total])).toEqual(expect.arrayContaining([['advance', 294_000n], ['payroll', 100_000n]]));
    expect(hist.totals).toMatchObject({
      runs: 2, consolidatedTotal: 394_000n, detailedTotal: 394_000n, grossTotal: 150_000n, instalmentTotal: 50_000n,
      advanceTotal: 300_000n, feeTotal: 6_000n, outstanding: 250_000n, ledgerMatches: true, reconciles: true,
    });
    // Sum of net = paid on-chain.
    expect(fake.paidTo.get(EMMA)! + fake.paidTo.get(DANIEL)!).toBe(394_000n);
    const company = companyCsv(h.db, maker);
    expect(company).not.toMatch(/Emma|emma|Daniel|recipient1|recipient2|@example/);
    const lines = company.replace(/^﻿/, '').trim().split('\r\n').slice(1);
    expect(lines.find((l) => l.includes(',advance,'))).toMatch(/,detailed,advance,"Payroll Advance, November 2026",1,sfd-.*,0\.000000,0\.000000,0\.300000,0\.006000,0\.294000,tUSDC,paid$/);
    const payroll = lines.filter((l) => l.includes(',payroll,'));
    expect(payroll.map((l) => l.split(',').slice(8, 13).join(' '))).toEqual(['0.100000 0.050000 0.000000 0.000000 0.050000', '0.050000 0.000000 0.000000 0.000000 0.050000']);
    const detail = recipientCsv(h.db, maker, 'https://testnet.nearblocks.io/txns/');
    expect(detail).toMatch(/,advance,"Payroll Advance: Emma Clark, November 2026",1,,recipient1\.sentfund-payroll\.testnet,Emma Clark,.*,0\.000000,0\.000000,0\.300000,0\.006000,0\.294000,tUSDC,TX/);
    // The admin sees company-level titles only.
    expect(historyFor(h.db, admin).paid.find((r) => r.kind === 'advance')?.companyTitle).toBe('Payroll Advance, November 2026');
    expect(h.db.select().from(runVersions).all()).toHaveLength(2);
  });
});

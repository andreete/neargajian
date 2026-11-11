/**
 * Payroll Advance eligibility (Phase 23), checked on the server when the employee requests, when
 * the maker submits and when an approver opens or approves the run. Fixed rules next to the
 * admin policy: one advance at a time, and only active, identity-verified recipients that are
 * "Ready to receive tUSDC" on testnet.
 */
import { faceCheckProblem } from '../identity/face-record.ts';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Queryable } from '../db/client.ts';
import { OPEN_ADVANCE_STATUSES, payrollAdvances, recipients, runVersions, payrollRuns, versionRows, workflowConfigs } from '../db/schema.ts';
import { hostedMode } from '../hosted.ts';
import { formatAmountShort } from '../money.ts';
import { activeWorkflowWhere } from '../workflow/vault.ts';
import { getPolicy } from './policy.ts';
import { addMonths, HOSTED_ADVANCE_CAP, maxAdvanceFor, MIN_ADVANCE, monthKey, monthsFrom, type AdvancePolicy } from './terms.ts';

export type Recipient = typeof recipients.$inferSelect;

export interface EligibilityCheck { key: string; label: string; ok: boolean; detail: string }

export interface Eligibility {
  eligible: boolean;
  checks: EligibilityCheck[];
  /** Largest advance now (base units, decimal string); "0" when not eligible. */
  max: string;
  maxBasis: string;
  monthlyNetPay: string | null;
  daysEmployed: number | null;
  policy: AdvancePolicy;
  at: string;
}

const DAY_MS = 86_400_000;

export function daysSince(startDate: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS);
}

function perRowCap(db: Queryable): bigint {
  return db.select({ cap: workflowConfigs.maxRowAmount }).from(workflowConfigs).where(activeWorkflowWhere()).get()?.cap ?? 1_000_000n;
}

/** Another advance of this recipient that is requested, in approval or paid and not fully repaid. */
export function openAdvance(db: Queryable, recipientId: string, excludeId?: string) {
  return db.select().from(payrollAdvances).where(and(
    eq(payrollAdvances.recipientId, recipientId), inArray(payrollAdvances.status, [...OPEN_ADVANCE_STATUSES]),
    ...(excludeId ? [ne(payrollAdvances.id, excludeId)] : []),
  )).get() ?? null;
}

export function eligibilityFor(db: Queryable, r: Recipient, opts: { now: Date; excludeAdvanceId?: string; policy?: AdvancePolicy }): Eligibility {
  const policy = opts.policy ?? getPolicy(db);
  const checks: EligibilityCheck[] = [];
  const add = (key: string, label: string, ok: boolean, detail: string) => checks.push({ key, label, ok, detail });
  add('policy', 'Payroll Advance is on', policy.enabled, policy.enabled ? 'The admin offers Payroll Advance.' : 'The admin has turned Payroll Advance off.');
  add('active', 'Active in the recipient directory', r.active, r.active ? 'Active.' : 'Inactive: no new advance.');
  add('identity', 'Identity verified (KTP + face)', r.identityStatus === 'verified', r.identityStatus === 'verified' ? 'Verified.' : `Identity check: ${r.identityStatus.replace('_', ' ')}.`);
  add('ready', 'Ready to receive tUSDC on testnet', r.readiness === 'ready', r.readiness === 'ready' ? 'Account exists and is registered with tUSDC.' : 'The account is not ready to receive tUSDC.');
  const pay = r.monthlyNetPay;
  add('pay', 'Monthly net pay on file', pay !== null && pay > 0n, pay ? `${formatAmountShort(pay)} tUSDC per month.` : 'No monthly net pay in the directory.');
  const days = r.startDate ? daysSince(r.startDate, opts.now) : null;
  add('tenure', `At least ${policy.minDays} days since the start date`, days !== null && days >= policy.minDays, days === null ? 'No start date in the directory.' : `${days} days since ${r.startDate}.`);
  const other = openAdvance(db, r.id, opts.excludeAdvanceId);
  add('one', 'No other Payroll Advance open or outstanding', !other, other ? (other.status === 'paid' ? 'The previous advance is not fully repaid yet.' : 'Another request is already open.') : 'None.');
  const hosted = hostedMode().demo;
  const cap = perRowCap(db);
  const max = pay ? maxAdvanceFor({ monthlyNetPay: pay, maxPercent: policy.maxPercent, recipientMax: r.maxAmount, perRowCap: cap, hosted }) : 0n;
  const share = pay ? (pay * BigInt(policy.maxPercent)) / 100n : 0n;
  const maxBasis = !pay ? '—' : max === share ? `${policy.maxPercent}% of the monthly net pay`
    : max === r.maxAmount ? "the recipient's maximum per payout" : hosted && max === HOSTED_ADVANCE_CAP ? 'the public demo cap of 0.30 tUSDC' : "the workflow's per-row cap";
  add('max', 'Maximum at least 0.01 tUSDC', max >= MIN_ADVANCE, `Up to ${formatAmountShort(max)} tUSDC (${maxBasis}).`);
  const eligible = checks.every((c) => c.ok);
  return { eligible, checks, max: (eligible ? max : 0n).toString(), maxBasis, monthlyNetPay: pay?.toString() ?? null, daysEmployed: days, policy, at: opts.now.toISOString() };
}

export function failedChecks(e: Eligibility): string {
  return e.checks.filter((c) => !c.ok).map((c) => `${c.label} (${c.detail.replace(/\.$/, '')})`).join('; ');
}

/**
 * The months the instalments are expected in: from this month if this month's payroll for the
 * employee has not been submitted yet, otherwise from next month. The real schedule starts with
 * the first payroll after the advance is paid.
 */
export function expectedMonths(db: Queryable, r: Recipient, count: number, now: Date): string[] {
  const month = monthKey(now);
  const start = new Date(`${month}-01T00:00:00Z`);
  const rows = db.select({ status: runVersions.status, createdAt: runVersions.createdAt }).from(versionRows)
    .innerJoin(runVersions, eq(versionRows.versionId, runVersions.id)).innerJoin(payrollRuns, eq(runVersions.runId, payrollRuns.id))
    .where(and(eq(versionRows.nearAccountId, r.nearAccountId), eq(payrollRuns.kind, 'payroll'))).all();
  const ranThisMonth = rows.some((x) => x.createdAt >= start && !['submit_failed', 'rejected', 'cancelled'].includes(x.status));
  return monthsFrom(ranThisMonth ? addMonths(month, 1) : month, count);
}

/** Server re-check before an approver approves an advance run (null = still eligible). */
export function advanceApprovalProblem(db: Queryable, runId: string, now: Date): string | null {
  const run = db.select({ kind: payrollRuns.kind, advanceId: payrollRuns.advanceId }).from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run || run.kind !== 'advance' || !run.advanceId) return null;
  const a = db.select().from(payrollAdvances).where(eq(payrollAdvances.id, run.advanceId)).get();
  if (!a) return 'Payroll Advance request not found.';
  const face = faceCheckProblem(a.faceCheck);
  if (face) return `Payroll Advance face check: ${face.replace('Decline it with a reason', 'Reject it with a reason')}`;
  const r = db.select().from(recipients).where(eq(recipients.id, a.recipientId)).get()!;
  const e = eligibilityFor(db, r, { now, excludeAdvanceId: a.id });
  if (!e.eligible) return `Payroll Advance re-checked now: not eligible any more (${failedChecks(e)}). Reject it with a reason.`;
  if (a.amount > BigInt(e.max)) return `Payroll Advance re-checked now: ${formatAmountShort(a.amount)} tUSDC is above today's maximum of ${formatAmountShort(BigInt(e.max))} tUSDC. Reject it with a reason.`;
  return null;
}

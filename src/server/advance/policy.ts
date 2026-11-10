/**
 * Payroll Advance policy (Phase 23): one admin setting (app_settings, JSON). Every change is
 * audited with who and when (audit_events `settings.payroll_advance`). Read-only in the public
 * demo (the route refuses). Requests keep the policy they were made under (policy_snapshot).
 * Fixed rules, not settings: one advance at a time, and only active, identity-verified
 * recipients that are "Ready to receive tUSDC".
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Principal } from '../auth/policy.ts';
import type { Db, Queryable } from '../db/client.ts';
import { appSettings, auditEvents, users } from '../db/schema.ts';
import { DomainError } from '../runs/repository.ts';
import { DEFAULT_POLICY, POLICY_LIMITS, type AdvancePolicy } from './terms.ts';

export const POLICY_KEY = 'payroll_advance_policy';
const AUDIT_ACTION = 'settings.payroll_advance';

export function getPolicy(db: Queryable): AdvancePolicy {
  const raw = db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, POLICY_KEY)).get()?.value;
  if (!raw) return { ...DEFAULT_POLICY };
  try {
    return { ...DEFAULT_POLICY, ...(JSON.parse(raw) as Partial<AdvancePolicy>) };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export type PolicyField = keyof AdvancePolicy;
export interface PolicyIssue { field: PolicyField; message: string }

export function validatePolicy(input: Partial<Record<PolicyField, unknown>>): { ok: true; value: AdvancePolicy } | { ok: false; errors: PolicyIssue[] } {
  const errors: PolicyIssue[] = [];
  if (typeof input.enabled !== 'boolean') errors.push({ field: 'enabled', message: 'Choose on or off.' });
  const whole = (field: Exclude<PolicyField, 'enabled'>, label: string) => {
    const v = input[field];
    const [lo, hi] = POLICY_LIMITS[field];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) errors.push({ field, message: `${label}: a whole number from ${lo} to ${hi}.` });
  };
  whole('maxPercent', 'Maximum (% of monthly net pay)');
  whole('feeBps', 'Fee (basis points)');
  whole('instalments', 'Instalments');
  whole('minDays', 'Minimum days since the start date');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { enabled: input.enabled as boolean, maxPercent: input.maxPercent as number, feeBps: input.feeBps as number, instalments: input.instalments as number, minDays: input.minDays as number } };
}

export function setPolicy(db: Db, actor: Principal, input: Partial<Record<PolicyField, unknown>>, now: Date) {
  if (actor.role !== 'admin') throw new DomainError('forbidden', 'Only the admin sets the Payroll Advance policy.');
  const v = validatePolicy(input);
  if (!v.ok) return v;
  const changed = db.transaction((tx) => {
    const before = getPolicy(tx);
    const diff = Object.fromEntries((Object.keys(v.value) as PolicyField[]).filter((k) => before[k] !== v.value[k]).map((k) => [k, [before[k], v.value[k]]]));
    if (!Object.keys(diff).length) return [];
    tx.insert(appSettings).values({ key: POLICY_KEY, value: JSON.stringify(v.value), updatedByUserId: actor.id, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(v.value), updatedByUserId: actor.id, updatedAt: now } }).run();
    tx.insert(auditEvents).values({ at: now, actorUserId: actor.id, action: AUDIT_ACTION, entityType: 'setting', entityId: POLICY_KEY, detail: JSON.stringify(diff) }).run();
    return Object.keys(diff);
  }, { behavior: 'immediate' });
  return { ok: true as const, policy: v.value, changed };
}

export interface PolicyChange { at: Date; actor: string; changes: Record<string, [unknown, unknown]> }

export function policyLog(db: Queryable, limit = 20): PolicyChange[] {
  return db.select({ at: auditEvents.at, actor: users.displayName, detail: auditEvents.detail }).from(auditEvents)
    .innerJoin(users, eq(auditEvents.actorUserId, users.id))
    .where(and(eq(auditEvents.action, AUDIT_ACTION), eq(auditEvents.entityId, POLICY_KEY)))
    .orderBy(desc(auditEvents.id)).limit(limit).all()
    .map((e) => ({ at: e.at, actor: e.actor, changes: JSON.parse(e.detail ?? '{}') as Record<string, [unknown, unknown]> }));
}

export function describePolicyValue(field: string, v: unknown): string {
  if (field === 'enabled') return v ? 'on' : 'off';
  if (field === 'maxPercent') return `${String(v)}%`;
  if (field === 'feeBps') return `${(Number(v) / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
  if (field === 'instalments') return `${String(v)} months`;
  if (field === 'minDays') return `${String(v)} days`;
  return String(v);
}

export const POLICY_LABEL: Record<PolicyField, string> = {
  enabled: 'Payroll Advance', maxPercent: 'maximum', feeBps: 'fee', instalments: 'repayment', minDays: 'minimum time since the start date',
};

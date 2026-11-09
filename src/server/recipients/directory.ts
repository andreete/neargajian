/**
 * Recipient directory (Phase 19), the transfer guardrail: who may be paid, by division, with a
 * maximum per payout. Admin-only changes; every change is logged in recipient_events (who, when,
 * field → [before, after]); recipients are deactivated, never deleted.
 *
 * "Pay registered recipients only" (admin setting): every payroll row must match an ACTIVE
 * recipient (same NEAR account) and stay within that recipient's maximum. Enforced by the app
 * (upload, manual draft, server re-check at submit) and shown to approvers. The vault contract
 * does not know the directory: this guardrail is the app's and the approvers', not the chain's.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import type { Principal } from '../auth/policy.ts';
import type { Db, Queryable } from '../db/client.ts';
import {
  appSettings, auditEvents, recipientEvents, recipients, users,
  type RecipientEventAction, type RecipientReadiness,
} from '../db/schema.ts';
import { formatAmountShort } from '../money.ts';
import { CURRENCY, validateRow, type DirectoryEntry, type RecipientRule } from '../payroll/validate.ts';
import { DomainError } from '../runs/repository.ts';
import { READINESS_LABEL, type CheckedReadiness, type ReadinessChecker } from './readiness.ts';

export type Recipient = typeof recipients.$inferSelect;

// ------------------------------------------------------------------ setting

export const REGISTERED_ONLY_KEY = 'registered_recipients_only';

export function registeredOnly(db: Queryable): boolean {
  return db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, REGISTERED_ONLY_KEY)).get()?.value === 'true';
}

function requireAdmin(actor: Principal) {
  if (actor.role !== 'admin') throw new DomainError('forbidden', 'Only the admin manages the recipient directory.');
}

export function setRegisteredOnly(db: Db, actor: Principal, on: boolean, now: Date) {
  requireAdmin(actor);
  db.transaction((tx) => {
    const before = registeredOnly(tx);
    tx.insert(appSettings).values({ key: REGISTERED_ONLY_KEY, value: String(on), updatedByUserId: actor.id, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: String(on), updatedByUserId: actor.id, updatedAt: now } }).run();
    if (before !== on) {
      tx.insert(auditEvents).values({ at: now, actorUserId: actor.id, action: on ? 'settings.registered_only_on' : 'settings.registered_only_off', entityType: 'setting', entityId: REGISTERED_ONLY_KEY, detail: JSON.stringify({ from: before, to: on }) }).run();
    }
  }, { behavior: 'immediate' });
}

// ------------------------------------------------------------------ rule

/** The whole directory as a validation rule (one query; 1,000s of rows are fine). */
export function directoryRule(db: Queryable): RecipientRule {
  const map = new Map<string, DirectoryEntry>();
  for (const r of db.select({ a: recipients.nearAccountId, active: recipients.active, max: recipients.maxAmount }).from(recipients).all()) {
    map.set(r.a, { active: r.active, maxAmount: r.max });
  }
  return { lookup: (a) => map.get(a) };
}

/** The rule to apply to payroll rows: only when "Pay registered recipients only" is on. */
export function enforcedRule(db: Queryable): RecipientRule | undefined {
  return registeredOnly(db) ? directoryRule(db) : undefined;
}

/** Active accounts → maximum (base units) for the maker's browser checks; null when off. */
export function activeDirectoryMap(db: Queryable): Record<string, string> | null {
  if (!registeredOnly(db)) return null;
  const out: Record<string, string> = {};
  for (const r of db.select({ a: recipients.nearAccountId, max: recipients.maxAmount }).from(recipients).where(eq(recipients.active, true)).all()) {
    out[r.a] = r.max.toString();
  }
  return out;
}

/** Frozen into a version at submission: did every row match an active recipient within its maximum? */
export interface DirectoryCheck { enforced: boolean; matched: number; rows: number }

export function directoryCheckFor(db: Queryable, rows: { accountId: string; amount: bigint }[]): DirectoryCheck {
  const on = registeredOnly(db);
  const rule = directoryRule(db);
  const matched = rows.filter((r) => { const e = rule.lookup(r.accountId); return e?.active && r.amount <= e.maxAmount; }).length;
  return { enforced: on, matched, rows: rows.length };
}

/** Rows of a submitted version that no longer match the directory today (shown to approvers). */
export function directoryDrift(db: Queryable, rows: { accountId: string; amount: bigint }[]): number {
  const rule = directoryRule(db);
  return rows.filter((r) => { const e = rule.lookup(r.accountId); return !e?.active || r.amount > e.maxAmount; }).length;
}

// ------------------------------------------------------------------ validation

export interface RecipientInput {
  nearAccountId: string;
  name: string;
  division: string;
  email: string;
  mobilePhone: string;
  /** Maximum per payout in tUSDC, as typed (e.g. "0.10"). */
  maxAmount: string;
}
export type RecipientField = keyof RecipientInput;
export interface RecipientIssue { field: RecipientField; message: string }
export interface CleanRecipient { nearAccountId: string; name: string; division: string; email: string; mobilePhone: string; maxAmount: bigint }

const DIVISION_RE = /^[A-Za-z0-9][A-Za-z0-9 &/-]{0,39}$/;
export const MAX_DIVISION = 40;

/** Same rules as a payroll row (shared validation), plus the division; the maximum ≤ the per-row cap. */
export function validateRecipient(input: Partial<RecipientInput>, perRowCap: bigint): { ok: true; value: CleanRecipient } | { ok: false; errors: RecipientIssue[] } {
  const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '');
  const row = validateRow({
    near_account_id: s(input.nearAccountId), receiver_name: s(input.name), currency: CURRENCY,
    amount: s(input.maxAmount), mobile_phone: s(input.mobilePhone), email: s(input.email),
  }, 0, { maxRowAmount: perRowCap, maxRunTotal: perRowCap });
  const field: Record<string, RecipientField> = { near_account_id: 'nearAccountId', receiver_name: 'name', amount: 'maxAmount', mobile_phone: 'mobilePhone', email: 'email', currency: 'maxAmount' };
  const errors: RecipientIssue[] = row.errors.map((e) => ({
    field: field[e.field] ?? 'name',
    message: e.field === 'receiver_name' ? e.message.replace('Receiver name', 'Name')
      : e.field === 'amount' ? e.message.replace(/^Amount is above the per-row cap of (.+) tUSDC\.$/, "The maximum is above the workflow's per-row cap of $1 tUSDC.").replace(/^Amount/, 'Maximum')
        : e.message,
  }));
  const division = s(input.division).trim().replace(/\s+/g, ' ');
  if (!division) errors.push({ field: 'division', message: 'Division is required, e.g. Sales.' });
  else if (!DIVISION_RE.test(division)) errors.push({ field: 'division', message: `Division: letters, digits, spaces, & / - only, up to ${MAX_DIVISION} characters.` });
  if (errors.length || !row.valid) return { ok: false, errors };
  return { ok: true, value: { nearAccountId: row.valid.accountId, name: row.valid.receiverName, division, email: row.valid.email, mobilePhone: row.valid.mobilePhone, maxAmount: row.valid.amount } };
}

/** An existing division with the same name in another case keeps its spelling ("sales" → "Sales"). */
function canonicalDivision(db: Queryable, division: string): string {
  const existing = db.select({ d: recipients.division }).from(recipients).where(sql`lower(${recipients.division}) = ${division.toLowerCase()}`).get();
  return existing?.d ?? division;
}

// ------------------------------------------------------------------ changes

type Changes = Record<string, [string | boolean | null, string | boolean | null]>;

function logEvent(db: Queryable, input: { recipientId: string; actorId: string; at: Date; action: RecipientEventAction; source: string; changes: Changes }) {
  db.insert(recipientEvents).values({
    recipientId: input.recipientId, actorUserId: input.actorId, at: input.at, action: input.action, source: input.source, changes: JSON.stringify(input.changes),
  }).run();
}

const FIELDS_OF: (keyof CleanRecipient)[] = ['name', 'division', 'email', 'mobilePhone', 'maxAmount'];
const asText = (v: string | bigint) => (typeof v === 'bigint' ? v.toString() : v);

function insertRecipient(db: Queryable, actorId: string, value: CleanRecipient, now: Date, source: string, opts: { sample?: boolean } = {}): Recipient {
  if (db.select({ id: recipients.id }).from(recipients).where(eq(recipients.nearAccountId, value.nearAccountId)).get()) {
    throw new DomainError('conflict', `${value.nearAccountId} is already in the directory. Edit that recipient instead.`);
  }
  const id = randomUUID();
  const division = canonicalDivision(db, value.division);
  const row = {
    id, ...value, division, active: true, sample: opts.sample ?? false, readiness: 'unchecked' as const,
    createdByUserId: actorId, createdAt: now, updatedByUserId: actorId, updatedAt: now,
  };
  db.insert(recipients).values(row).run();
  const changes: Changes = { nearAccountId: [null, value.nearAccountId], active: [null, true] };
  for (const f of FIELDS_OF) changes[f] = [null, asText(f === 'division' ? division : value[f])];
  logEvent(db, { recipientId: id, actorId, at: now, action: 'created', source, changes });
  return db.select().from(recipients).where(eq(recipients.id, id)).get()!;
}

/** Applies a validated edit; returns the changed fields (empty = nothing to do). The account never changes. */
function applyEdit(db: Queryable, actorId: string, current: Recipient, value: Omit<CleanRecipient, 'nearAccountId'>, now: Date, source: string): Changes {
  const next = { ...value, division: canonicalDivision(db, value.division) };
  const changes: Changes = {};
  for (const f of FIELDS_OF) {
    if (f === 'nearAccountId') continue;
    const before = asText(current[f]);
    const after = asText(next[f]);
    if (before !== after) changes[f] = [before, after];
  }
  if (Object.keys(changes).length === 0) return changes;
  db.update(recipients).set({ ...next, updatedByUserId: actorId, updatedAt: now }).where(eq(recipients.id, current.id)).run();
  logEvent(db, { recipientId: current.id, actorId, at: now, action: 'updated', source, changes });
  return changes;
}

function audit(db: Queryable, actorId: string, action: string, entityId: string | null, detail: Record<string, unknown>, now: Date) {
  // PII-free: IDs, counts and field NAMES only (values live in recipient_events).
  db.insert(auditEvents).values({ at: now, actorUserId: actorId, action, entityType: 'recipient', entityId, detail: JSON.stringify(detail) }).run();
}

export function createRecipient(db: Db, actor: Principal, input: Partial<RecipientInput>, perRowCap: bigint, now: Date) {
  requireAdmin(actor);
  const v = validateRecipient(input, perRowCap);
  if (!v.ok) return v;
  const created = db.transaction((tx) => {
    const r = insertRecipient(tx, actor.id, v.value, now, 'form');
    audit(tx, actor.id, 'recipient.created', r.id, {}, now);
    return r;
  }, { behavior: 'immediate' });
  return { ok: true as const, recipient: created };
}

export function updateRecipient(db: Db, actor: Principal, id: string, input: Partial<RecipientInput>, perRowCap: bigint, now: Date, expectedUpdatedAt?: number) {
  requireAdmin(actor);
  const current = getRecipient(db, id);
  const v = validateRecipient({ ...input, nearAccountId: current.nearAccountId }, perRowCap);
  if (!v.ok) return v;
  const changes = db.transaction((tx) => {
    const fresh = getRecipient(tx, id);
    if (expectedUpdatedAt !== undefined && fresh.updatedAt.getTime() !== expectedUpdatedAt) {
      throw new DomainError('conflict', 'This recipient changed in another window. Reload and edit again.');
    }
    const { nearAccountId: _a, ...rest } = v.value;
    const c = applyEdit(tx, actor.id, fresh, rest, now, 'form');
    if (Object.keys(c).length) audit(tx, actor.id, 'recipient.updated', id, { fields: Object.keys(c) }, now);
    return c;
  }, { behavior: 'immediate' });
  return { ok: true as const, recipient: getRecipient(db, id), changed: Object.keys(changes) };
}

export function setRecipientActive(db: Db, actor: Principal, id: string, active: boolean, now: Date) {
  requireAdmin(actor);
  return db.transaction((tx) => {
    const r = getRecipient(tx, id);
    if (r.active === active) return r;
    tx.update(recipients).set({ active, updatedByUserId: actor.id, updatedAt: now }).where(eq(recipients.id, id)).run();
    logEvent(tx, { recipientId: id, actorId: actor.id, at: now, action: active ? 'reactivated' : 'deactivated', source: 'form', changes: { active: [r.active, active] } });
    audit(tx, actor.id, active ? 'recipient.reactivated' : 'recipient.deactivated', id, {}, now);
    return getRecipient(tx, id);
  }, { behavior: 'immediate' });
}

export function getRecipient(db: Queryable, id: string): Recipient {
  const r = db.select().from(recipients).where(eq(recipients.id, id)).get();
  if (!r) throw new DomainError('not_found', 'Recipient not found.');
  return r;
}

/** Records a read-only testnet check result (logged when it changes). */
export function recordReadiness(db: Db, actorId: string, id: string, readiness: CheckedReadiness, now: Date) {
  db.transaction((tx) => {
    const r = getRecipient(tx, id);
    tx.update(recipients).set({ readiness, readinessCheckedAt: now }).where(eq(recipients.id, id)).run();
    if (r.readiness !== readiness) logEvent(tx, { recipientId: id, actorId, at: now, action: 'readiness_checked', source: 'check', changes: { readiness: [r.readiness, readiness] } });
  }, { behavior: 'immediate' });
}

/** Checks accounts on testnet (read-only, a few at a time) and records the results. */
export async function checkReadiness(db: Db, checker: ReadinessChecker, actorId: string, ids: string[], now = () => new Date()) {
  const out: Record<string, CheckedReadiness> = {};
  const queue = [...ids];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const r = getRecipient(db, id);
      const result = await checker.check(r.nearAccountId);
      recordReadiness(db, actorId, id, result, now());
      out[id] = result;
    }
  });
  await Promise.all(workers);
  return out;
}

// ------------------------------------------------------------------ bulk import

export interface ImportPlan { create: CleanRecipient[]; update: { current: Recipient; value: CleanRecipient }[]; unchanged: number }

export function planImport(db: Queryable, rows: CleanRecipient[]): ImportPlan {
  const plan: ImportPlan = { create: [], update: [], unchanged: 0 };
  for (const value of rows) {
    const current = db.select().from(recipients).where(eq(recipients.nearAccountId, value.nearAccountId)).get();
    if (!current) plan.create.push(value);
    else if (FIELDS_OF.some((f) => f !== 'nearAccountId' && asText(current[f]) !== asText(f === 'division' ? canonicalDivision(db, value.division) : value[f]))) plan.update.push({ current, value });
    else plan.unchanged += 1;
  }
  return plan;
}

/**
 * Applies an accepted directory file in one transaction: new accounts are added (active),
 * existing ones are updated field by field (their active/inactive status is kept). Every
 * change is logged. Returns the counts and the IDs of the new recipients.
 */
export function applyImport(db: Db, actor: Principal, rows: CleanRecipient[], now: Date, opts: { source?: string; sample?: boolean } = {}) {
  requireAdmin(actor);
  return db.transaction((tx) => {
    const plan = planImport(tx, rows);
    const createdIds: string[] = [];
    for (const v of plan.create) createdIds.push(insertRecipient(tx, actor.id, v, now, opts.source ?? 'import', { sample: opts.sample ?? false }).id);
    for (const u of plan.update) {
      const { nearAccountId: _a, ...rest } = u.value;
      applyEdit(tx, actor.id, u.current, rest, now, opts.source ?? 'import');
    }
    const inactiveKept = plan.update.filter((u) => !u.current.active).length;
    audit(tx, actor.id, 'recipients.imported', null, { created: plan.create.length, updated: plan.update.length, unchanged: plan.unchanged }, now);
    return { created: plan.create.length, updated: plan.update.length, unchanged: plan.unchanged, inactiveKept, createdIds };
  }, { behavior: 'immediate' });
}

// ------------------------------------------------------------------ queries

export interface DirectoryQuery { q?: string; division?: string; status?: 'active' | 'inactive' | 'all'; page?: number; pageSize?: number }

export function listRecipients(db: Queryable, query: DirectoryQuery = {}) {
  const pageSize = query.pageSize ?? 50;
  const conds = [];
  const q = query.q?.trim().toLowerCase();
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(or(like(sql`lower(${recipients.name})`, pattern), like(recipients.nearAccountId, pattern), like(recipients.email, pattern)));
  }
  if (query.division) conds.push(eq(recipients.division, query.division));
  if (query.status === 'active') conds.push(eq(recipients.active, true));
  if (query.status === 'inactive') conds.push(eq(recipients.active, false));
  const where = conds.length ? and(...conds) : undefined;
  const total = db.select({ n: sql<number>`count(*)` }).from(recipients).where(where).get()?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, query.page ?? 1), pages);
  // Real (non-sample) recipients first, then by division and name.
  const rows = db.select().from(recipients).where(where)
    .orderBy(asc(recipients.sample), asc(recipients.division), asc(recipients.name), asc(recipients.nearAccountId))
    .limit(pageSize).offset((page - 1) * pageSize).all();
  return { rows, total, page, pages, pageSize };
}

export function directoryStats(db: Queryable) {
  const one = (where?: ReturnType<typeof eq>) => db.select({ n: sql<number>`count(*)` }).from(recipients).where(where).get()?.n ?? 0;
  return {
    total: one(),
    active: one(eq(recipients.active, true)),
    inactive: one(eq(recipients.active, false)),
    ready: one(and(eq(recipients.active, true), eq(recipients.readiness, 'ready'))),
    samples: one(eq(recipients.sample, true)),
  };
}

/** Division names with their number of active recipients (the assistant sees the names only). */
export function divisions(db: Queryable): { name: string; active: number; total: number }[] {
  return db.select({
    name: recipients.division,
    active: sql<number>`sum(case when ${recipients.active} then 1 else 0 end)`,
    total: sql<number>`count(*)`,
  }).from(recipients).groupBy(recipients.division).orderBy(asc(recipients.division)).all();
}

export interface DirectoryEvent { at: Date; actor: string; recipient: string; account: string; action: RecipientEventAction; source: string; changes: Changes }

export function recentDirectoryEvents(db: Queryable, limit = 15, recipientId?: string): DirectoryEvent[] {
  return db.select({
    at: recipientEvents.at, actor: users.displayName, recipient: recipients.name, account: recipients.nearAccountId,
    action: recipientEvents.action, source: recipientEvents.source, changes: recipientEvents.changes,
  }).from(recipientEvents)
    .innerJoin(recipients, eq(recipientEvents.recipientId, recipients.id))
    .innerJoin(users, eq(recipientEvents.actorUserId, users.id))
    .where(recipientId ? eq(recipientEvents.recipientId, recipientId) : undefined)
    .orderBy(desc(recipientEvents.id)).limit(limit).all()
    .map((e) => ({ ...e, changes: JSON.parse(e.changes) as Changes }));
}

/** "max per payout 0.10 → 0.20 tUSDC; division Sales → Operations". */
export function describeChanges(changes: Changes): string {
  const label: Record<string, string> = { name: 'name', division: 'division', email: 'email', mobilePhone: 'phone', maxAmount: 'maximum', active: 'status', readiness: 'testnet check', nearAccountId: 'NEAR account' };
  const fmt = (k: string, v: string | boolean | null) => {
    if (v === null) return '—';
    if (k === 'maxAmount') return `${formatAmountShort(BigInt(String(v)))} tUSDC`;
    if (k === 'active') return v ? 'active' : 'inactive';
    if (k === 'readiness') return READINESS_LABEL[v as RecipientReadiness] ?? String(v);
    return String(v);
  };
  return Object.entries(changes).map(([k, [a, b]]) => (a === null ? `${label[k] ?? k} ${fmt(k, b)}` : `${label[k] ?? k} ${fmt(k, a)} → ${fmt(k, b)}`)).join('; ');
}

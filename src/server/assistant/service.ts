/**
 * Payroll assistant (Phase 19), maker only. The model turns the maker's words into a structured
 * draft request; THIS module decides everything else, deterministically:
 * - the recipients come from the directory (active only), by division or exact name;
 * - the amount must be written by the maker (never guessed), in tUSDC, within the workflow's
 *   per-row cap, each recipient's maximum and the run cap;
 * - NEAR accounts in the request, other currencies and anything but drafting are refused;
 * - at most 20 requests per maker per hour.
 * It can only create a DRAFT owned by the signed-in maker. It has no access to submit, approve,
 * release, the workflow or the directory's write side (no imports of those modules).
 */
import { randomUUID } from 'node:crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import { can, type Principal } from '../auth/policy.ts';
import type { Db } from '../db/client.ts';
import { assistantRequests, auditEvents, draftRows, payrollRuns, recipients, type AssistantOutcome, type PostingMode, type RecipientReadiness } from '../db/schema.ts';
import { formatAmountShort, parseAmount } from '../money.ts';
import { divisions } from '../recipients/directory.ts';
import { activeLimits } from '../runs/draft-service.ts';
import { createRun, DomainError } from '../runs/repository.ts';
import { HOSTED_ASSISTANT_DAILY_CAP, hostedMode } from '../hosted.ts';
import { AssistantModelError, type AssistantModel, type AssistantTurn, type DraftRequest } from './model.ts';

export const RATE_LIMIT_PER_HOUR = 20;
export const MAX_TURNS = 7;
export const MAX_TURN_CHARS = 500;
export const PREVIEW_TTL_MS = 30 * 60_000;
export const OFF_MESSAGE = 'The payroll assistant is off on this copy (no API key).';

export interface PreviewRow { name: string; division: string; accountId: string; amount: string; readiness: RecipientReadiness; sample: boolean }
export interface Preview {
  title: string;
  postingMode: PostingMode;
  postingDefaulted: boolean;
  scope: string;
  amountPerPerson: string;
  count: number;
  total: string;
  rows: PreviewRow[];
  /** Recipients not confirmed "Ready to receive tUSDC" by the read-only testnet check. */
  notReady: number;
}

export type AssistantReply =
  | { kind: 'preview'; requestId: string; preview: Preview }
  | { kind: 'question'; requestId: string; question: string }
  | { kind: 'refused'; requestId: string; message: string }
  | { kind: 'error'; requestId: string; message: string }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'off'; message: string };

// ------------------------------------------------------------------ input

export function cleanTurns(input: unknown): AssistantTurn[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_TURNS) throw new DomainError('invalid', `Send 1 to ${MAX_TURNS} messages.`);
  const turns = input.map((t: unknown, i) => {
    const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
    const role = o.role === 'assistant' ? 'assistant' : o.role === 'user' ? 'user' : null;
    const text = typeof o.text === 'string' ? o.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim() : '';
    if (!role || !text) throw new DomainError('invalid', 'Every message needs a role and some text.');
    if (text.length > MAX_TURN_CHARS) throw new DomainError('invalid', `Keep each message under ${MAX_TURN_CHARS} characters.`);
    if ((i % 2 === 0) !== (role === 'user')) throw new DomainError('invalid', 'Messages must alternate, starting with yours.');
    return { role, text } as AssistantTurn;
  });
  if (turns.at(-1)?.role !== 'user') throw new DomainError('invalid', 'The last message must be yours.');
  return turns;
}

const userText = (turns: AssistantTurn[]) => turns.filter((t) => t.role === 'user').map((t) => t.text);

// ------------------------------------------------------------------ deterministic checks

const ACCOUNT_RE = /\b[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:testnet|near)\b/i;
const CURRENCY_RE = /[$€£¥]|\b(usd|usdc|usdt|eur|euros?|gbp|pounds?|idr|rupiah|dollars?|sgd|jpy|btc|eth)\b/i;
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Refusals that need no model call. */
function preCheck(texts: string[]): string | null {
  const joined = texts.join('\n');
  const account = ACCOUNT_RE.exec(joined)?.[0];
  if (account) return `The payroll assistant pays only recipients from the directory, chosen by division or name. It does not take NEAR accounts, so ${account} was not used. Nothing was created.`;
  const currency = CURRENCY_RE.exec(joined)?.[0];
  if (currency) return `Only tUSDC (the test token) can be paid. "${currency}" is not supported. Nothing was created.`;
  return null;
}

/** The amount must be a number the maker typed (never one the model made up). */
function amountWasTyped(amount: string, texts: string[]): boolean {
  const escaped = amount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\d.])${escaped}(?![\\d])`).test(texts.join('\n'));
}

type Resolution = { ok: true; preview: Preview; rows: (typeof recipients.$inferSelect)[]; amount: bigint } | { ok: false; kind: 'question' | 'refused'; message: string };

/** Turns a structured draft request into recipients and amounts, from the directory only. */
export function resolveDraftRequest(db: Db, req: DraftRequest, texts: string[], now: Date): Resolution {
  if (req.action === 'refuse') return { ok: false, kind: 'refused', message: `The payroll assistant only drafts payroll runs from the recipient directory${req.refusal_reason ? `: ${req.refusal_reason.replace(/\.$/, '')}` : ''}. It cannot submit, approve or release runs, change the workflow or add recipients. Nothing was created.` };
  if (req.action === 'ask') return { ok: false, kind: 'question', message: req.question ?? 'What should the run pay, to whom?' };

  if (req.currency && norm(req.currency) !== 'tusdc') return { ok: false, kind: 'refused', message: `Only tUSDC (the test token) can be paid. "${req.currency}" is not supported. Nothing was created.` };

  // Who: active recipients, by division and exact name. Unknown or ambiguous names are refused.
  if (!req.divisions.length && !req.recipients.length) return { ok: false, kind: 'question', message: 'Who should be paid? Name a division or the recipients.' };
  const known = divisions(db);
  const picked: (typeof recipients.$inferSelect)[] = [];
  const seen = new Set<string>();
  const add = (r: typeof recipients.$inferSelect) => { if (!seen.has(r.id)) { seen.add(r.id); picked.push(r); } };
  const scope: string[] = [];
  for (const d of req.divisions) {
    const match = known.find((k) => norm(k.name) === norm(d));
    if (!match) return { ok: false, kind: 'refused', message: `There is no division called "${d}" in the recipient directory. Nothing was created.` };
    if (!match.active) return { ok: false, kind: 'refused', message: `The ${match.name} division has no active recipients. Nothing was created.` };
    for (const r of db.select().from(recipients).where(and(eq(recipients.division, match.name), eq(recipients.active, true))).orderBy(recipients.name).all()) add(r);
    scope.push(`${match.name} division`);
  }
  for (const person of req.recipients) {
    const name = person.name;
    if (ACCOUNT_RE.test(name)) return { ok: false, kind: 'refused', message: `The payroll assistant does not take NEAR accounts ("${name}"); it pays only recipients from the directory by name or division. Nothing was created.` };
    const matches = db.select().from(recipients).where(sql`lower(trim(${recipients.name})) = ${norm(name)}`).all();
    let active = matches.filter((m) => m.active);
    if (person.division) {
      const division = known.find((k) => norm(k.name) === norm(person.division ?? ''));
      if (!division) return { ok: false, kind: 'refused', message: `There is no division called "${person.division}" in the recipient directory. Nothing was created.` };
      active = active.filter((m) => m.division === division.name);
      if (!active.length) return { ok: false, kind: 'refused', message: `There is no active recipient called "${name}" in the ${division.name} division. Nothing was created.` };
    }
    if (active.length === 0) {
      return { ok: false, kind: 'refused', message: matches.length ? `${matches[0]!.name} is inactive in the recipient directory. Nothing was created.` : `There is no recipient called "${name}" in the recipient directory. Nothing was created.` };
    }
    if (active.length > 1) {
      const where = [...new Set(active.map((m) => m.division))];
      return { ok: false, kind: 'question', message: `${active.length} active recipients are called ${active[0]!.name} (${where.join(', ')}). Which division is ${active[0]!.name} in? For example "${active[0]!.name} in ${where[0]}".` };
    }
    add(active[0]!);
    scope.push(active[0]!.name);
  }

  // How much: typed by the maker, tUSDC, within every cap.
  if (!req.amount_per_person) return { ok: false, kind: 'question', message: 'How much should each person receive, in tUSDC? For example 0.05.' };
  if (!amountWasTyped(req.amount_per_person, texts)) return { ok: false, kind: 'question', message: 'Please type the amount per person as a number in tUSDC, for example 0.05.' };
  const limits = activeLimits(db);
  const parsed = parseAmount(req.amount_per_person, limits.maxRowAmount);
  if (!parsed.ok) {
    return { ok: false, kind: 'refused', message: parsed.error === 'above_row_cap' ? `${req.amount_per_person} tUSDC per person is above the per-row cap of ${formatAmountShort(limits.maxRowAmount)} tUSDC. Nothing was created.` : `"${req.amount_per_person}" is not a valid tUSDC amount: ${parsed.message} Nothing was created.` };
  }
  const amount = parsed.value;
  const over = picked.filter((r) => amount > r.maxAmount);
  if (over.length) {
    const names = over.slice(0, 3).map((r) => `${r.name} (${formatAmountShort(r.maxAmount)})`).join(', ');
    return { ok: false, kind: 'refused', message: `${formatAmountShort(amount)} tUSDC is above the maximum per payout for ${names}${over.length > 3 ? ` and ${over.length - 3} more` : ''}. Nothing was created.` };
  }
  if (picked.length > 1000) return { ok: false, kind: 'refused', message: `That is ${picked.length.toLocaleString('en-US')} recipients; a run has at most 1,000. Nothing was created.` };
  const total = amount * BigInt(picked.length);
  if (total > limits.maxRunTotal) return { ok: false, kind: 'refused', message: `The total of ${formatAmountShort(total)} tUSDC is above the per-run cap of ${formatAmountShort(limits.maxRunTotal)} tUSDC. Nothing was created.` };

  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(now);
  const scopeText = scope.join(', ');
  return {
    ok: true, amount, rows: picked,
    preview: {
      title: req.title?.slice(0, 120) || `${scopeText} payout, ${month}`.slice(0, 120),
      postingMode: req.posting_mode ?? 'consolidated', postingDefaulted: !req.posting_mode,
      scope: scopeText, amountPerPerson: formatAmountShort(amount), count: picked.length, total: formatAmountShort(total),
      rows: picked.map((r) => ({ name: r.name, division: r.division, accountId: r.nearAccountId, amount: formatAmountShort(amount), readiness: r.readiness, sample: r.sample })),
      notReady: picked.filter((r) => r.readiness !== 'ready').length,
    },
  };
}

// ------------------------------------------------------------------ requests

function record(db: Db, input: { userId: string; now: Date; texts: string[]; outcome: AssistantOutcome; structured?: DraftRequest | null; message?: string | null; model?: string | null }) {
  const id = randomUUID();
  db.insert(assistantRequests).values({
    id, userId: input.userId, createdAt: input.now, requestText: input.texts.join('\n'), outcome: input.outcome,
    structured: input.structured ? JSON.stringify(input.structured) : null, message: input.message ?? null, model: input.model ?? null,
  }).run();
  return id;
}

export function requestsInLastHour(db: Db, userId: string, now: Date): number {
  return db.select({ n: sql<number>`count(*)` }).from(assistantRequests)
    .where(and(eq(assistantRequests.userId, userId), gte(assistantRequests.createdAt, new Date(now.getTime() - 3_600_000)))).get()?.n ?? 0;
}

/** All makers together, rolling 24 hours (the public demo's global cap). */
export function requestsInLastDay(db: Db, now: Date): number {
  return db.select({ n: sql<number>`count(*)` }).from(assistantRequests)
    .where(gte(assistantRequests.createdAt, new Date(now.getTime() - 86_400_000))).get()?.n ?? 0;
}

export async function interpretRequest(db: Db, model: AssistantModel | null, principal: Principal, rawTurns: unknown, now = new Date()): Promise<AssistantReply> {
  if (!can(principal, 'assistant.use')) throw new DomainError('forbidden', 'Only a maker can use the payroll assistant.');
  if (!model) return { kind: 'off', message: OFF_MESSAGE };
  const turns = cleanTurns(rawTurns);
  const texts = userText(turns);
  if (requestsInLastHour(db, principal.id, now) >= RATE_LIMIT_PER_HOUR) {
    return { kind: 'rate_limited', message: `You have used the payroll assistant ${RATE_LIMIT_PER_HOUR} times in the last hour. Try again later or create the run by hand.` };
  }
  if (hostedMode().demo && requestsInLastDay(db, now) >= HOSTED_ASSISTANT_DAILY_CAP) {
    return { kind: 'rate_limited', message: `The public demo's payroll assistant has reached its limit of ${HOSTED_ASSISTANT_DAILY_CAP} requests per day. Try again tomorrow, or create the run by hand.` };
  }
  const pre = preCheck(texts);
  if (pre) return { kind: 'refused', requestId: record(db, { userId: principal.id, now, texts, outcome: 'refused', message: pre }), message: pre };

  const divisionNames = divisions(db).map((d) => d.name);
  let structured: DraftRequest;
  try {
    // The model sees the maker's messages and the division names. Nothing else.
    structured = await model.interpret({ turns, divisions: divisionNames });
  } catch (error) {
    const message = error instanceof AssistantModelError
      ? `The payroll assistant is unavailable right now (${error.message}) Nothing was created; you can create the run by hand.`
      : 'The payroll assistant is unavailable right now. Nothing was created; you can create the run by hand.';
    return { kind: 'error', requestId: record(db, { userId: principal.id, now, texts, outcome: 'error', message, model: model.id }), message };
  }
  const r = resolveDraftRequest(db, structured, texts, now);
  if (!r.ok) {
    const outcome = r.kind === 'question' ? 'question' : 'refused';
    const requestId = record(db, { userId: principal.id, now, texts, outcome, structured, message: r.message, model: model.id });
    return r.kind === 'question' ? { kind: 'question', requestId, question: r.message } : { kind: 'refused', requestId, message: r.message };
  }
  const requestId = record(db, { userId: principal.id, now, texts, outcome: 'preview', structured, model: model.id });
  return { kind: 'preview', requestId, preview: r.preview };
}

/**
 * "Create draft": only for the maker who asked, once per preview, within 30 minutes. The
 * directory is resolved AGAIN from the stored request (a change since the preview counts).
 * Creates a manual DRAFT owned by that maker; nothing is submitted.
 */
export function createDraftFromPreview(db: Db, principal: Principal, requestId: string, now = new Date()): { runId: string; href: string } {
  if (!can(principal, 'assistant.use')) throw new DomainError('forbidden', 'Only a maker can use the payroll assistant.');
  const req = db.select().from(assistantRequests).where(eq(assistantRequests.id, requestId)).get();
  if (!req || req.userId !== principal.id) throw new DomainError('not_found', 'Preview not found.');
  if (req.runId) throw new DomainError('conflict', 'A draft was already created from this preview.');
  if (req.outcome !== 'preview' || !req.structured) throw new DomainError('invalid', 'This request has no preview to create a draft from.');
  if (now.getTime() - req.createdAt.getTime() > PREVIEW_TTL_MS) throw new DomainError('conflict', 'This preview is older than 30 minutes. Send the request again.');
  const texts = req.requestText.split('\n');
  const r = resolveDraftRequest(db, JSON.parse(req.structured) as DraftRequest, texts, now);
  if (!r.ok) throw new DomainError('conflict', `The directory changed since the preview: ${r.message}`);
  return db.transaction((tx) => {
    const runId = createRun(tx, {
      makerUserId: principal.id, title: r.preview.title, postingMode: r.preview.postingMode, source: 'manual', now,
      assistant: { requestId, requestText: req.requestText },
    });
    tx.update(assistantRequests).set({ runId, outcome: 'created' }).where(and(eq(assistantRequests.id, requestId), sql`${assistantRequests.runId} IS NULL`)).run();
    tx.insert(auditEvents).values({ at: now, actorUserId: principal.id, action: 'assistant.draft_created', entityType: 'payroll_run', entityId: runId, detail: JSON.stringify({ requestId, rows: r.rows.length }) }).run();
    r.rows.forEach((x, position) => {
      tx.insert(draftRows).values({ runId, position, nearAccountId: x.nearAccountId, receiverName: x.name, currency: 'tUSDC', amount: formatAmountShort(r.amount), mobilePhone: x.mobilePhone, email: x.email, sourceLine: null }).run();
    });
    tx.update(payrollRuns).set({ draftRevision: 1, updatedAt: now }).where(eq(payrollRuns.id, runId)).run();
    return { runId, href: `/maker/runs/${runId}` };
  }, { behavior: 'immediate' });
}

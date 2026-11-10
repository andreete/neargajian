/**
 * Phase 15 · permission boundaries (PRD A01, A07). Every API route is called directly with
 * real Requests by every principal that must NOT reach it: signed out, another maker, an
 * unassigned approver, the assigned approver on maker-only routes, the admin on run routes,
 * the maker on admin/approver routes, and the owner without CSRF token or from a foreign
 * origin. Each attempt must be refused with the right status, send no chain transaction and
 * change no state. Read routes must stay scoped to what the caller may see.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeVault } from '../helpers/fake-vault';

const BASE = 'http://127.0.0.1:8092';
const dir = mkdtempSync(join(tmpdir(), 'sentfund-bnd-'));
process.env.DATABASE_URL = `file:${join(dir, 'bnd.sqlite')}`;
process.env.DEMO_MODE = 'true';
process.env.APP_BASE_URL = BASE;

type Handler = (req: Request, ctx: { params: Promise<{ runId: string; recipientId: string; advanceId: string }> }) => Response | Promise<Response>;
type Who = 'anon' | 'maker' | 'maker2' | 'app1' | 'app3' | 'admin' | 'emp';
const fake = new FakeVault();
let db: import('@/server/db/client').Db;
let sqlite: import('better-sqlite3').Database;
const sessions = {} as Record<Exclude<Who, 'anon'>, { cookie: string; csrf: string }>;
const route = {} as Record<string, Record<string, Handler>>;
let DRAFT = '';
let LIVE = '';
let LIVE_VERSION = '';
let EMMA = '';

function call(who: Who, method: string, path: string, h: Handler, runId: string, body?: BodyInit | null, opts: { csrf?: boolean; origin?: string } = {}) {
  const headers = new Headers({ origin: opts.origin ?? BASE, 'x-forwarded-for': '198.51.100.9' });
  if (who !== 'anon') {
    headers.set('cookie', sessions[who].cookie);
    if (opts.csrf !== false) headers.set('x-csrf-token', sessions[who].csrf);
  }
  if (typeof body === 'string') headers.set('content-type', 'application/json');
  const req = new Request(`${BASE}${path}`, { method, headers, ...(body ? { body } : {}) });
  return Promise.resolve(h(req, { params: Promise.resolve({ runId, recipientId: runId, advanceId: runId }) }));
}

/** All API operations with a valid body, so only authorization can refuse them. */
function operations(): { name: string; method: string; path: (id: string) => string; h: () => Handler; body: () => BodyInit | null; run: () => string }[] {
  const j = (o: unknown) => () => JSON.stringify(o);
  const upload = () => { const f = new FormData(); f.set('file', new File([readFileSync('tests/live/live-3-rows.csv')], 'x.csv', { type: 'text/csv' })); f.set('expectedRevision', '1'); return f; };
  return [
    { name: 'create run', method: 'POST', path: () => '/api/runs', h: () => route.runs!.POST!, body: j({ title: 'Probe', postingMode: 'detailed', source: 'manual' }), run: () => '' },
    { name: 'run detail', method: 'GET', path: (id) => `/api/runs/${id}`, h: () => route.run!.GET!, body: () => null, run: () => LIVE },
    { name: 'draft read', method: 'GET', path: (id) => `/api/runs/${id}/draft`, h: () => route.draft!.GET!, body: () => null, run: () => DRAFT },
    { name: 'draft save', method: 'PUT', path: (id) => `/api/runs/${id}/draft`, h: () => route.draft!.PUT!, body: j({ expectedRevision: 1, rows: [] }), run: () => DRAFT },
    { name: 'confirm subset', method: 'POST', path: (id) => `/api/runs/${id}/draft/confirm-subset`, h: () => route.subset!.POST!, body: j({ expectedRevision: 1, removeIndexes: [0] }), run: () => DRAFT },
    { name: 'posting mode', method: 'POST', path: (id) => `/api/runs/${id}/posting-mode`, h: () => route.posting!.POST!, body: j({ postingMode: 'consolidated' }), run: () => DRAFT },
    { name: 'upload', method: 'POST', path: (id) => `/api/runs/${id}/upload`, h: () => route.upload!.POST!, body: upload, run: () => DRAFT },
    { name: 'submit', method: 'POST', path: (id) => `/api/runs/${id}/submit`, h: () => route.submit!.POST!, body: j({ expectedRevision: 1 }), run: () => DRAFT },
    { name: 'reconcile', method: 'POST', path: (id) => `/api/runs/${id}/reconcile`, h: () => route.reconcile!.POST!, body: () => null, run: () => LIVE },
    { name: 'cancel', method: 'POST', path: (id) => `/api/runs/${id}/cancel`, h: () => route.cancel!.POST!, body: () => null, run: () => LIVE },
    { name: 'release', method: 'POST', path: (id) => `/api/runs/${id}/release`, h: () => route.release!.POST!, body: () => null, run: () => LIVE },
    { name: 'decision', method: 'POST', path: (id) => `/api/runs/${id}/decision`, h: () => route.decision!.POST!, body: () => JSON.stringify({ versionId: LIVE_VERSION, decision: 'approve' }), run: () => LIVE },
    { name: 'admin workflow read', method: 'GET', path: () => '/api/admin/workflow', h: () => route.workflow!.GET!, body: () => null, run: () => '' },
    { name: 'admin workflow change', method: 'POST', path: () => '/api/admin/workflow', h: () => route.workflow!.POST!, body: j({ kind: 'one', approverUserIds: ['usr_app1'], releaseMode: 'maker' }), run: () => '' },
    { name: 'admin workflow reconcile', method: 'POST', path: () => '/api/admin/workflow/reconcile', h: () => route.wfReconcile!.POST!, body: () => null, run: () => '' },
    { name: 'admin audit', method: 'GET', path: () => '/api/admin/audit', h: () => route.audit!.GET!, body: () => null, run: () => '' },
    { name: 'company CSV', method: 'GET', path: () => '/api/reports/company', h: () => route.company!.GET!, body: () => null, run: () => '' },
    { name: 'recipient CSV', method: 'GET', path: () => '/api/reports/recipients', h: () => route.recipients!.GET!, body: () => null, run: () => '' },
    // Phase 19: recipient directory and settings (admin only), payroll assistant (maker only).
    { name: 'admin recipients list', method: 'GET', path: () => '/api/admin/recipients', h: () => route.rcpList!.GET!, body: () => null, run: () => '' },
    { name: 'admin recipient add', method: 'POST', path: () => '/api/admin/recipients', h: () => route.rcpList!.POST!, body: j({ nearAccountId: 'probe.testnet', name: 'Probe Person', division: 'Sales', email: 'p@example.com', mobilePhone: '+44 7700 900500', maxAmount: '0.05' }), run: () => '' },
    { name: 'admin recipient edit', method: 'PATCH', path: (id) => `/api/admin/recipients/${id}`, h: () => route.rcpOne!.PATCH!, body: j({ name: 'Changed', division: 'Sales', email: 'c@example.com', mobilePhone: '+44 7700 900501', maxAmount: '0.09' }), run: () => EMMA },
    { name: 'admin recipient status', method: 'POST', path: (id) => `/api/admin/recipients/${id}/status`, h: () => route.rcpStatus!.POST!, body: j({ active: false }), run: () => EMMA },
    { name: 'admin recipient check', method: 'POST', path: (id) => `/api/admin/recipients/${id}/check`, h: () => route.rcpCheck!.POST!, body: () => null, run: () => EMMA },
    { name: 'admin recipients import', method: 'POST', path: () => '/api/admin/recipients/import', h: () => route.rcpImport!.POST!, body: () => { const f = new FormData(); f.set('file', new File(['near_account_id,receiver_name,currency,amount,mobile_phone,email,division\nprobe2.testnet,Probe Two,tUSDC,0.05,+44 7700 900502,p2@example.com,Sales\n'], 'd.csv', { type: 'text/csv' })); return f; }, run: () => '' },
    { name: 'admin settings read', method: 'GET', path: () => '/api/admin/settings', h: () => route.settings!.GET!, body: () => null, run: () => '' },
    { name: 'admin settings change', method: 'POST', path: () => '/api/admin/settings', h: () => route.settings!.POST!, body: j({ registeredRecipientsOnly: false }), run: () => '' },
    { name: 'assistant', method: 'POST', path: () => '/api/assistant', h: () => route.assistant!.POST!, body: j({ messages: [{ role: 'user', text: 'Pay the Sales division 0.05 each' }] }), run: () => '' },
    { name: 'assistant draft', method: 'POST', path: () => '/api/assistant/drafts', h: () => route.assistantDraft!.POST!, body: j({ requestId: 'none' }), run: () => '' },
    // Phase 21: identity checks (admin only).
    { name: 'identity check', method: 'POST', path: () => '/api/admin/identity/check', h: () => route.idCheck!.POST!, body: () => { const f = new FormData(); f.set('recipientId', EMMA); f.set('ktp', new File([readFileSync('public/specimens/emma-ktp.jpg')], 'k.jpg', { type: 'image/jpeg' })); f.set('face', new File([readFileSync('public/specimens/emma-selfie.jpg')], 'f.jpg', { type: 'image/jpeg' })); return f; }, run: () => '' },
    { name: 'identity specimen', method: 'POST', path: () => '/api/admin/identity/specimen', h: () => route.idSpecimen!.POST!, body: j({ scenario: 'impostor' }), run: () => '' },
    { name: 'identity review', method: 'POST', path: () => '/api/admin/identity/review', h: () => route.idReview!.POST!, body: () => JSON.stringify({ recipientId: EMMA, decision: 'failed', reason: 'probe reason' }), run: () => '' },
    // Phase 23: Payroll Advance (employee self-service, maker handling, admin policy).
    { name: 'advance request', method: 'POST', path: () => '/api/employee/advances', h: () => route.advRequest!.POST!, body: j({ amount: '0.30', consent: true }), run: () => '' },
    { name: 'advance decline', method: 'POST', path: (id) => `/api/advances/${id}/decline`, h: () => route.advDecline!.POST!, body: j({ reason: 'probe reason' }), run: () => 'adv-probe' },
    { name: 'advance submit', method: 'POST', path: (id) => `/api/advances/${id}/submit`, h: () => route.advSubmit!.POST!, body: () => null, run: () => 'adv-probe' },
    { name: 'admin payroll advance policy', method: 'POST', path: () => '/api/admin/payroll-advance', h: () => route.advPolicy!.POST!, body: j({ enabled: false, maxPercent: 100, feeBps: 100, instalments: 3, minDays: 30 }), run: () => '' },
  ];
}

const ADMIN_DIRECTORY = ['admin recipients list', 'admin recipient add', 'admin recipient edit', 'admin recipient status', 'admin recipient check', 'admin recipients import', 'admin settings read', 'admin settings change', 'identity check', 'identity specimen', 'identity review'];

const ADVANCE = ['advance request', 'advance decline', 'advance submit', 'admin payroll advance policy'];
/** Everything an employee must never reach (all but its own request route; run detail answers 404). */
const NOT_FOR_EMPLOYEES = () => operations().map((o) => o.name).filter((n) => n !== 'advance request' && n !== 'run detail');

/** Who must be refused where, and with which status. */
const DENIED: [Who, string[], number][] = [
  // Phase 23: the employee role reaches nothing but its own Payroll Advance request.
  ['emp', NOT_FOR_EMPLOYEES(), 403],
  ['emp', ['run detail'], 404],
  ['maker', ['advance request', 'admin payroll advance policy'], 403],
  ['app1', ADVANCE, 403],
  ['admin', ['advance request', 'advance decline', 'advance submit'], 403],
  ['maker2', ['run detail', 'draft read', 'draft save', 'confirm subset', 'posting mode', 'upload', 'submit', 'reconcile', 'cancel', 'release'], 404],
  ['app3', ['run detail', 'reconcile', 'decision'], 404],
  ['app1', ['create run', 'draft read', 'draft save', 'confirm subset', 'posting mode', 'upload', 'submit', 'cancel', 'release', 'admin workflow read', 'admin workflow change', 'admin workflow reconcile', 'admin audit', ...ADMIN_DIRECTORY, 'assistant', 'assistant draft'], 403],
  ['admin', ['create run', 'draft read', 'draft save', 'confirm subset', 'posting mode', 'upload', 'submit', 'reconcile', 'cancel', 'release', 'decision', 'recipient CSV', 'assistant', 'assistant draft'], 403],
  ['maker', ['decision', 'admin workflow read', 'admin workflow change', 'admin workflow reconcile', 'admin audit', ...ADMIN_DIRECTORY], 403],
];

function state() {
  const q = (s: string, ...a: unknown[]) => sqlite.prepare(s).all(...a);
  return JSON.stringify({
    runs: q('select id, title, posting_mode, draft_revision from payroll_runs order by id'),
    draftRows: q('select run_id, position, near_account_id, amount from draft_rows order by run_id, position'),
    versions: q('select id, status from run_versions order by id'),
    events: q('select id, status from approval_events order by id'),
    actions: q('select id, status from payout_actions order by id'),
    workflows: q('select id, chain_status from workflow_configs order by id'),
    recipients: q('select id, name, max_amount, active, readiness from recipients order by id'),
    recipientEvents: q('select count(*) as n from recipient_events'),
    settings: q('select key, value from app_settings order by key'),
    assistant: q('select count(*) as n from assistant_requests'),
    identity: q('select id, identity_status, identity_check_id from recipients order by id'),
    identityChecks: q('select count(*) as n from identity_checks'),
    advances: q('select id, status from payroll_advances order by id'),
    advanceLedger: q('select count(*) as n from advance_ledger'),
  });
}

beforeAll(async () => {
  const client = await import('@/server/db/client');
  const handle = client.getDatabase();
  db = handle.db;
  sqlite = handle.sqlite;
  const seed = await import('@/server/db/seed');
  await seed.seedDemo(db, { recipientDirectory: true });
  (await import('@/server/chain/vault-client')).setVaultClientForTests(fake);
  (await import('@/server/assistant/factory')).setAssistantModelForTests((await import('@/server/assistant/stub-model')).stubModel());
  (await import('@/server/recipients/readiness')).setReadinessCheckerForTests({ check: async () => 'ready' });
  (await import('@/server/identity/ktp-reader')).setKtpReaderForTests((await import('@/server/identity/ktp-reader')).stubKtpReader());
  EMMA = (sqlite.prepare("select id from recipients where near_account_id = 'recipient1.sentfund-payroll.testnet'").get() as { id: string }).id;
  const { users } = await import('@/server/db/schema');
  const hash = sqlite.prepare("select password_hash as h from users where id = 'usr_maker'").get() as { h: string };
  db.insert(users).values([
    { id: 'usr_maker2', email: 'maker2@example.com', displayName: 'Other Maker', role: 'maker', passwordHash: hash.h, chainAccountId: null, createdAt: new Date() },
    { id: 'usr_app3', email: 'app3@example.com', displayName: 'Unassigned Approver', role: 'approver', passwordHash: hash.h, chainAccountId: null, createdAt: new Date() },
  ]).run();
  const { createSession, SESSION_COOKIE } = await import('@/server/auth/session');
  for (const [who, id] of [['maker', 'usr_maker'], ['maker2', 'usr_maker2'], ['app1', 'usr_app1'], ['app3', 'usr_app3'], ['admin', 'usr_admin'], ['emp', 'usr_emp_emma']] as const) {
    const s = createSession(db, id, new Date());
    sessions[who] = { cookie: `${SESSION_COOKIE}=${s.token}`, csrf: s.csrfToken };
  }
  DRAFT = seed.DEMO_DRAFT_RUN_ID;
  // A second run of the maker, submitted and waiting for approver 1.
  const { createRun } = await import('@/server/runs/repository');
  const { uploadToDraft } = await import('@/server/runs/draft-service');
  const lc = await import('@/server/runs/lifecycle');
  LIVE = createRun(db, { makerUserId: 'usr_maker', title: 'Boundary live run', postingMode: 'detailed', source: 'upload', now: new Date() });
  uploadToDraft(db, { id: 'usr_maker', role: 'maker' }, LIVE, { filename: 'live.csv', bytes: readFileSync('tests/live/live-3-rows.csv'), expectedRevision: 0, now: new Date() });
  await lc.submitRun(db, fake, { id: 'usr_maker', role: 'maker' }, LIVE, { expectedRevision: 1 });
  LIVE_VERSION = lc.latestVersion(db, LIVE)!.id;
  await lc.reconcileVersion(db, fake, LIVE_VERSION);
  expect(lc.latestVersion(db, LIVE)!.status).toBe('pending_approval');

  const load = async (p: string) => (await import(/* @vite-ignore */ p)) as Record<string, Handler>;
  route.runs = await load('@/app/api/runs/route');
  route.run = await load('@/app/api/runs/[runId]/route');
  route.draft = await load('@/app/api/runs/[runId]/draft/route');
  route.subset = await load('@/app/api/runs/[runId]/draft/confirm-subset/route');
  route.posting = await load('@/app/api/runs/[runId]/posting-mode/route');
  route.upload = await load('@/app/api/runs/[runId]/upload/route');
  route.submit = await load('@/app/api/runs/[runId]/submit/route');
  route.reconcile = await load('@/app/api/runs/[runId]/reconcile/route');
  route.cancel = await load('@/app/api/runs/[runId]/cancel/route');
  route.release = await load('@/app/api/runs/[runId]/release/route');
  route.decision = await load('@/app/api/runs/[runId]/decision/route');
  route.workflow = await load('@/app/api/admin/workflow/route');
  route.wfReconcile = await load('@/app/api/admin/workflow/reconcile/route');
  route.audit = await load('@/app/api/admin/audit/route');
  route.company = await load('@/app/api/reports/company/route');
  route.recipients = await load('@/app/api/reports/recipients/route');
  route.rcpList = await load('@/app/api/admin/recipients/route');
  route.rcpOne = await load('@/app/api/admin/recipients/[recipientId]/route');
  route.rcpStatus = await load('@/app/api/admin/recipients/[recipientId]/status/route');
  route.rcpCheck = await load('@/app/api/admin/recipients/[recipientId]/check/route');
  route.rcpImport = await load('@/app/api/admin/recipients/import/route');
  route.settings = await load('@/app/api/admin/settings/route');
  route.assistant = await load('@/app/api/assistant/route');
  route.assistantDraft = await load('@/app/api/assistant/drafts/route');
  route.idCheck = await load('@/app/api/admin/identity/check/route');
  route.idSpecimen = await load('@/app/api/admin/identity/specimen/route');
  route.idReview = await load('@/app/api/admin/identity/review/route');
  route.advRequest = await load('@/app/api/employee/advances/route');
  route.advDecline = await load('@/app/api/advances/[advanceId]/decline/route');
  route.advSubmit = await load('@/app/api/advances/[advanceId]/submit/route');
  route.advPolicy = await load('@/app/api/admin/payroll-advance/route');
}, 60_000);

afterAll(async () => {
  (await import('@/server/chain/vault-client')).setVaultClientForTests(undefined);
  (await import('@/server/assistant/factory')).setAssistantModelForTests(undefined);
  (await import('@/server/recipients/readiness')).setReadinessCheckerForTests(undefined);
  (await import('@/server/db/client')).closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

describe('API permission boundaries', () => {
  it('signed out: every protected route answers 401 and changes nothing', async () => {
    const before = state();
    const calls = fake.calls.length;
    for (const op of operations()) {
      const res = await call('anon', op.method, op.path(op.run()), op.h(), op.run(), op.body());
      expect(res.status, op.name).toBe(401);
    }
    expect(state()).toBe(before);
    expect(fake.calls.length).toBe(calls);
  });

  it('wrong role, wrong owner or unassigned approver: refused with 403/404, no transaction, no state change', async () => {
    const before = state();
    const calls = fake.calls.length;
    const ops = new Map(operations().map((o) => [o.name, o]));
    let checked = 0;
    for (const [who, names, status] of DENIED) {
      for (const name of names) {
        const op = ops.get(name)!;
        const res = await call(who, op.method, op.path(op.run()), op.h(), op.run(), op.body());
        expect(res.status, `${who} → ${name}`).toBe(status);
        checked += 1;
      }
    }
    expect(checked).toBe(112); // Phase 21: + 3 identity routes × (approver, maker); Phase 23: + 34 employee, + 9 advance routes × other roles
    expect(state()).toBe(before);
    expect(fake.calls.length).toBe(calls);
  });

  it('the owner without CSRF token or from another origin is refused on every mutation', async () => {
    const before = state();
    const calls = fake.calls.length;
    for (const op of operations().filter((o) => o.method !== 'GET')) {
      const who: Who = op.name.startsWith('admin') ? 'admin' : op.name === 'decision' ? 'app1' : op.name === 'advance request' ? 'emp' : 'maker';
      const noCsrf = await call(who, op.method, op.path(op.run()), op.h(), op.run(), op.body(), { csrf: false });
      expect(noCsrf.status, `${op.name} without CSRF`).toBe(403);
      const foreign = await call(who, op.method, op.path(op.run()), op.h(), op.run(), op.body(), { origin: 'https://evil.example' });
      expect(foreign.status, `${op.name} from another origin`).toBe(403);
    }
    expect(state()).toBe(before);
    expect(fake.calls.length).toBe(calls);
  });

  it('Phase 19 happy paths: the admin adds a recipient (checked on testnet), the maker drafts with the assistant, nobody else can use that preview', async () => {
    const ops = new Map(operations().map((o) => [o.name, o]));
    const add = ops.get('admin recipient add')!;
    const added = await call('admin', 'POST', add.path(''), add.h(), '', add.body());
    expect(added.status).toBe(201);
    expect(((await added.json()) as { recipient: { readinessLabel: string } }).recipient.readinessLabel).toBe('Ready to receive tUSDC');
    const ask = ops.get('assistant')!;
    const reply = (await (await call('maker', 'POST', ask.path(''), ask.h(), '', ask.body())).json()) as { kind: string; requestId: string; preview: { count: number } };
    expect(reply).toMatchObject({ kind: 'preview', preview: { count: 3 } }); // Emma, Daniel and the probe recipient
    const draft = ops.get('assistant draft')!;
    const stolen = await call('maker2', 'POST', draft.path(''), draft.h(), '', JSON.stringify({ requestId: reply.requestId }));
    expect(stolen.status).toBe(404);
    const created = await call('maker', 'POST', draft.path(''), draft.h(), '', JSON.stringify({ requestId: reply.requestId }));
    expect(created.status).toBe(201);
    expect(fake.calls.filter((c) => c.method === 'create_run').length).toBe(1); // only the earlier boundary run: the assistant sends nothing
  });

  it('read routes stay scoped: lists and exports show only what the caller may see', async () => {
    const ops = new Map(operations().map((o) => [o.name, o]));
    const text = async (who: Who, name: string) => (await call(who, 'GET', ops.get(name)!.path(''), ops.get(name)!.h(), '', null)).text();
    expect(await text('maker2', 'company CSV')).not.toContain('Boundary live run');
    expect(await text('app3', 'recipient CSV')).not.toContain('@example.com');
    const listed = await (await call('maker2', 'GET', '/api/runs', route.runs!.GET!, '', null)).text();
    expect(listed).not.toContain(LIVE);
    expect(listed).not.toContain(DRAFT);
    const app3 = await (await call('app3', 'GET', '/api/runs', route.runs!.GET!, '', null)).text();
    expect(app3).not.toContain(LIVE);
    // The assigned approver can read the run it must review; the owner can too.
    expect((await call('app1', 'GET', `/api/runs/${LIVE}`, route.run!.GET!, LIVE, null)).status).toBe(200);
    expect((await call('maker', 'GET', `/api/runs/${LIVE}`, route.run!.GET!, LIVE, null)).status).toBe(200);
  });
});

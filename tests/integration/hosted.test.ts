/**
 * Phase 20 · hosted demo mode (HOSTED_DEMO=true) and the kill switch (HOSTED_READONLY=true).
 * Submit only when every recipient is "Ready to receive tUSDC"; directory and settings read-only;
 * no admin key allowed; assistant daily cap; every mutation but sign-out refused when read-only.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FakeVault } from '../helpers/fake-vault';

const BASE = 'http://127.0.0.1:8092';
const dir = mkdtempSync(join(tmpdir(), 'sentfund-hosted-'));
process.env.DATABASE_URL = `file:${join(dir, 'h.sqlite')}`;
process.env.DEMO_MODE = 'true';
process.env.APP_BASE_URL = BASE;

type H = (r: Request, c?: unknown) => Promise<Response> | Response;
let db: import('@/server/db/client').Db;
let sqlite: import('better-sqlite3').Database;
const maker = { id: 'usr_maker', role: 'maker' as const };
const admin = { id: 'usr_admin', role: 'admin' as const };
const sessions: Record<string, { cookie: string; csrf: string }> = {};
const NOW = new Date('2026-11-10T08:00:00Z');

beforeAll(async () => {
  ({ db, sqlite } = (await import('@/server/db/client')).getDatabase());
  await (await import('@/server/db/seed')).seedDemo(db, { recipientDirectory: true, testnetHistory: false, demoDraft: false, now: NOW });
  // The live recipients were checked "Ready" on testnet (demo:reset does this read-only).
  const { recordReadiness } = await import('@/server/recipients/directory');
  const live = sqlite.prepare('select id from recipients where sample = 0').all() as { id: string }[];
  for (const r of live) recordReadiness(db, 'usr_admin', r.id, 'ready', NOW);
  const { createSession, SESSION_COOKIE } = await import('@/server/auth/session');
  for (const [who, id] of [['maker', 'usr_maker'], ['admin', 'usr_admin'], ['emma', 'usr_emp_emma'], ['daniel', 'usr_emp_daniel'], ['admin2', 'usr_admin']] as const) {
    const s = createSession(db, id, new Date());
    sessions[who] = { cookie: `${SESSION_COOKIE}=${s.token}`, csrf: s.csrfToken };
  }
});
afterEach(() => {
  delete process.env.HOSTED_DEMO;
  delete process.env.HOSTED_READONLY;
});
afterAll(async () => {
  (await import('@/server/db/client')).closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

const req = (who: string, path: string, method = 'GET', body?: BodyInit) => {
  const headers = new Headers({ origin: BASE, cookie: sessions[who]!.cookie, 'x-csrf-token': sessions[who]!.csrf });
  if (typeof body === 'string') headers.set('content-type', 'application/json');
  return new Request(`${BASE}${path}`, { method, headers, ...(body ? { body } : {}) });
};

async function uploadRun(file: string, title: string) {
  const { createRun } = await import('@/server/runs/repository');
  const { uploadToDraft } = await import('@/server/runs/draft-service');
  const id = createRun(db, { makerUserId: maker.id, title, postingMode: 'detailed', source: 'upload', now: NOW });
  const out = uploadToDraft(db, maker, id, { filename: file.split('/').pop()!, bytes: readFileSync(file), expectedRevision: 0, now: NOW });
  expect(out.result.ok, file).toBe(true);
  return id;
}

describe('hosted mode flags and keys', () => {
  it('reads the flags on every call and refuses the admin key in the public demo', async () => {
    const { hostedMode, assertHostedKeys } = await import('@/server/hosted');
    const { loadConfig } = await import('@/server/config');
    expect(hostedMode({})).toEqual({ demo: false, readOnly: false });
    expect(hostedMode({ HOSTED_DEMO: 'true', HOSTED_READONLY: 'true' })).toEqual({ demo: true, readOnly: true });
    expect(() => assertHostedKeys({ HOSTED_DEMO: 'true', ADMIN_SIGNER_PRIVATE_KEY: 'ed25519:x' })).toThrow(/never holds the admin key/);
    expect(() => loadConfig({ HOSTED_DEMO: 'true', ADMIN_SIGNER_PRIVATE_KEY: 'ed25519:x' })).toThrow(/never holds the admin key/);
    expect(() => assertHostedKeys({ ADMIN_SIGNER_PRIVATE_KEY: 'ed25519:x' })).not.toThrow();
    const hostedConfig = loadConfig({ HOSTED_DEMO: 'true', MAKER_SIGNER_PRIVATE_KEY: 'a', APPROVER1_SIGNER_PRIVATE_KEY: 'b', APPROVER2_SIGNER_PRIVATE_KEY: 'c', WORKER_SIGNER_PRIVATE_KEY: 'd' });
    expect([hostedConfig.chainWritesEnabled, hostedConfig.adminWritesEnabled]).toEqual([true, false]);
  });
});

describe('public demo submit gate', () => {
  it('refuses the 1,000-row sample (upload and preview work) and sends nothing', async () => {
    process.env.HOSTED_DEMO = 'true';
    const id = await uploadRun('public/templates/sentfund-payroll-sample-1000.csv', 'Hosted sample check');
    const { submitRun, latestVersion } = await import('@/server/runs/lifecycle');
    const fake = new FakeVault();
    await expect(submitRun(db, fake, maker, id, { expectedRevision: 1, now: NOW })).rejects.toThrow(
      /^Public demo: a run can only pay recipients that are in the directory and "Ready to receive tUSDC" on testnet \(here: .*Emma Clark.*\)\. 1,000 of 1,000 rows are not \(the sample employees’ accounts do not exist on testnet\), so this run cannot be submitted here\. Nothing was sent\./,
    );
    expect(fake.calls).toEqual([]);
    expect(latestVersion(db, id)).toBeNull();
  });

  it('submits a run that pays only ready recipients; a recipient that is not checked "Ready" blocks it', async () => {
    process.env.HOSTED_DEMO = 'true';
    const { submitRun } = await import('@/server/runs/lifecycle');
    const ok = await uploadRun('tests/live/live-3-rows.csv', 'Hosted live recipients');
    const fake = new FakeVault();
    const r = await submitRun(db, fake, maker, ok, { expectedRevision: 1, now: NOW });
    expect(r.status).toBe('submitting');
    expect(fake.calls.map((c) => c.method)).toEqual(['create_run']);

    const grace = (sqlite.prepare("select id from recipients where near_account_id = 'recipient3.sentfund-payroll.testnet'").get() as { id: string }).id;
    const { recordReadiness } = await import('@/server/recipients/directory');
    recordReadiness(db, 'usr_admin', grace, 'check_failed', NOW);
    const blocked = await uploadRun('tests/live/live-3-rows.csv', 'Hosted with an unverified recipient');
    const fake2 = new FakeVault();
    await expect(submitRun(db, fake2, maker, blocked, { expectedRevision: 1, now: NOW })).rejects.toThrow(/1 of 3 rows are not, so this run cannot be submitted here/);
    expect(fake2.calls).toEqual([]);
    recordReadiness(db, 'usr_admin', grace, 'ready', NOW);

    delete process.env.HOSTED_DEMO; // off: the sample is submittable (validated and sent to the stand-in vault)
    const { setIdentityVerifiedOnly } = await import('@/server/identity/service');
    setIdentityVerifiedOnly(db, { id: 'usr_admin', role: 'admin' }, false, NOW); // the sample employees are not identity-verified (Phase 21)
    const sample = await uploadRun('public/templates/sentfund-payroll-uniform-1000.csv', 'Local sample');
    const fake3 = new FakeVault();
    expect((await submitRun(db, fake3, maker, sample, { expectedRevision: 1, now: NOW })).status).toBe('submitting');
  });
});

describe('directory and settings are read-only in the public demo', () => {
  it('refuses every change with 403 and changes nothing; reading still works', async () => {
    process.env.HOSTED_DEMO = 'true';
    const load = async (p: string) => (await import(/* @vite-ignore */ p)) as Record<string, H>;
    const list = await load('@/app/api/admin/recipients/route');
    const one = await load('@/app/api/admin/recipients/[recipientId]/route');
    const status = await load('@/app/api/admin/recipients/[recipientId]/status/route');
    const check = await load('@/app/api/admin/recipients/[recipientId]/check/route');
    const imp = await load('@/app/api/admin/recipients/import/route');
    const settings = await load('@/app/api/admin/settings/route');
    const emma = (sqlite.prepare("select id from recipients where near_account_id = 'recipient1.sentfund-payroll.testnet'").get() as { id: string }).id;
    const ctx = { params: Promise.resolve({ recipientId: emma }) };
    const before = JSON.stringify(sqlite.prepare('select * from recipients order by id').all()) + JSON.stringify(sqlite.prepare('select * from app_settings').all());
    const form = () => { const f = new FormData(); f.set('file', new File(['near_account_id,receiver_name,currency,amount,mobile_phone,email,division\nx.testnet,X Y,tUSDC,0.05,+44 7700 900400,x@example.com,Sales\n'], 'd.csv')); return f; };
    const attempts: [string, Promise<Response> | Response][] = [
      ['add', list.POST!(req('admin', '/api/admin/recipients', 'POST', JSON.stringify({ nearAccountId: 'payee.testnet', name: 'New Payee', division: 'Sales', email: 'p@example.com', mobilePhone: '+44 7700 900401', maxAmount: '0.05' })))],
      ['edit', one.PATCH!(req('admin', `/api/admin/recipients/${emma}`, 'PATCH', JSON.stringify({ name: 'Emma Clark', division: 'Sales', email: 'e@example.com', mobilePhone: '+44 7700 900101', maxAmount: '1' })), ctx)],
      ['status', status.POST!(req('admin', `/api/admin/recipients/${emma}/status`, 'POST', JSON.stringify({ active: false })), ctx)],
      ['check', check.POST!(req('admin', `/api/admin/recipients/${emma}/check`, 'POST'), ctx)],
      ['import', imp.POST!(req('admin', '/api/admin/recipients/import', 'POST', form()))],
      ['setting', settings.POST!(req('admin', '/api/admin/settings', 'POST', JSON.stringify({ registeredRecipientsOnly: false })))],
    ];
    for (const [name, p] of attempts) {
      const res = await p;
      expect(res.status, name).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code, name).toBe('hosted_read_only');
    }
    expect(JSON.stringify(sqlite.prepare('select * from recipients order by id').all()) + JSON.stringify(sqlite.prepare('select * from app_settings').all())).toBe(before);
    expect((await list.GET!(req('admin', '/api/admin/recipients'))).status).toBe(200);
  });
});

describe('kill switch HOSTED_READONLY', () => {
  it('refuses mutations with 503 but keeps sign-in, sign-out and reads working', async () => {
    process.env.HOSTED_READONLY = 'true';
    const runs = (await import('@/app/api/runs/route')) as unknown as { POST: H; GET: H };
    const create = await runs.POST(req('maker', '/api/runs', 'POST', JSON.stringify({ title: 'Paused?', postingMode: 'detailed', source: 'manual' })));
    expect(create.status).toBe(503);
    expect(((await create.json()) as { error: { code: string; message: string } }).error).toMatchObject({ code: 'read_only', message: expect.stringMatching(/read-only right now/) });
    expect((await runs.GET(req('maker', '/api/runs'))).status).toBe(200);
    const login = (await import('@/app/api/auth/login/route')) as unknown as { POST: H };
    const signIn = await login.POST(new Request(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': '10.9.0.1' }, body: JSON.stringify({ email: 'app1@sentfund.my.id', password: '12345678' }) }));
    expect(signIn.status).toBe(200);
    const logout = (await import('@/app/api/auth/logout/route')) as unknown as { POST: H };
    expect((await logout.POST(req('admin', '/api/auth/logout', 'POST'))).status).toBe(204);
    const health = (await import('@/app/api/health/route')) as unknown as { GET: () => Response };
    expect(await health.GET().json()).toMatchObject({ status: 'ok', db: 'ok', readOnly: true });
  });
});

describe('sign-in lockout in the public demo', () => {
  it('a visitor who keeps failing locks only themselves, not the shared demo account', async () => {
    const { login } = await import('@/server/auth/login');
    const at = new Date();
    const attempt = (password: string, client: string) => login(db, { email: 'app2@sentfund.my.id', password, clientKey: client, secret: 'test-secret', now: at });
    process.env.HOSTED_DEMO = 'true';
    for (let i = 0; i < 5; i++) expect((await attempt('wrong', '203.0.113.7')).ok).toBe(false);
    expect(await attempt('12345678', '203.0.113.7')).toMatchObject({ ok: false, reason: 'rate_limited' });
    expect((await attempt('12345678', '198.51.100.20')).ok).toBe(true);
    delete process.env.HOSTED_DEMO; // locally the per-email lockout still applies to everyone
    expect(await attempt('12345678', '198.51.100.21')).toMatchObject({ ok: false, reason: 'rate_limited' });
  });
});

describe('payroll assistant in the public demo', () => {
  it('stops at 200 requests per day across all makers', async () => {
    const { interpretRequest } = await import('@/server/assistant/service');
    const { stubModel } = await import('@/server/assistant/stub-model');
    const { assistantRequests } = await import('@/server/db/schema');
    const turns = [{ role: 'user', text: 'Pay Oliver Twist 0.05' }];
    // 200 requests by other makers in the last 24 hours (the per-maker hourly limit is separate).
    db.insert(assistantRequests).values(Array.from({ length: 200 }, (_, i) => ({
      id: randomUUID(), userId: i % 2 ? 'usr_app1' : 'usr_app2', createdAt: new Date(NOW.getTime() - (i + 1) * 60_000), requestText: 'x', outcome: 'refused' as const,
    }))).run();
    process.env.HOSTED_DEMO = 'true';
    expect(await interpretRequest(db, stubModel(), maker, turns, NOW)).toMatchObject({ kind: 'rate_limited', message: expect.stringMatching(/limit of 200 requests per day/) });
    delete process.env.HOSTED_DEMO;
    expect((await interpretRequest(db, stubModel(), maker, turns, NOW)).kind).toBe('refused');
    expect((await interpretRequest(db, stubModel(), maker, turns, new Date(NOW.getTime() + 86_400_000))).kind).toBe('refused');
    void admin;
  });
});

describe('Payroll Advance in the public demo (Phase 23)', () => {
  it('employees can request only for the live recipients, at most 0.30, one at a time; the policy is read-only; the kill switch refuses requests', async () => {
    process.env.HOSTED_DEMO = 'true';
    const route = (await import('@/app/api/employee/advances/route')) as unknown as { POST: H };
    const policy = (await import('@/app/api/admin/payroll-advance/route')) as unknown as { POST: H };
    const ask = (who: string, amount: string) => route.POST(req(who, '/api/employee/advances', 'POST', JSON.stringify({ amount, consent: true })));
    // Even with a higher net pay and maximum, the public demo caps an advance at 0.30.
    sqlite.prepare("update recipients set monthly_net_pay = '1000000', max_amount = '1000000' where near_account_id = 'recipient2.sentfund-payroll.testnet'").run();
    const { eligibilityFor } = await import('@/server/advance/eligibility');
    const dan = sqlite.prepare("select id from recipients where near_account_id = 'recipient2.sentfund-payroll.testnet'").get() as { id: string };
    const { recipients } = await import('@/server/db/schema');
    const { eq } = await import('drizzle-orm');
    const e = eligibilityFor(db, db.select().from(recipients).where(eq(recipients.id, dan.id)).get()!, { now: new Date() });
    expect([e.max, e.maxBasis]).toEqual(['300000', 'the public demo cap of 0.30 tUSDC']);
    expect((await ask('daniel', '0.31')).status).toBe(422);
    expect((await ask('emma', '0.30')).status).toBe(201);
    expect((await ask('emma', '0.10')).status).toBe(422); // one at a time (eligibility re-check)
    const p = await policy.POST(req('admin2', '/api/admin/payroll-advance', 'POST', JSON.stringify({ enabled: false, maxPercent: 300, feeBps: 200, instalments: 6, minDays: 90 })));
    expect(p.status).toBe(403);
    expect(((await p.json()) as { error: { message: string } }).error.message).toMatch(/Payroll Advance policy is read-only in the public demo/);
    process.env.HOSTED_READONLY = 'true';
    expect((await ask('daniel', '0.10')).status).toBe(503);
    expect(sqlite.prepare('select count(*) as n from payroll_advances').get()).toEqual({ n: 1 });
    expect(sqlite.prepare("select value from app_settings where key = 'payroll_advance_policy'").get()).toBeUndefined();
  });
});

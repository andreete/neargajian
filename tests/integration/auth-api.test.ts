/**
 * Route handlers called directly with real Request objects against a temporary SQLite file:
 * login, rate limiting, origin/CSRF checks, logout, and direct unauthorized API access.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BASE = 'http://127.0.0.1:8092';
const dir = mkdtempSync(join(tmpdir(), 'gajian-api-'));
process.env.DATABASE_URL = `file:${join(dir, 'api.sqlite')}`;
process.env.DEMO_MODE = 'true';
process.env.APP_BASE_URL = BASE;

type Mod = Record<string, (req: Request, ctx?: unknown) => Response | Promise<Response>>;
let loginRoute: Mod, logoutRoute: Mod, meRoute: Mod, runsRoute: Mod, runRoute: Mod, auditRoute: Mod;
let db: import('@/server/db/client').Db;

beforeAll(async () => {
  const client = await import('@/server/db/client');
  db = client.getDb();
  await (await import('@/server/db/seed')).seedDemo(db);
  loginRoute = (await import('@/app/api/auth/login/route')) as unknown as Mod;
  logoutRoute = (await import('@/app/api/auth/logout/route')) as unknown as Mod;
  meRoute = (await import('@/app/api/me/route')) as unknown as Mod;
  runsRoute = (await import('@/app/api/runs/route')) as unknown as Mod;
  runRoute = (await import('@/app/api/runs/[runId]/route')) as unknown as Mod;
  auditRoute = (await import('@/app/api/admin/audit/route')) as unknown as Mod;
});

afterAll(async () => {
  (await import('@/server/db/client')).closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

function req(path: string, init: RequestInit & { cookie?: string; origin?: string | null; csrf?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.origin !== null) headers.set('origin', init.origin ?? BASE);
  if (init.csrf) headers.set('x-csrf-token', init.csrf);
  headers.set('x-forwarded-for', '203.0.113.7');
  return new Request(`${BASE}${path}`, { ...init, headers });
}

async function signIn(email: string, password = '12345678', clientIp = '203.0.113.7') {
  const res = await loginRoute.POST!(new Request(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': clientIp },
    body: JSON.stringify({ email, password }),
  }));
  const setCookie = res.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  return { res, cookie, setCookie, body: (await res.json()) as { redirectTo?: string; error?: { code: string; message: string } } };
}

async function csrfFor(cookie: string): Promise<string> {
  const { SESSION_COOKIE, readSession, parseCookies } = await import('@/server/auth/session');
  return readSession(db, parseCookies(cookie)[SESSION_COOKIE], new Date())?.csrfToken ?? '';
}

describe('login', () => {
  it.each([
    ['maker@gajian.my.id', '/maker'],
    ['app1@gajian.my.id', '/approver'],
    ['app2@gajian.my.id', '/approver'],
    ['admin@gajian.my.id', '/admin'],
  ])('%s lands on %s with a hardened session cookie', async (email, home) => {
    const { res, setCookie, cookie, body } = await signIn(email);
    expect(res.status).toBe(200);
    expect(body.redirectTo).toBe(home);
    expect(setCookie).toMatch(/^gajian_session=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const me = await meRoute.GET!(req('/api/me', { cookie }));
    expect(me.status).toBe(200);
    expect(((await me.json()) as { home: string }).home).toBe(home);
  });

  it('accepts mixed-case email and gives one generic error for wrong password and unknown user', async () => {
    expect((await signIn('Maker@Gajian.my.id', '12345678', '198.51.100.1')).res.status).toBe(200);
    const wrong = await signIn('maker@gajian.my.id', 'wrong-password', '198.51.100.2');
    const unknown = await signIn('nobody@gajian.my.id', '12345678', '198.51.100.3');
    expect([wrong.res.status, unknown.res.status]).toEqual([401, 401]);
    expect(wrong.body.error?.message).toBe('Email or password is incorrect.');
    expect(unknown.body.error?.message).toBe(wrong.body.error?.message);
  });

  it('locks an email after 5 failures in 15 minutes, even with the right password', async () => {
    for (let i = 0; i < 5; i++) expect((await signIn('app2@gajian.my.id', `bad-${i}`, `192.0.2.${i}`)).res.status).toBe(401);
    const blocked = await signIn('app2@gajian.my.id', '12345678', '192.0.2.99');
    expect(blocked.res.status).toBe(429);
    expect(blocked.res.headers.get('retry-after')).toBe('900');
  });

  it('refuses cross-site and non-JSON login requests', async () => {
    const cross = await loginRoute.POST!(new Request(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ email: 'maker@gajian.my.id', password: '12345678' }),
    }));
    expect(cross.status).toBe(403);
    const form = await loginRoute.POST!(req('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a' }));
    expect(form.status).toBe(415);
  });
});

describe('direct API access is authorized on the server', () => {
  it('rejects requests without a session or with a forged token', async () => {
    for (const route of [meRoute, runsRoute, auditRoute]) expect((await route.GET!(req('/api'))).status).toBe(401);
    expect((await meRoute.GET!(req('/api/me', { cookie: 'gajian_session=forged-token-value' }))).status).toBe(401);
  });

  it('scopes the run list by role and refuses admins', async () => {
    const maker = await signIn('maker@gajian.my.id', '12345678', '10.0.0.1');
    const admin = await signIn('admin@gajian.my.id', '12345678', '10.0.0.2');
    const app1 = await signIn('app1@gajian.my.id', '12345678', '10.0.0.3');
    const makerRuns = (await (await runsRoute.GET!(req('/api/runs', { cookie: maker.cookie }))).json()) as { runs: { id: string; total: string }[] };
    expect(makerRuns.runs).toEqual([expect.objectContaining({ id: 'run_demo_november', total: '0.150000' })]);
    expect((await runsRoute.GET!(req('/api/runs', { cookie: admin.cookie }))).status).toBe(403);
    const queue = (await (await runsRoute.GET!(req('/api/runs', { cookie: app1.cookie }))).json()) as { pending: unknown[] };
    expect(queue.pending).toEqual([]);
  });

  it('only the maker and assigned approvers can read recipient details', async () => {
    const ctx = { params: Promise.resolve({ runId: 'run_demo_november' }) };
    const maker = await signIn('maker@gajian.my.id', '12345678', '10.0.1.1');
    const app1 = await signIn('app1@gajian.my.id', '12345678', '10.0.1.2');
    const admin = await signIn('admin@gajian.my.id', '12345678', '10.0.1.3');
    const own = await runRoute.GET!(req('/api/runs/run_demo_november', { cookie: maker.cookie }), ctx);
    expect(own.status).toBe(200);
    expect(((await own.json()) as { draftRows: unknown[] }).draftRows).toHaveLength(3);
    // Draft not submitted yet: approvers are not assigned, admin never sees recipients.
    expect((await runRoute.GET!(req('/api/runs/run_demo_november', { cookie: app1.cookie }), ctx)).status).toBe(404);
    expect((await runRoute.GET!(req('/api/runs/run_demo_november', { cookie: admin.cookie }), ctx)).status).toBe(404);
    expect((await runRoute.GET!(req('/api/runs/run_demo_november'), ctx)).status).toBe(401);
    expect((await runRoute.GET!(req('/api/runs/does-not-exist', { cookie: maker.cookie }), { params: Promise.resolve({ runId: 'does-not-exist' }) })).status).toBe(404);

    // After submission the snapshotted approvers are assigned and may read it (no draft rows).
    const { createVersion } = await import('@/server/runs/repository');
    createVersion(db, {
      runId: 'run_demo_november', makerUserId: 'usr_maker', postingMode: 'detailed', now: new Date(),
      rows: [{ accountId: 'recipient1.gajian-payroll.testnet', receiverName: 'Dewi', currency: 'tUSDC', amount: 30_000n, mobilePhone: '+628000001001', email: 'dewi@example.com' }],
      workflow: { revision: 3, kind: 'two_sequential', releaseMode: 'automatic', maxRowAmount: '1000000', maxRunTotal: '100000000',
        approvers: [{ userId: 'usr_app1', chainAccountId: 'approver1.gajian-payroll.testnet' }, { userId: 'usr_app2', chainAccountId: 'approver2.gajian-payroll.testnet' }] },
    });
    const assigned = await runRoute.GET!(req('/api/runs/run_demo_november', { cookie: app1.cookie }), ctx);
    expect(assigned.status).toBe(200);
    expect(((await assigned.json()) as { draftRows: unknown[] }).draftRows).toEqual([]);
    expect((await runRoute.GET!(req('/api/runs/run_demo_november', { cookie: admin.cookie }), ctx)).status).toBe(404);
  });

  it('admin-only endpoints refuse other roles', async () => {
    const maker = await signIn('maker@gajian.my.id', '12345678', '10.0.2.1');
    const admin = await signIn('admin@gajian.my.id', '12345678', '10.0.2.2');
    expect((await auditRoute.GET!(req('/api/admin/audit', { cookie: maker.cookie }))).status).toBe(403);
    const ok = await auditRoute.GET!(req('/api/admin/audit', { cookie: admin.cookie }));
    expect(ok.status).toBe(200);
    const text = JSON.stringify(await ok.json());
    expect(text).not.toContain('maker@gajian.my.id'); // audit events carry no PII
    expect(text).not.toContain('12345678');
  });
});

describe('logout', () => {
  it('requires same origin and the CSRF token, then destroys the session', async () => {
    const { cookie } = await signIn('admin@gajian.my.id', '12345678', '10.0.3.1');
    const csrf = await csrfFor(cookie);
    expect((await logoutRoute.POST!(req('/api/auth/logout', { method: 'POST', cookie }))).status).toBe(403);
    expect((await logoutRoute.POST!(req('/api/auth/logout', { method: 'POST', cookie, csrf: 'wrong' }))).status).toBe(403);
    expect((await logoutRoute.POST!(req('/api/auth/logout', { method: 'POST', cookie, csrf, origin: 'https://evil.example' }))).status).toBe(403);
    const out = await logoutRoute.POST!(req('/api/auth/logout', { method: 'POST', cookie, csrf }));
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await meRoute.GET!(req('/api/me', { cookie }))).status).toBe(401);
  });
});

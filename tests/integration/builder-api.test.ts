/** Phase 08: manual builder API (create, save draft, explicit valid-subset confirmation, role scoping). */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BASE = 'http://127.0.0.1:8092';
const dir = mkdtempSync(join(tmpdir(), 'sentfund-builder-'));
process.env.DATABASE_URL = `file:${join(dir, 'b.sqlite')}`;
process.env.DEMO_MODE = 'true';
process.env.APP_BASE_URL = BASE;

type H = (r: Request, c?: unknown) => Promise<Response>;
let runs: { POST: H; GET: H }, draft: { GET: H; PUT: H }, subset: { POST: H };
let db: import('@/server/db/client').Db;
const ip = { n: 0 };

beforeAll(async () => {
  db = (await import('@/server/db/client')).getDb();
  await (await import('@/server/db/seed')).seedDemo(db);
  // A second maker, to prove one maker cannot touch another maker's draft.
  const { users } = await import('@/server/db/schema');
  const { hashPassword } = await import('@/server/auth/password');
  db.insert(users).values({ id: 'usr_maker2', email: 'maker2@sentfund.my.id', displayName: 'Mia Maker', role: 'maker', passwordHash: await hashPassword('12345678'), chainAccountId: null, createdAt: new Date() }).run();
  runs = (await import('@/app/api/runs/route')) as unknown as typeof runs;
  draft = (await import('@/app/api/runs/[runId]/draft/route')) as unknown as typeof draft;
  subset = (await import('@/app/api/runs/[runId]/draft/confirm-subset/route')) as unknown as typeof subset;
});
afterAll(async () => {
  (await import('@/server/db/client')).closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

async function as(email: string) {
  const login = (await import('@/app/api/auth/login/route')) as unknown as { POST: H };
  ip.n += 1;
  const res = await login.POST(new Request(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': `10.8.0.${ip.n}` }, body: JSON.stringify({ email, password: '12345678' }) }));
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const { readSession, parseCookies, SESSION_COOKIE } = await import('@/server/auth/session');
  const csrf = readSession(db, parseCookies(cookie)[SESSION_COOKIE], new Date())?.csrfToken ?? '';
  const req = (path: string, method = 'GET', body?: unknown) => new Request(`${BASE}${path}`, {
    method, headers: { cookie, origin: BASE, 'x-csrf-token': csrf, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { req };
}
const ctx = (runId: string) => ({ params: Promise.resolve({ runId }) });
const row = (over: Record<string, string> = {}) => ({ near_account_id: 'recipient1.gajian-payroll.testnet', receiver_name: 'Emma Clark', currency: 'tUSDC', amount: '0.05', mobile_phone: '+44 7700 900101', email: 'emma@example.com', ...over });

describe('manual builder API', () => {
  it('maker creates a run, saves rows (invalid ones kept), and confirms the valid subset explicitly', async () => {
    const maker = await as('maker@sentfund.my.id');
    const created = await runs.POST(maker.req('/api/runs', 'POST', { title: 'December payroll', postingMode: 'detailed', source: 'manual' }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const saved = await draft.PUT(maker.req(`/api/runs/${id}/draft`, 'PUT', {
      expectedRevision: 0, postingMode: 'consolidated',
      rows: [row(), row({ amount: '0,07', near_account_id: 'recipient2.gajian-payroll.testnet' }), row({ amount: '0.03' })],
    }), ctx(id));
    expect(saved.status).toBe(200);
    const s1 = (await saved.json()) as { revision: number; summary: { validCount: number; invalidCount: number; validTotal: string; duplicateWallets: unknown[]; rows: { errors: { field: string; message: string }[] }[] } };
    expect(s1).toMatchObject({ revision: 1, summary: { validCount: 2, invalidCount: 1, validTotal: '0.080000' } });
    expect(s1.summary.rows[1]?.errors).toEqual([{ field: 'amount', message: 'Use a dot as the decimal separator, e.g. 1500.50' }]);
    expect(s1.summary.duplicateWallets).toEqual([{ accountId: 'recipient1.gajian-payroll.testnet', indexes: [0, 2] }]);

    // Stale revision and a mismatched removal set are refused; nothing is dropped silently.
    expect((await draft.PUT(maker.req(`/api/runs/${id}/draft`, 'PUT', { expectedRevision: 0, rows: [row()] }), ctx(id))).status).toBe(409);
    expect((await subset.POST(maker.req(`/api/runs/${id}/draft/confirm-subset`, 'POST', { expectedRevision: 1, removeIndexes: [0] }), ctx(id))).status).toBe(409);
    expect((await subset.POST(maker.req(`/api/runs/${id}/draft/confirm-subset`, 'POST', { expectedRevision: 1, removeIndexes: [] }), ctx(id))).status).toBe(409);
    const view1 = (await (await draft.GET(maker.req(`/api/runs/${id}/draft`), ctx(id))).json()) as { rows: unknown[] };
    expect(view1.rows).toHaveLength(3);

    const confirmed = await subset.POST(maker.req(`/api/runs/${id}/draft/confirm-subset`, 'POST', { expectedRevision: 1, removeIndexes: [1] }), ctx(id));
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ revision: 2, removed: 1, summary: { validCount: 2, invalidCount: 0, validTotal: '0.080000' } });
    const view2 = (await (await draft.GET(maker.req(`/api/runs/${id}/draft`), ctx(id))).json()) as { run: { postingMode: string }; rows: { amount: string }[] };
    expect(view2.rows.map((r) => r.amount)).toEqual(['0.05', '0.03']);
    expect(view2.run.postingMode).toBe('consolidated');
  });

  it('other makers, approvers and the admin cannot read or change a draft', async () => {
    const maker = await as('maker@sentfund.my.id');
    const { id } = (await (await runs.POST(maker.req('/api/runs', 'POST', { title: 'Private draft', postingMode: 'detailed', source: 'manual' }))).json()) as { id: string };
    const other = await as('maker2@sentfund.my.id');
    expect((await draft.GET(other.req(`/api/runs/${id}/draft`), ctx(id))).status).toBe(404);
    expect((await draft.PUT(other.req(`/api/runs/${id}/draft`, 'PUT', { expectedRevision: 0, rows: [row()] }), ctx(id))).status).toBe(404);
    for (const email of ['app1@sentfund.my.id', 'admin@sentfund.my.id']) {
      const u = await as(email);
      expect((await draft.GET(u.req(`/api/runs/${id}/draft`), ctx(id))).status).toBe(403);
      expect((await runs.POST(u.req('/api/runs', 'POST', { title: 'x', postingMode: 'detailed', source: 'manual' }))).status).toBe(403);
    }
  });

  it('validates input on create and refuses manual edits to an uploaded run', async () => {
    const maker = await as('maker@sentfund.my.id');
    expect((await runs.POST(maker.req('/api/runs', 'POST', { title: '', postingMode: 'detailed', source: 'manual' }))).status).toBe(422);
    expect((await runs.POST(maker.req('/api/runs', 'POST', { title: 'x', postingMode: 'weekly', source: 'manual' }))).status).toBe(422);
    const { id } = (await (await runs.POST(maker.req('/api/runs', 'POST', { title: 'Upload run', postingMode: 'detailed', source: 'upload' }))).json()) as { id: string };
    expect((await draft.PUT(maker.req(`/api/runs/${id}/draft`, 'PUT', { expectedRevision: 0, rows: [row()] }), ctx(id))).status).toBe(422);
  });
});

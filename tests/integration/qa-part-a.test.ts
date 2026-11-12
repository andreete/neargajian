/**
 * Phase 26 · QA Part A of the milestone kit (docs/roadmap/qa-checklist.md), the items that need the
 * app's own data and so run here, never on the shared public demo: upload edge cases (A2), approval
 * races (A3), role changes in open sessions (A6-01), the sign-in limit under a burst (A1-03, BUG-26-02)
 * and the maker-release route's refusals (BUG-26-03). Results: docs/roadmap/qa-part-a-results.md.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importPayrollFile, type ImportResult } from '@/server/payroll/import';
import { escapeCsvCell } from '@/server/payroll/error-report';
import { HEADERS, toDelimited, validRows, withInvalidRow } from '@/server/fixtures/payroll';
import { FakeVault } from '../helpers/fake-vault';

const BASE = 'http://127.0.0.1:8092';
const dir = mkdtempSync(join(tmpdir(), 'sentfund-qaa-'));
process.env.DATABASE_URL = `file:${join(dir, 'qaa.sqlite')}`;
process.env.DEMO_MODE = 'true';
process.env.APP_BASE_URL = BASE;

const LIMITS = { maxRowAmount: 1_000_000n, maxRunTotal: 100_000_000n };
const imp = (text: string | Uint8Array, filename = 'payroll.csv'): ImportResult =>
  importPayrollFile({ filename, bytes: typeof text === 'string' ? new TextEncoder().encode(text) : text, limits: LIMITS });
const errorsOf = (r: ImportResult) => (r.ok ? [] : r.errors);
const header = HEADERS.join(',');
const row = (account: string, amount: string, name = 'Ana Lima') => `${account},${name},tUSDC,${amount},+44 7700 900123,ana@example.com`;

describe('QA-A2 upload edge cases (importer)', () => {
  it('A2-03: a comma decimal in a tab-delimited TXT is refused with the dot hint, never read as 5 or 0', () => {
    const text = `${HEADERS.join('\t')}\nalice.testnet\tAna Lima\ttUSDC\t0,05\t+44 7700 900123\tana@example.com\n`;
    const r = imp(text, 'payroll.txt');
    expect(r.ok).toBe(false);
    expect(errorsOf(r)[0]?.message).toMatch(/dot as the decimal separator/);
  });

  it('A2-04: a file without a trailing newline is accepted; with a BOM and CRLF a bad row keeps its spreadsheet row number', () => {
    const ok = imp(toDelimited(validRows(3)).trimEnd());
    expect(ok.ok).toBe(true);
    const bad = imp(toDelimited(withInvalidRow(validRows(4), 1, 'bad_account'), { bom: true, crlf: true }));
    expect(bad.ok).toBe(false);
    expect(errorsOf(bad)[0]).toMatchObject({ line: 3, column: 'near_account_id' });
  });

  it('A2-05: amounts: 0.050000 and a trailing space are exact; 7 decimals, 1e-2, +0.05 and an unquoted 1,000.00 are refused (never rounded)', () => {
    const exact = imp(`${header}\n${row('alice.testnet', '0.050000')}\n${row('bob.testnet', '0.05 ')}\n`);
    expect(exact.ok && exact.total).toBe(100_000n);
    for (const amount of ['0.0500001', '1e-2', '+0.05', '"1,000.00"', '-0.05', '0', '0.000000']) {
      const r = imp(`${header}\n${row('alice.testnet', amount)}\n`);
      expect(r.ok, `amount ${amount}`).toBe(false);
    }
    const split = imp(`${header}\n${row('alice.testnet', '1,000.00')}\n`);
    expect(errorsOf(split)[0]?.message).toMatch(/7 cells; expected 6/);
  });

  it('A2-06: a negative amount is refused at file level', () => {
    expect(imp(toDelimited(withInvalidRow(validRows(3), 1, 'negative_amount'))).ok).toBe(false);
  });

  it('A2-07: bad account IDs are refused (incl. a mainnet .near name, BUG-26-04); a 64-hex implicit account is accepted', () => {
    for (const account of ['Alice.testnet', 'a..b.testnet', 'a.testnet.', '.a.testnet', 'has space.testnet', `${'a'.repeat(57)}.testnet`, 'alice.near', 'near']) {
      const r = imp(`${header}\n${row(account, '0.05')}\n`);
      expect(r.ok, account).toBe(false);
    }
    expect(errorsOf(imp(`${header}\n${row('alice.near', '0.05')}\n`))[0]?.message).toMatch(/mainnet account \(\.near\)/);
    const implicit = imp(`${header}\n${row('a'.repeat(64), '0.05')}\n${row('0'.repeat(64), '0.05')}\n`);
    expect(implicit.ok).toBe(true);
  });

  it('A2-09: two identical rows are accepted with a duplicate-wallet warning on both lines', () => {
    const r = imp(`${header}\n${row('alice.testnet', '0.05')}\n${row('alice.testnet', '0.05')}\n`);
    expect(r.ok).toBe(true);
    expect(r.ok && r.duplicateWallets).toEqual([{ accountId: 'alice.testnet', lines: [2, 3] }]);
  });

  it('A2-10: formula-like text is escaped in CSV exports', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x","click")')).toBe('"\'=HYPERLINK(""http://x"",""click"")"');
    expect(escapeCsvCell('+cmd')).toBe("'+cmd");
    expect(escapeCsvCell('@SUM(1)')).toBe("'@SUM(1)");
    expect(escapeCsvCell('-1+1')).toBe("'-1+1");
    expect(escapeCsvCell('Ana Lima')).toBe('Ana Lima');
  });

  it('A2-12 + A2-13: an .xlsx renamed to .csv and a Windows-1252 file get the clear "not UTF-8" message', () => {
    const xlsx = readFileSync('public/templates/sentfund-payroll-template.xlsx');
    expect(errorsOf(imp(new Uint8Array(xlsx), 'payroll.csv'))[0]?.message).toMatch(/not UTF-8/);
    const cp1252 = Buffer.concat([Buffer.from(`${header}\nalice.testnet,Andr`), Buffer.from([0xe9]), Buffer.from(',tUSDC,0.05,+44 7700 900123,a@example.com\n')]);
    expect(errorsOf(imp(new Uint8Array(cp1252)))[0]?.message).toMatch(/not UTF-8/);
  });
});

// ------------------------------------------------------------------ app-level checks (one database)

let db: import('@/server/db/client').Db;
let sqlite: import('better-sqlite3').Database;
const fake = new FakeVault();
type Route = Record<string, (req: Request, ctx?: unknown) => Response | Promise<Response>>;

beforeAll(async () => {
  const client = await import('@/server/db/client');
  ({ db, sqlite } = client.getDatabase());
  await (await import('@/server/db/seed')).seedDemo(db);
  (await import('@/server/chain/vault-client')).setVaultClientForTests(fake);
}, 60_000);

afterAll(async () => {
  (await import('@/server/chain/vault-client')).setVaultClientForTests(undefined);
  (await import('@/server/db/client')).closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

describe('QA-A1-03 sign-in limits hold under a burst (BUG-26-02)', () => {
  it('10 wrong passwords for one email at the same moment: at most 5 are checked, the rest are rate-limited', async () => {
    const { login } = await import('@/server/auth/login');
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      login(db, { email: 'app1@sentfund.my.id', password: `wrong-${i}`, clientKey: `198.51.100.${i}`, secret: 'qa-secret', now })));
    expect(results.filter((r) => !r.ok && r.reason === 'invalid')).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.reason === 'rate_limited')).toHaveLength(5);
    const right = await login(db, { email: 'app1@sentfund.my.id', password: '12345678', clientKey: '198.51.100.99', secret: 'qa-secret', now });
    expect(right).toMatchObject({ ok: false, reason: 'rate_limited' });
  });

  it('25 different emails from one client at the same moment: at most 20 are checked', async () => {
    const { login } = await import('@/server/auth/login');
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) =>
      login(db, { email: `spray-${i}@example.com`, password: 'guess', clientKey: '203.0.113.50', secret: 'qa-secret', now })));
    expect(results.filter((r) => !r.ok && r.reason === 'invalid')).toHaveLength(20);
    expect(results.filter((r) => !r.ok && r.reason === 'rate_limited')).toHaveLength(5);
  });

  it('a successful sign-in is recorded as a success, not as a failure', async () => {
    const { login } = await import('@/server/auth/login');
    const r = await login(db, { email: 'maker@sentfund.my.id', password: '12345678', clientKey: '192.0.2.200', secret: 'qa-secret', now: new Date() });
    expect(r.ok).toBe(true);
    const rows = sqlite.prepare('select succeeded from login_attempts order by id desc limit 1').all() as { succeeded: number }[];
    expect(rows[0]?.succeeded).toBe(1);
  });
});

describe('QA-A6-01 role changes apply to open sessions at once', () => {
  it('a session keeps working only while the user still has the role, and is refused while the user is disabled', async () => {
    const { createSession, SESSION_COOKIE } = await import('@/server/auth/session');
    const { users } = await import('@/server/db/schema');
    const audit = (await import('@/app/api/admin/audit/route')) as unknown as Route;
    const s = createSession(db, 'usr_admin', new Date());
    const get = () => audit.GET!(new Request(`${BASE}/api/admin/audit`, { headers: { cookie: `${SESSION_COOKIE}=${s.token}` } }));
    expect((await get()).status).toBe(200);
    db.update(users).set({ role: 'maker' }).where(eq(users.id, 'usr_admin')).run();
    expect((await get()).status).toBe(403);
    db.update(users).set({ role: 'admin', disabledAt: new Date() }).where(eq(users.id, 'usr_admin')).run();
    expect((await get()).status).toBe(401);
    db.update(users).set({ disabledAt: null }).where(eq(users.id, 'usr_admin')).run();
    expect((await get()).status).toBe(200); // re-enabled: the unexpired session works again with the current role
  });
});

describe('QA-A3 approval races', () => {
  const maker = { id: 'usr_maker', role: 'maker' as const };
  const app1 = { id: 'usr_app1', role: 'approver' as const };
  const app2 = { id: 'usr_app2', role: 'approver' as const };

  async function submittedRun(title: string) {
    const { createRun } = await import('@/server/runs/repository');
    const { uploadToDraft } = await import('@/server/runs/draft-service');
    const lc = await import('@/server/runs/lifecycle');
    const run = createRun(db, { makerUserId: maker.id, title, postingMode: 'detailed', source: 'upload', now: new Date() });
    uploadToDraft(db, maker, run, { filename: 'live.csv', bytes: readFileSync('tests/live/live-3-rows.csv'), expectedRevision: 0, now: new Date() });
    await lc.submitRun(db, fake, maker, run, { expectedRevision: 1 });
    await lc.reconcileVersion(db, fake, lc.latestVersion(db, run)!.id);
    return { run, v: lc.latestVersion(db, run)!, lc };
  }

  async function setWorkflow(kind: 'two_parallel' | 'two_sequential', releaseMode: 'automatic' | 'maker') {
    const { workflowConfigs } = await import('@/server/db/schema');
    db.update(workflowConfigs).set({ kind, releaseMode }).where(eq(workflowConfigs.chainStatus, 'active')).run();
    fake.wf.kind = kind === 'two_parallel' ? 'TwoParallel' : 'TwoSequential';
    fake.wf.release_mode = releaseMode === 'maker' ? 'Maker' : 'Automatic';
  }

  it('A3-07: both approvers approve a parallel run at the same moment: two approvals, one consistent Approved state', async () => {
    await setWorkflow('two_parallel', 'automatic');
    const { run, v, lc } = await submittedRun('QA parallel race');
    const before = fake.calls.filter((c) => c.method === 'approve').length;
    const settled = await Promise.allSettled([
      lc.decide(db, fake, app1, run, { versionId: v.id, decision: 'approve' }),
      lc.decide(db, fake, app2, run, { versionId: v.id, decision: 'approve' }),
    ]);
    expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'fulfilled']);
    expect((await lc.reconcileVersion(db, fake, v.id)).status).toBe('approved');
    expect(fake.calls.filter((c) => c.method === 'approve').length - before).toBe(2);
  });

  it('A3-06: the same approver approving twice at the same moment counts once; the second gets "already decided"', async () => {
    await setWorkflow('two_parallel', 'automatic');
    const { run, v, lc } = await submittedRun('QA double approve');
    const before = fake.calls.filter((c) => c.method === 'approve').length;
    const settled = await Promise.allSettled([
      lc.decide(db, fake, app1, run, { versionId: v.id, decision: 'approve' }),
      lc.decide(db, fake, app1, run, { versionId: v.id, decision: 'approve' }),
    ]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    expect(String((settled.find((s) => s.status === 'rejected') as PromiseRejectedResult).reason)).toMatch(/already decided/);
    expect(fake.calls.filter((c) => c.method === 'approve').length - before).toBe(1);
    expect((await lc.reconcileVersion(db, fake, v.id)).status).toBe('pending_approval');
  });

  it('BUG-26-03: the maker\'s release is refused with 409 and a message (not a bare 500) when this copy has no maker signer', async () => {
    await setWorkflow('two_parallel', 'maker');
    const { run, v, lc } = await submittedRun('QA maker release without signer');
    for (const who of [app1, app2]) {
      await lc.decide(db, fake, who, run, { versionId: v.id, decision: 'approve' });
      await lc.reconcileVersion(db, fake, v.id);
    }
    expect(lc.latestVersion(db, run)!.status).toBe('approved');
    const { createSession, SESSION_COOKIE } = await import('@/server/auth/session');
    const s = createSession(db, 'usr_maker', new Date());
    const release = (await import('@/app/api/runs/[runId]/release/route')) as unknown as Route;
    fake.noKeys.add('maker');
    const res = await release.POST!(new Request(`${BASE}/api/runs/${run}/release`, {
      method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${s.token}`, 'x-csrf-token': s.csrfToken, origin: BASE },
    }), { params: Promise.resolve({ runId: run }) });
    fake.noKeys.delete('maker');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/no signer keys/);
    expect(fake.calls.filter((c) => c.method === 'start_release' && c.role === 'maker')).toHaveLength(0);
  });
});

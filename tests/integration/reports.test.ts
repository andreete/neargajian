/** Phase 13: history views, company vs recipient exports, reconciliation and role scoping. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/server/db/client';
import { createRun } from '@/server/runs/repository';
import { uploadToDraft } from '@/server/runs/draft-service';
import { decide, latestVersion, reconcileVersion, submitRun } from '@/server/runs/lifecycle';
import { payRows, requestRelease } from '@/server/payouts/release';
import { companyCsv, historyFor, recipientCsv } from '@/server/reports/history';
import { FakeVault } from '../helpers/fake-vault';

const BASE = 'http://127.0.0.1:8092';
const dir = mkdtempSync(join(tmpdir(), 'sentfund-rep-'));
process.env.DATABASE_URL = `file:${join(dir, 'rep.sqlite')}`;
process.env.DEMO_MODE = 'true';
process.env.APP_BASE_URL = BASE;
const maker = { id: 'usr_maker', role: 'maker' as const };
const admin = { id: 'usr_admin', role: 'admin' as const };
const app1 = { id: 'usr_app1', role: 'approver' as const };
let db: Db;
const fake = new FakeVault();
fake.balance = 100_000_000n;

async function paidRun(title: string, posting: 'consolidated' | 'detailed', file: string, finish = true) {
  const id = createRun(db, { makerUserId: 'usr_maker', title, postingMode: posting, source: 'upload', now: new Date() });
  uploadToDraft(db, maker, id, { filename: file, bytes: readFileSync(new URL(`../../public/templates/${file}`, import.meta.url)), expectedRevision: 0, now: new Date() });
  await submitRun(db, fake, maker, id, { expectedRevision: 1 });
  const v = () => latestVersion(db, id)!;
  await reconcileVersion(db, fake, v().id);
  await decide(db, fake, app1, id, { versionId: v().id, decision: 'approve' });
  await reconcileVersion(db, fake, v().id);
  await decide(db, fake, { id: 'usr_app2', role: 'approver' }, id, { versionId: v().id, decision: 'approve' });
  await reconcileVersion(db, fake, v().id);
  await requestRelease(db, fake, v(), { role: 'worker', workerId: 't' });
  if (finish) await payRows(db, fake, v(), { role: 'worker', workerId: 't', max: 1000 });
  else await payRows(db, fake, v(), { role: 'worker', workerId: 't', max: 10 });
  return id;
}

beforeAll(async () => {
  db = (await import('@/server/db/client')).getDb();
  await (await import('@/server/db/seed')).seedDemo(db);
  (await import('@/server/chain/vault-client')).setVaultClientForTests(fake);
  await paidRun('=HYPERLINK("http://evil","Uniform consolidated")', 'consolidated', 'sentfund-payroll-uniform-1000.csv');
  await paidRun('Uniform detailed', 'detailed', 'sentfund-payroll-uniform-1000.csv');
  await paidRun('Still paying', 'detailed', 'sentfund-payroll-uniform-1000.csv', false);
}, 120_000);
afterAll(async () => {
  (await import('@/server/chain/vault-client')).setVaultClientForTests(undefined);
  (await import('@/server/db/client')).closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

const lines = (csv: string) => csv.replace(/^﻿/, '').trim().split('\r\n');

describe('history and exports', () => {
  it('one versus 1,000 company entries for identical data, with identical totals', () => {
    const csv = lines(companyCsv(db, maker));
    expect(csv[0]).toBe('reference,posting_mode,run_title,run_version,vault_run_id,line,paid_at_utc,amount,currency,status');
    const consolidated = csv.filter((l) => l.includes(',consolidated,'));
    const detailed = csv.filter((l) => l.includes(',detailed,'));
    expect(consolidated).toHaveLength(1);
    expect(detailed).toHaveLength(1000);
    const sum = (rows: string[]) => rows.reduce((s, l) => s + BigInt((/,(\d+\.\d{6}),tUSDC,paid$/.exec(l)?.[1] ?? '0').replace('.', '')), 0n);
    expect(sum(consolidated)).toBe(10_000_000n);
    expect(sum(detailed)).toBe(10_000_000n);
    expect(consolidated[0]).toMatch(/,10\.000000,tUSDC,paid$/);
    expect(new Set(detailed.map((l) => l.split(',')[0])).size).toBe(1000); // unique opaque references
    expect(detailed[0]).toMatch(/^SFD-[A-Z2-9]{8}-0001,detailed,Uniform detailed,1,sfd-/);
    for (const l of [...consolidated, ...detailed]) expect(l.split(',').at(-4)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/); // UTC, whole seconds
  });

  it('both history views reconcile; partially paid runs stay out of reports', () => {
    const h = historyFor(db, maker);
    expect(h.totals).toEqual({ runs: 2, lines: 2000, consolidatedTotal: 20_000_000n, detailedTotal: 20_000_000n, reconciles: true });
    expect(h.inProgress.map((r) => [r.title, r.paidCount])).toEqual([['Still paying', 10]]);
    expect(companyCsv(db, maker)).not.toContain('Still paying');
  });

  it('escapes spreadsheet formulas in user-controlled text', () => {
    expect(companyCsv(db, maker)).toContain(`"'=HYPERLINK(""http://evil"",""Uniform consolidated"")"`);
  });

  it('company exports never contain identity, contact or wallet fields; the admin cannot export recipients', async () => {
    const adminCsv = companyCsv(db, admin);
    expect(lines(adminCsv)).toHaveLength(1 + 1 + 1000);
    for (const secret of ['gjn-emp-0001', '@example.com', '+44 7700', 'Matthew Miller']) expect(adminCsv).not.toContain(secret);
    expect(historyFor(db, admin).paid[0]?.lines[0]?.recipient).toBeNull();
    expect(recipientCsv(db, admin, 'x')).not.toContain('gjn-emp-0001');
    const route = (await import('@/app/api/reports/recipients/route')) as unknown as { GET: (r: Request) => Response };
    const login = (await import('@/app/api/auth/login/route')) as unknown as { POST: (r: Request) => Promise<Response> };
    const res = await login.POST(new Request(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': '10.6.0.1' }, body: JSON.stringify({ email: 'admin@sentfund.my.id', password: '12345678' }) }));
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect(route.GET(new Request(`${BASE}/api/reports/recipients`, { headers: { cookie } })).status).toBe(403);
    expect(route.GET(new Request(`${BASE}/api/reports/recipients`)).status).toBe(401);
  });

  it('the recipient-detail export is separate and scoped to the maker and assigned approvers', () => {
    const csv = lines(recipientCsv(db, app1, 'https://testnet.nearblocks.io/txns/'));
    expect(csv[0]).toBe('reference,run_title,run_version,file_row,near_account_id,receiver_name,email,paid_at_utc,amount,currency,tx_hash,explorer_url');
    expect(csv).toHaveLength(1 + 2000);
    expect(csv[1]).toMatch(/,2,gjn-emp-0001\.testnet,Matthew Miller,matthew\.miller\.0001@example\.com,.*,0\.010000,tUSDC,TX\d+,https:\/\/testnet\.nearblocks\.io\/txns\/TX\d+$/);
    expect(lines(recipientCsv(db, { id: 'usr_nobody', role: 'approver' }, 'x'))).toHaveLength(1);
  });
});

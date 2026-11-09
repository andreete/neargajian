/**
 * Phase 07: admin workflow changes integrated with the vault. A stand-in vault (test-only,
 * installed through setVaultClientForTests) mimics the contract's update_workflow rules.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChainRole, ChainWorkflow, TxOutcome, VaultClient } from '@/server/chain/vault-client';

const BASE = 'http://127.0.0.1:8092';
const dir = mkdtempSync(join(tmpdir(), 'gajian-wf-'));
process.env.DATABASE_URL = `file:${join(dir, 'wf.sqlite')}`;
process.env.DEMO_MODE = 'true';
process.env.APP_BASE_URL = BASE;

class FakeVault implements VaultClient {
  vaultId = 'vault.test';
  mode: 'ok' | 'fail' | 'unknown-landed' | 'unknown-lost' = 'ok';
  calls = 0;
  wf: ChainWorkflow = { revision: 5, kind: 'TwoSequential', approvers: ['approver1.gajian-payroll.testnet', 'approver2.gajian-payroll.testnet'], release_mode: 'Automatic', maker: 'maker.gajian-payroll.testnet', worker: 'worker.gajian-payroll.testnet', max_row_amount: '1000000', max_run_total: '100000000' };
  lastHash = '';
  accountFor(role: ChainRole) { return `${role}.gajian-payroll.testnet`; }
  async view<T>(): Promise<T> { return structuredClone(this.wf) as T; }
  async call(role: ChainRole, method: string, args: Record<string, unknown>, opts: { onSigned?: (h: string) => void } = {}): Promise<TxOutcome> {
    this.calls += 1;
    const txHash = `TX${this.calls}`;
    this.lastHash = txHash;
    opts.onSigned?.(txHash);
    if (role !== 'admin' || method !== 'update_workflow') return { txHash, status: 'failure', error: 'Only the admin can do this' };
    if (this.mode === 'fail') return { txHash, status: 'failure', error: 'Admin, maker, approvers and worker must be distinct accounts' };
    if (this.mode === 'unknown-lost') return { txHash, status: 'unknown' };
    this.wf = { ...this.wf, revision: this.wf.revision + 1, kind: args.kind as ChainWorkflow['kind'], approvers: args.approvers as string[], release_mode: args.release_mode as ChainWorkflow['release_mode'] };
    return this.mode === 'unknown-landed' ? { txHash, status: 'unknown' } : { txHash, status: 'success', value: this.wf };
  }
  async txBlockTime(): Promise<Date | null> { return null; }
  canSign() { return true; }
  async txOutcome(txHash: string): Promise<TxOutcome> {
    return this.mode === 'unknown-lost' ? { txHash, status: 'failure', error: 'transaction expired' } : { txHash, status: 'success' };
  }
}

let fake: FakeVault;
let db: import('@/server/db/client').Db;
let svc: typeof import('@/server/workflow/service');
let schema: typeof import('@/server/db/schema');
let route: { GET: (r: Request) => Response; POST: (r: Request) => Promise<Response> };

beforeAll(async () => {
  db = (await import('@/server/db/client')).getDb();
  await (await import('@/server/db/seed')).seedDemo(db);
  svc = await import('@/server/workflow/service');
  schema = await import('@/server/db/schema');
  route = (await import('@/app/api/admin/workflow/route')) as unknown as typeof route;
});
afterAll(async () => {
  (await import('@/server/chain/vault-client')).setVaultClientForTests(undefined);
  (await import('@/server/db/client')).closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  fake = new FakeVault();
  (await import('@/server/chain/vault-client')).setVaultClientForTests(fake);
  // Reset to one active seeded revision; this file's stand-in vault sits at revision 5.
  const { workflowConfigs } = schema;
  const seeded = `wf_rev_${(await import('@/server/db/seed')).SEED_WORKFLOW.revision}`;
  for (const row of db.select().from(workflowConfigs).all()) {
    if (row.id !== seeded) db.delete(workflowConfigs).where(eq(workflowConfigs.id, row.id)).run();
  }
  db.update(workflowConfigs).set({ chainStatus: 'active', revision: 5 }).where(eq(workflowConfigs.id, seeded)).run();
});

const parallelMaker = { kind: 'two_parallel' as const, approverUserIds: ['usr_app1', 'usr_app2'], releaseMode: 'maker' as const, expectedRevision: 5 };

describe('workflow changes', () => {
  it('activates only after the vault confirms, and supersedes the previous revision', async () => {
    const r = await svc.updateWorkflow(db, fake, 'usr_admin', parallelMaker);
    expect(r).toEqual({ status: 'active', revision: 6, txHash: 'TX1' });
    const rows = db.select().from(schema.workflowConfigs).all();
    expect(rows.find((x) => x.revision === 5)?.chainStatus).toBe('superseded');
    expect(rows.find((x) => x.revision === 6)).toMatchObject({ chainStatus: 'active', kind: 'two_parallel', releaseMode: 'maker', chainTxHash: 'TX1' });
    expect(fake.wf).toMatchObject({ revision: 6, kind: 'TwoParallel', release_mode: 'Maker' });
  });

  it('rejects same reviewer twice, wrong roles, missing reviewers and no-op changes before any transaction', async () => {
    const same = await svc.updateWorkflow(db, fake, 'usr_admin', { ...parallelMaker, approverUserIds: ['usr_app1', 'usr_app1'] });
    expect(same).toMatchObject({ status: 'invalid', errors: [{ field: 'approver2', message: 'Choose two different reviewers.' }] });
    const maker = await svc.updateWorkflow(db, fake, 'usr_admin', { kind: 'one', approverUserIds: ['usr_maker'], releaseMode: 'automatic', expectedRevision: 5 });
    expect(maker).toMatchObject({ status: 'invalid', errors: [{ field: 'approver1' }] });
    const missing = await svc.updateWorkflow(db, fake, 'usr_admin', { kind: 'two_sequential', approverUserIds: ['usr_app1'], releaseMode: 'automatic', expectedRevision: 5 });
    expect(missing).toMatchObject({ status: 'invalid', errors: [{ field: 'approver2' }] });
    const noop = await svc.updateWorkflow(db, fake, 'usr_admin', { kind: 'two_sequential', approverUserIds: ['usr_app1', 'usr_app2'], releaseMode: 'automatic', expectedRevision: 5 });
    expect(noop).toMatchObject({ status: 'invalid', errors: [{ field: 'form' }] });
    expect(fake.calls).toBe(0);
  });

  it('keeps the previous workflow when the vault rejects the change, and allows a retry', async () => {
    fake.mode = 'fail';
    const r = await svc.updateWorkflow(db, fake, 'usr_admin', parallelMaker);
    expect(r).toMatchObject({ status: 'failed', revision: 6 });
    expect(db.select().from(schema.workflowConfigs).where(eq(schema.workflowConfigs.chainStatus, 'active')).get()?.revision).toBe(5);
    fake.mode = 'ok';
    expect(await svc.updateWorkflow(db, fake, 'usr_admin', parallelMaker)).toMatchObject({ status: 'active', revision: 6 });
  });

  it('keeps an unknown outcome pending, blocks further changes, and reconciles from the chain', async () => {
    fake.mode = 'unknown-landed';
    expect(await svc.updateWorkflow(db, fake, 'usr_admin', parallelMaker)).toMatchObject({ status: 'pending', revision: 6, txHash: 'TX1' });
    expect(await svc.updateWorkflow(db, fake, 'usr_admin', { ...parallelMaker, releaseMode: 'automatic' })).toMatchObject({ status: 'conflict' });
    expect(await svc.reconcilePendingWorkflow(db, fake, 'usr_admin')).toMatchObject({ status: 'active', revision: 6 });
  });

  it('marks a lost transaction failed after reconciliation proves it', async () => {
    fake.mode = 'unknown-lost';
    expect(await svc.updateWorkflow(db, fake, 'usr_admin', parallelMaker)).toMatchObject({ status: 'pending' });
    expect(await svc.reconcilePendingWorkflow(db, fake, 'usr_admin')).toMatchObject({ status: 'failed' });
    expect(db.select().from(schema.workflowConfigs).where(eq(schema.workflowConfigs.chainStatus, 'active')).get()?.revision).toBe(5);
  });

  it('refuses stale pages and an app that is out of sync with the vault', async () => {
    expect(await svc.updateWorkflow(db, fake, 'usr_admin', { ...parallelMaker, expectedRevision: 4 })).toMatchObject({ status: 'conflict' });
    fake.wf.revision = 9;
    expect(await svc.updateWorkflow(db, fake, 'usr_admin', parallelMaker)).toMatchObject({ status: 'conflict' });
  });

  it('submitted versions keep their snapshot after the admin changes the workflow', async () => {
    const { createVersion } = await import('@/server/runs/repository');
    const before = svc.activeSnapshot(db)!;
    const v = createVersion(db, {
      runId: 'run_demo_november', makerUserId: 'usr_maker', postingMode: 'detailed', now: new Date(), workflow: before,
      rows: [{ accountId: 'recipient1.gajian-payroll.testnet', receiverName: 'Emma', currency: 'tUSDC', amount: 30_000n, mobilePhone: '+447700900101', email: 'emma@example.com' }],
    });
    await svc.updateWorkflow(db, fake, 'usr_admin', parallelMaker);
    const stored = db.select().from(schema.runVersions).where(eq(schema.runVersions.id, v.id)).get()!;
    expect(JSON.parse(stored.workflowSnapshot)).toMatchObject({ revision: 5, kind: 'two_sequential', releaseMode: 'automatic' });
    expect(svc.activeSnapshot(db)).toMatchObject({ revision: 6, kind: 'two_parallel', releaseMode: 'maker' });
  });
});

describe('admin workflow API', () => {
  async function cookieFor(email: string) {
    const login = (await import('@/app/api/auth/login/route')) as unknown as { POST: (r: Request) => Promise<Response> };
    const res = await login.POST(new Request(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': `10.9.${email.length}.1` }, body: JSON.stringify({ email, password: '12345678' }) }));
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const { readSession, parseCookies, SESSION_COOKIE } = await import('@/server/auth/session');
    return { cookie, csrf: readSession(db, parseCookies(cookie)[SESSION_COOKIE], new Date())?.csrfToken ?? '' };
  }
  const post = (c: { cookie: string; csrf: string }, body: unknown) => new Request(`${BASE}/api/admin/workflow`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, cookie: c.cookie, 'x-csrf-token': c.csrf }, body: JSON.stringify(body),
  });

  it('only the admin can read or change the workflow', async () => {
    for (const email of ['maker@gajian.my.id', 'app1@gajian.my.id']) {
      const c = await cookieFor(email);
      expect((await route.POST(post(c, parallelMaker))).status).toBe(403);
      expect(route.GET(new Request(`${BASE}/api/admin/workflow`, { headers: { cookie: c.cookie } })).status).toBe(403);
    }
    expect(fake.calls).toBe(0);
    const admin = await cookieFor('admin@gajian.my.id');
    expect((await route.POST(post({ ...admin, csrf: 'wrong' }, parallelMaker))).status).toBe(403);
    expect((await route.POST(post(admin, { ...parallelMaker, approverUserIds: ['usr_app2', 'usr_app2'] }))).status).toBe(422);
    const ok = await route.POST(post(admin, parallelMaker));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { result: { revision: number } }).result.revision).toBe(6);
  });
});

describe('approval map renders the snapshot it is given', () => {
  it('a sequential policy can never look parallel (and vice versa)', async () => {
    const { ApprovalMap } = await import('@/components/approval-map');
    const seq = renderToStaticMarkup(<ApprovalMap kind="two_sequential" releaseMode="automatic" approvers={[{ name: 'Alex' }, { name: 'Riley' }]} />);
    const par = renderToStaticMarkup(<ApprovalMap kind="two_parallel" releaseMode="maker" approvers={[{ name: 'Alex' }, { name: 'Riley' }]} />);
    expect(seq).toContain('Step 1');
    expect(seq).toContain('Step 2');
    expect(seq).toContain('Alex approves first, then Riley.');
    expect(seq).not.toContain('Both approvals');
    expect(par).toContain('Both approvals');
    expect(par).toContain('approve in any order; both approvals are required');
    expect(par).not.toContain('Step 2');
    expect(par).toContain('Maker releases');
  });
});

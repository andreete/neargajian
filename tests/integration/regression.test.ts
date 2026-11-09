/**
 * Phase 15 · targeted regressions (PRD A02–A06) against the stand-in vault:
 * - imported file integrity: the stored file hash, the frozen rows and the payout root agree;
 *   frozen rows cannot change, and rows that no longer match the approved root are never paid;
 * - contract order in the app: all three approval templates, parallel in either order, both
 *   approvals required before release;
 * - transfer idempotency: repeated release, worker restart after payment, repeated payout.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import { workflowConfigs } from '@/server/db/schema';
import { seedDemo } from '@/server/db/seed';
import { createRun } from '@/server/runs/repository';
import { uploadToDraft } from '@/server/runs/draft-service';
import { decide, latestVersion, reconcileVersion, submitRun } from '@/server/runs/lifecycle';
import { payRows, requestRelease, workerTick } from '@/server/payouts/release';
import { buildPayoutTree, toHex } from '@/server/commitments';
import { FakeVault } from '../helpers/fake-vault';

const dir = mkdtempSync(join(tmpdir(), 'gajian-reg-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const maker = { id: 'usr_maker', role: 'maker' as const };
const app1 = { id: 'usr_app1', role: 'approver' as const };
const app2 = { id: 'usr_app2', role: 'approver' as const };
const FILE = readFileSync('tests/live/live-3-rows.csv');
let h: DatabaseHandle;
let fake: FakeVault;
let k = 0;
let RUN = '';
const v = () => latestVersion(h.db, RUN)!;
const payCalls = () => fake.calls.filter((c) => c.method === 'pay_row').length;
const releaseCalls = () => fake.calls.filter((c) => c.method === 'start_release').length;

async function submitted() {
  RUN = createRun(h.db, { makerUserId: maker.id, title: 'Regression run', postingMode: 'detailed', source: 'upload', now: new Date() });
  uploadToDraft(h.db, maker, RUN, { filename: 'live-3-rows.csv', bytes: FILE, expectedRevision: 0, now: new Date() });
  await submitRun(h.db, fake, maker, RUN, { expectedRevision: 1 });
  await reconcileVersion(h.db, fake, v().id);
}
async function approve(who: typeof app1) {
  await decide(h.db, fake, who, RUN, { versionId: v().id, decision: 'approve' });
  return (await reconcileVersion(h.db, fake, v().id)).status;
}
function policy(kind: 'one' | 'two_parallel') {
  h.db.update(workflowConfigs).set({ kind, ...(kind === 'one' ? { approver2UserId: null } : {}) }).where(eq(workflowConfigs.chainStatus, 'active')).run();
  fake.wf.kind = kind === 'one' ? 'One' : 'TwoParallel';
  if (kind === 'one') fake.wf.approvers = ['approver1.gajian-payroll.testnet'];
}

beforeEach(async () => {
  k += 1;
  h = openDatabase(join(dir, `g${k}.sqlite`));
  await seedDemo(h.db, { env: { DEMO_MODE: 'true' } });
  fake = new FakeVault();
});

describe('imported file integrity', () => {
  it('the file hash, the frozen rows and the on-chain payout root all describe the uploaded file', async () => {
    await submitted();
    const version = v();
    expect(version.sourceSha256).toBe(createHash('sha256').update(FILE).digest('hex'));
    const rows = h.sqlite.prepare('select row_index as i, near_account_id as a, amount, source_line as line from version_rows where version_id = ? order by row_index').all(version.id) as { i: number; a: string; amount: string; line: number }[];
    expect(rows.map((r) => [r.line, r.a, r.amount])).toEqual([
      [2, 'recipient1.gajian-payroll.testnet', '40000'], [3, 'recipient2.gajian-payroll.testnet', '60000'], [4, 'recipient3.gajian-payroll.testnet', '20000'],
    ]);
    const root = toHex(buildPayoutTree(rows.map((r) => ({ index: r.i, accountId: r.a, amount: BigInt(r.amount) }))).root);
    expect(root).toBe(version.payoutRoot);
    expect(fake.runs.get(version.chainRunId)!.payout_root).toBe(root);
    expect(fake.runs.get(version.chainRunId)!.total).toBe('120000');
  });

  it('frozen rows cannot be edited or deleted', async () => {
    await submitted();
    expect(() => h.sqlite.prepare('update version_rows set amount = 990000 where version_id = ?').run(v().id)).toThrow();
    expect(() => h.sqlite.prepare('delete from version_rows where version_id = ?').run(v().id)).toThrow();
  });

  it('rows that no longer match the approved payout root are never paid', async () => {
    await submitted();
    await approve(app1);
    await approve(app2);
    await requestRelease(h.db, fake, v(), { role: 'worker', workerId: 'w' });
    // Simulate tampering below the app (integrity trigger removed in this test database only).
    const trigger = h.sqlite.prepare("select name from sqlite_master where type = 'trigger' and tbl_name = 'version_rows' and sql like '%UPDATE%'").all() as { name: string }[];
    for (const t of trigger) h.sqlite.prepare(`drop trigger ${t.name}`).run();
    h.sqlite.prepare("update version_rows set near_account_id = 'attacker.testnet' where version_id = ? and row_index = 1").run(v().id);
    await expect(payRows(h.db, fake, v(), { role: 'worker', workerId: 'w', max: 10 })).rejects.toThrow(/do not match the approved payout root/);
    expect(payCalls()).toBe(0);
  });
});

describe('approval order enforced end to end', () => {
  it('one approver: a single approval makes the run approved', async () => {
    policy('one');
    await submitted();
    expect(await approve(app1)).toBe('approved');
  });

  it('two in parallel: either order works, and both approvals are required before release', async () => {
    policy('two_parallel');
    await submitted();
    expect(await approve(app2)).toBe('pending_approval'); // approver 2 first is fine in parallel
    await requestRelease(h.db, fake, v(), { role: 'worker', workerId: 'w' });
    expect(releaseCalls()).toBe(0); // not approved yet: nothing is released
    expect(await approve(app1)).toBe('approved');
  });

  it('two in sequence: approver 2 first is refused by the app before any transaction', async () => {
    await submitted();
    const before = fake.calls.length;
    await expect(decide(h.db, fake, app2, RUN, { versionId: v().id, decision: 'approve' })).rejects.toThrow();
    expect(fake.calls.length).toBe(before);
    expect(await approve(app1)).toBe('pending_approval');
    expect(await approve(app2)).toBe('approved');
  });
});

describe('transfer idempotency', () => {
  it('repeated release requests reserve once; a worker restart after payment sends nothing', async () => {
    await submitted();
    await approve(app1);
    await approve(app2);
    await requestRelease(h.db, fake, v(), { role: 'worker', workerId: 'w1' });
    await requestRelease(h.db, fake, v(), { role: 'worker', workerId: 'w2' });
    expect(releaseCalls()).toBe(1);
    await workerTick(h.db, fake, { workerId: 'w1' });
    expect(v().status).toBe('paid');
    expect(payCalls()).toBe(3);
    const calls = fake.calls.length;
    for (const id of ['restarted-1', 'restarted-2']) await workerTick(h.db, fake, { workerId: id });
    await payRows(h.db, fake, v(), { role: 'worker', workerId: 'restarted-3', max: 10 });
    await requestRelease(h.db, fake, v(), { role: 'worker', workerId: 'restarted-4' });
    expect(fake.calls.length).toBe(calls);
    expect([...fake.paidTo.values()]).toEqual([40_000n, 60_000n, 20_000n]);
  });

  it('a duplicate pay_row on an already-paid row is refused by the vault and does not pay twice', async () => {
    await submitted();
    await approve(app1);
    await approve(app2);
    await requestRelease(h.db, fake, v(), { role: 'worker', workerId: 'w' });
    await payRows(h.db, fake, v(), { role: 'worker', workerId: 'w', max: 1 });
    const args = fake.calls.find((c) => c.method === 'pay_row')!.args;
    const again = await fake.call('worker', 'pay_row', args);
    expect(again).toMatchObject({ status: 'failure', error: 'Row is already paid' });
    expect(fake.paidTo.get('recipient1.gajian-payroll.testnet')).toBe(40_000n);
  });
});

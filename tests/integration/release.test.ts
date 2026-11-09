/** Phase 12: release worker and maker release against the stand-in vault. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import { payoutActions, reportEntries, workflowConfigs } from '@/server/db/schema';
import { DEMO_DRAFT_RUN_ID, seedDemo } from '@/server/db/seed';
import { decide, latestVersion, reconcileVersion, runDetail, submitRun } from '@/server/runs/lifecycle';
import { displayStatus } from '@/server/runs/view';
import { requestRelease, workerTick, MAX_ROW_ATTEMPTS } from '@/server/payouts/release';
import { claimPayoutAction } from '@/server/payouts/actions';
import { FakeVault } from '../helpers/fake-vault';

const dir = mkdtempSync(join(tmpdir(), 'gajian-rel-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const maker = { id: 'usr_maker', role: 'maker' as const };
let h: DatabaseHandle;
let fake: FakeVault;
let k = 0;
let clock = new Date('2026-11-10T08:00:00Z');
const later = (ms: number) => (clock = new Date(clock.getTime() + ms));
const rev = () => (h.sqlite.prepare('select draft_revision as r from payroll_runs where id = ?').get(DEMO_DRAFT_RUN_ID) as { r: number }).r;
const version = () => latestVersion(h.db, DEMO_DRAFT_RUN_ID)!;
const tick = (id = 'w1') => workerTick(h.db, fake, { workerId: id, now: later(1000) });
const payCalls = () => fake.calls.filter((c) => c.method === 'pay_row');

async function approved(releaseMode: 'automatic' | 'maker' = 'automatic') {
  if (releaseMode === 'maker') {
    h.db.update(workflowConfigs).set({ releaseMode: 'maker' }).where(eq(workflowConfigs.chainStatus, 'active')).run();
    fake.wf.release_mode = 'Maker';
  }
  await submitRun(h.db, fake, maker, DEMO_DRAFT_RUN_ID, { expectedRevision: rev(), now: clock });
  await reconcileVersion(h.db, fake, version().id, clock);
  await decide(h.db, fake, { id: 'usr_app1', role: 'approver' }, DEMO_DRAFT_RUN_ID, { versionId: version().id, decision: 'approve', now: later(1) });
  await reconcileVersion(h.db, fake, version().id, clock);
  await decide(h.db, fake, { id: 'usr_app2', role: 'approver' }, DEMO_DRAFT_RUN_ID, { versionId: version().id, decision: 'approve', now: later(1) });
  await reconcileVersion(h.db, fake, version().id, clock);
  expect(version().status).toBe('approved');
}

beforeEach(async () => {
  k += 1;
  h = openDatabase(join(dir, `r${k}.sqlite`));
  await seedDemo(h.db, { env: { DEMO_MODE: 'true' } });
  fake = new FakeVault();
});

describe('release worker', () => {
  it('releases an approved automatic run and pays every row exactly once; Paid only when the vault says so', async () => {
    await approved();
    await tick();
    expect(version().status).toBe('paid');
    expect(payCalls().map((c) => c.args.index)).toEqual([0, 1, 2]);
    expect([...fake.paidTo]).toEqual([
      ['recipient1.gajian-payroll.testnet', 30_000n], ['recipient2.gajian-payroll.testnet', 70_000n], ['recipient3.gajian-payroll.testnet', 50_000n],
    ]);
    expect(fake.balance).toBe(850_000n);
    expect(fake.reserved).toBe(0n);
    await tick();
    await tick();
    expect(payCalls()).toHaveLength(3); // repeated ticks never pay again
    expect(h.db.select().from(reportEntries).all()).toHaveLength(3); // detailed posting: one entry per line
  });

  it('two workers at once never pay a row twice', async () => {
    await approved();
    await requestRelease(h.db, fake, version(), { role: 'worker', workerId: 'w1', now: clock });
    await Promise.all([tick('w1'), tick('w2')]);
    expect(payCalls()).toHaveLength(3);
    expect(new Set(payCalls().map((c) => c.args.index)).size).toBe(3);
  });

  it('resumes after the worker stopped between claiming and signing', async () => {
    await approved();
    await requestRelease(h.db, fake, version(), { role: 'worker', workerId: 'w1', now: clock });
    claimPayoutAction(h.db, { versionId: version().id, kind: 'pay_row', rowIndex: 0, workerId: 'crashed', now: clock, leaseMs: 1000 });
    later(5000); // lease expired; nothing was sent
    await tick();
    expect(payCalls().map((c) => c.args.index)).toEqual([1, 2]); // row 0 is not retried until the backoff passes
    later(31_000);
    await tick();
    expect(version().status).toBe('paid');
    expect(fake.paidTo.get('recipient1.gajian-payroll.testnet')).toBe(30_000n);
  });

  it('an unknown outcome that landed is reconciled from the vault, not paid again', async () => {
    await approved();
    await requestRelease(h.db, fake, version(), { role: 'worker', workerId: 'w1', now: clock });
    fake.modes.set('pay_row', 'unknown-landed');
    await tick();
    expect(version().status).toBe('paid');
    expect(payCalls()).toHaveLength(3);
    const row0 = h.db.select().from(payoutActions).all().filter((a) => a.rowIndex === 0);
    expect(row0).toHaveLength(1);
    expect(row0[0]?.status).toBe('succeeded');
  });

  it('an unknown outcome that never landed stays unknown until proven, then is retried once', async () => {
    await approved();
    await requestRelease(h.db, fake, version(), { role: 'worker', workerId: 'w1', now: clock });
    fake.modes.set('pay_row', 'unknown-lost');
    await tick();
    expect(version().status).toBe('releasing');
    later(31_000);
    await tick();
    expect(version().status).toBe('paid');
    expect(fake.paidTo.get('recipient1.gajian-payroll.testnet')).toBe(30_000n);
    expect(h.db.select().from(payoutActions).all().filter((a) => a.rowIndex === 0).map((a) => a.status)).toEqual(['failed', 'succeeded']);
  });

  it('insufficient funding: release is refused, the run shows Awaiting funding, then releases after top-up', async () => {
    await approved();
    fake.balance = 100_000n;
    await tick();
    expect(version().status).toBe('approved');
    expect(displayStatus(runDetail(h.db, maker, DEMO_DRAFT_RUN_ID))).toBe('awaiting_funding');
    expect(payCalls()).toHaveLength(0);
    fake.balance = 1_000_000n;
    await tick(); // still inside the retry window: no new release attempt
    expect(version().status).toBe('approved');
    later(61_000);
    await tick();
    expect(version().status).toBe('paid');
  });

  it('a proven transfer failure is retried a bounded number of times, then needs attention; never false Paid', async () => {
    await approved();
    fake.unregistered.add('recipient2.gajian-payroll.testnet');
    for (let i = 0; i < MAX_ROW_ATTEMPTS + 2; i++) { await tick(); later(31_000); }
    expect(version().status).toBe('releasing');
    expect(displayStatus(runDetail(h.db, maker, DEMO_DRAFT_RUN_ID))).toBe('needs_attention');
    expect(payCalls().filter((c) => c.args.index === 1)).toHaveLength(MAX_ROW_ATTEMPTS);
    expect(fake.paidTo.has('recipient2.gajian-payroll.testnet')).toBe(false);
    expect(h.db.select().from(reportEntries).all()).toHaveLength(0);
  });

  it('maker release: the worker does not release; the maker does, then the worker pays', async () => {
    await approved('maker');
    await tick();
    expect(version().status).toBe('approved');
    expect(fake.calls.filter((c) => c.method === 'start_release')).toHaveLength(0);
    const r = await requestRelease(h.db, fake, version(), { role: 'maker', workerId: 'maker', now: clock });
    expect(r.status).toBe('releasing');
    expect(fake.calls.find((c) => c.method === 'start_release')?.role).toBe('maker');
    await tick();
    expect(version().status).toBe('paid');
  });
});

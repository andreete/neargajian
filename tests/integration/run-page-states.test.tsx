/**
 * Phase 13b regression (PRD A06): the run page's status badge, "Paid" counter, banner and
 * timeline come from one payment state. "Paid" appears only when every row is confirmed and
 * the confirmed count and total equal the approved count and total. Renders the real run
 * page (server component) in every intermediate payout state against the stand-in vault.
 *
 * Root cause covered: the vault reports the run Paid as soon as the last pay_row lands, while
 * the worker is still waiting for finality before recording that payout. The page's reconcile
 * used to copy "Paid" from the vault at that moment, so the badge said Paid while the
 * counters (from payout records) said 2 of 3.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DatabaseHandle, Db } from '@/server/db/client';
import { FakeVault } from '../helpers/fake-vault';

const dir = mkdtempSync(join(tmpdir(), 'gajian-page-'));
process.env.DATABASE_URL = `file:${join(dir, 'page-0.sqlite')}`;
process.env.DEMO_MODE = 'true';
process.env.APP_BASE_URL = 'http://127.0.0.1:8092';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => '/runs/x',
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: () => { throw new Error('NEXT_REDIRECT'); },
  forbidden: () => { throw new Error('NEXT_FORBIDDEN'); },
}));
const viewer = { current: { id: 'usr_maker', email: 'maker@gajian.my.id', displayName: 'Maya Maker', role: 'maker' as const, chainAccountId: 'maker.gajian-payroll.testnet' } };
vi.mock('@/server/web/page-auth', () => ({
  requireRole: async () => ({ user: viewer.current, csrfToken: 'csrf', expiresAt: new Date(Date.now() + 3_600_000) }),
  currentSession: async () => null,
}));

let db: Db;
let handle: DatabaseHandle;
let RUN = '';
const maker = { id: 'usr_maker', role: 'maker' as const };
let fake: FakeVault;
type Lib = typeof import('@/server/runs/lifecycle') & typeof import('@/server/payouts/release');
let lib: Lib;
let RunPage: (p: { params: Promise<{ runId: string }> }) => Promise<React.ReactElement>;
let clock = new Date('2026-11-10T08:00:00Z');
const later = (ms: number) => (clock = new Date(clock.getTime() + ms));

const version = () => lib.latestVersion(db, RUN)!;
const pay = (max = 1) => lib.payRows(db, fake, version(), { role: 'worker', workerId: 'w', max, now: later(1000) });

/** Renders the real page and extracts badge, counter, banner and timeline. */
async function render() {
  const html = renderToStaticMarkup(await RunPage({ params: Promise.resolve({ runId: RUN }) }));
  const text = (x: string) => x.replace(/<[^>]+>/g, '').trim();
  const head = /<div class="run-head">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
  const badge = text(/<\/h1><span class="chip chip-\w+">([\s\S]*?)<\/span>/.exec(head)?.[1] ?? '');
  const stat = /<div class="label">Paid<\/div><div class="value">(\d+) of (\d+)<\/div><div class="foot">([\d.]+) of ([\d.]+) tUSDC confirmed<\/div>/.exec(html);
  const timeline = /Payouts: (\d+) of (\d+) paid/.exec(html);
  const banner = /Releasing: (\d+) of (\d+) recipients paid/.exec(html);
  return {
    html, badge,
    paid: stat ? Number(stat[1]) : -1, rows: stat ? Number(stat[2]) : -1, paidAmount: stat?.[3] ?? '', total: stat?.[4] ?? '',
    timeline: timeline ? [Number(timeline[1]), Number(timeline[2])] : null,
    banner: banner ? [Number(banner[1]), Number(banner[2])] : null,
  };
}

/** The invariant checked in every state. */
function consistent(r: Awaited<ReturnType<typeof render>>) {
  expect(r.rows).toBe(3);
  if (r.timeline) expect(r.timeline).toEqual([r.paid, r.rows]);
  if (r.banner) expect(r.banner).toEqual([r.paid, r.rows]);
  const complete = r.paid === r.rows && r.paidAmount === r.total;
  expect(r.badge === 'Paid').toBe(complete);
  if (r.badge === 'Paid') expect(r.timeline).toEqual([r.rows, r.rows]);
}

/** A fresh approved 3-row run (demo draft: 0.03 + 0.07 + 0.05 = 0.15 tUSDC). */
async function approvedRun() {
  const client = await import('@/server/db/client');
  client.closeDatabase();
  process.env.DATABASE_URL = `file:${join(dir, `page-${clock.getTime()}.sqlite`)}`;
  handle = client.getDatabase();
  db = handle.db;
  const seed = await import('@/server/db/seed');
  await seed.seedDemo(db, { env: { DEMO_MODE: 'true' } });
  RUN = seed.DEMO_DRAFT_RUN_ID;
  fake = new FakeVault();
  const rev = (handle.sqlite.prepare('select draft_revision as r from payroll_runs where id = ?').get(RUN) as { r: number }).r;
  await lib.submitRun(db, fake, maker, RUN, { expectedRevision: rev, now: clock });
  await lib.reconcileVersion(db, fake, version().id, clock);
  for (const id of ['usr_app1', 'usr_app2']) {
    await lib.decide(db, fake, { id, role: 'approver' }, RUN, { versionId: version().id, decision: 'approve', now: later(1) });
    await lib.reconcileVersion(db, fake, version().id, clock);
  }
}

beforeAll(async () => {
  lib = { ...(await import('@/server/runs/lifecycle')), ...(await import('@/server/payouts/release')) } as Lib;
  RunPage = (await import('@/app/(app)/runs/[runId]/page')).default as typeof RunPage;
}, 60_000);
afterAll(async () => {
  (await import('@/server/db/client')).closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

describe('run page payout states (one consistent state)', () => {
  it('walks every intermediate payout state; the badge never runs ahead of the counters', async () => {
    await approvedRun();
    let r = await render();
    expect([r.badge, r.paid, r.paidAmount, r.total, r.timeline]).toEqual(['Ready to release', 0, '0.00', '0.15', null]);
    consistent(r);

    await lib.requestRelease(db, fake, version(), { role: 'worker', workerId: 'w', now: later(1) });
    r = await render();
    expect([r.badge, r.paid, r.banner, r.timeline]).toEqual(['Releasing', 0, [0, 3], null]);
    consistent(r);

    await pay();
    r = await render();
    expect([r.badge, r.paid, r.paidAmount, r.timeline]).toEqual(['Releasing', 1, '0.03', [1, 3]]);
    consistent(r);

    fake.unregistered.add('recipient2.gajian-payroll.testnet'); // proven transfer failure
    await pay();
    r = await render();
    expect([r.badge, r.paid, r.paidAmount, r.timeline]).toEqual(['Needs attention', 1, '0.03', [1, 3]]);
    consistent(r);

    fake.unregistered.clear();
    later(31_000); // retry after the backoff
    await pay();
    r = await render();
    expect([r.badge, r.paid, r.paidAmount, r.timeline]).toEqual(['Releasing', 2, '0.10', [2, 3]]);
    consistent(r);

    // The race behind the bug: the last pay_row has landed and the vault reports the run Paid,
    // but the worker is still waiting for finality and has not recorded that payout yet.
    const held = fake.hold('pay_row');
    const worker = pay();
    await held.signed;
    expect((await fake.view<{ status: string }>('get_run', { run_id: version().chainRunId })).status).toBe('Paid');
    r = await render();
    expect([r.badge, r.paid, r.paidAmount, r.timeline]).toEqual(['Releasing', 2, '0.10', [2, 3]]);
    consistent(r);

    // The page's reconcile settles that payout from get_row before it may mark the run Paid.
    expect((await lib.reconcileVersion(db, fake, version().id, later(1))).status).toBe('paid');
    r = await render();
    expect([r.badge, r.paid, r.paidAmount, r.total, r.timeline]).toEqual(['Paid', 3, '0.15', '0.15', [3, 3]]);
    expect(r.html).toContain('All recipients paid by the vault');
    consistent(r);
    expect(handle.sqlite.prepare('select count(*) as n from report_entries where version_id = ?').get(version().id)).toEqual({ n: 3 });

    // The worker's late answer cannot change the confirmed record, and nothing is paid twice.
    held.release();
    await worker;
    expect(fake.calls.filter((c) => c.method === 'pay_row').map((c) => c.args.index)).toEqual([0, 1, 1, 2]);
    expect([...fake.paidTo.values()].reduce((a, b) => a + b, 0n)).toBe(150_000n);
    r = await render();
    expect([r.badge, r.paid]).toEqual(['Paid', 3]);
  });

  it('vault Paid while a payout record cannot be confirmed yet: stays Releasing; a stale Paid version never shows Paid', async () => {
    await approvedRun();
    await lib.requestRelease(db, fake, version(), { role: 'worker', workerId: 'w', now: later(1) });
    await pay(2);
    const held = fake.hold('pay_row');
    const worker = pay();
    await held.signed;
    const key = `${version().chainRunId}:2`;
    const row = fake.rows.get(key)!;
    fake.rows.delete(key); // get_row cannot prove the last payout yet
    expect((await lib.reconcileVersion(db, fake, version().id, later(1))).status).toBe('releasing');
    let r = await render();
    expect([r.badge, r.paid, r.timeline]).toEqual(['Releasing', 2, [2, 3]]);
    consistent(r);

    // Data written by the old code (version copied "paid" from the vault, last row unrecorded):
    // the page still derives Releasing with matching counters.
    handle.sqlite.prepare("update run_versions set status = 'paid' where id = ?").run(version().id);
    r = await render();
    expect([r.badge, r.paid, r.banner, r.timeline]).toEqual(['Releasing', 2, [2, 3], [2, 3]]);
    consistent(r);

    fake.rows.set(key, row);
    held.release();
    await worker;
    r = await render();
    expect([r.badge, r.paid, r.paidAmount, r.timeline]).toEqual(['Paid', 3, '0.15', [3, 3]]);
    consistent(r);
  });
});

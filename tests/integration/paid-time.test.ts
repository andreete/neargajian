/**
 * Phase 16b: a payout's paid time is the timestamp of the block that includes its pay_row
 * transaction (what the explorer shows), never the app's or the worker's clock. It is set once
 * at confirmation and never changes, and the run page, history and both CSVs use that one value.
 * The stand-in vault's chain clock runs hours away from the app clock to tell them apart.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import { DEMO_DRAFT_RUN_ID, seedDemo } from '@/server/db/seed';
import { decide, latestVersion, reconcileVersion, runDetail, submitRun } from '@/server/runs/lifecycle';
import { payRows, requestRelease, workerTick } from '@/server/payouts/release';
import { companyCsv, historyFor, recipientCsv } from '@/server/reports/history';
import { rowStates } from '@/server/runs/view';
import { FakeVault } from '../helpers/fake-vault';

const dir = mkdtempSync(join(tmpdir(), 'gajian-paid-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const maker = { id: 'usr_maker', role: 'maker' as const };
const APP_NOW = new Date('2026-11-10T08:00:00Z'); // the app/worker clock: four hours before the chain clock
let h: DatabaseHandle;
let fake: FakeVault;
let k = 0;
const v = () => latestVersion(h.db, DEMO_DRAFT_RUN_ID)!;
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const csvLines = (csv: string) => csv.replace(/^﻿/, '').trim().split('\r\n').slice(1);
const actions = () => h.sqlite.prepare("select row_index as i, tx_hash as tx, updated_at as appTime, chain_block_time as blockTime from payout_actions where version_id = ? and kind = 'pay_row' and status = 'succeeded' order by row_index").all(v().id) as { i: number; tx: string; appTime: number; blockTime: number | null }[];

async function releasing() {
  const rev = (h.sqlite.prepare('select draft_revision as r from payroll_runs where id = ?').get(DEMO_DRAFT_RUN_ID) as { r: number }).r;
  await submitRun(h.db, fake, maker, DEMO_DRAFT_RUN_ID, { expectedRevision: rev, now: APP_NOW });
  await reconcileVersion(h.db, fake, v().id, APP_NOW);
  for (const id of ['usr_app1', 'usr_app2']) {
    await decide(h.db, fake, { id, role: 'approver' }, DEMO_DRAFT_RUN_ID, { versionId: v().id, decision: 'approve', now: APP_NOW });
    await reconcileVersion(h.db, fake, v().id, APP_NOW);
  }
  await requestRelease(h.db, fake, v(), { role: 'worker', workerId: 'w', now: APP_NOW });
}

beforeEach(async () => {
  k += 1;
  h = openDatabase(join(dir, `p${k}.sqlite`));
  await seedDemo(h.db, { env: { DEMO_MODE: 'true' } });
  fake = new FakeVault();
});

describe('paid time from the chain', () => {
  it('run page, history and both CSVs show the pay_row block time, not the app clock', async () => {
    await releasing();
    await payRows(h.db, fake, v(), { role: 'worker', workerId: 'w', max: 10, now: APP_NOW });
    expect(v().status).toBe('paid');
    const acts = actions();
    expect(acts).toHaveLength(3);
    for (const a of acts) {
      expect(a.blockTime).toBe(fake.blockTimes.get(a.tx)!.getTime());
      expect(a.blockTime).not.toBe(a.appTime);
    }
    // The release's own block time is recorded too, and it comes before every payout.
    const release = h.sqlite.prepare("select chain_block_time as t from payout_actions where version_id = ? and kind = 'release'").get(v().id) as { t: number };
    expect(release.t).toBeLessThan(Math.min(...acts.map((a) => a.blockTime!)));

    const byRow = new Map(acts.map((a) => [a.i, new Date(a.blockTime!)]));
    const rows = rowStates(runDetail(h.db, maker, DEMO_DRAFT_RUN_ID));
    expect(rows.map((r) => r.paidAt)).toEqual([0, 1, 2].map((i) => byRow.get(i)!.toISOString()));

    const hist = historyFor(h.db, maker).paid[0]!;
    expect(hist.lines.map((l) => l.paidAt?.getTime())).toEqual([0, 1, 2].map((i) => byRow.get(i)!.getTime()));
    expect(hist.paidAt?.getTime()).toBe(Math.max(...acts.map((a) => a.blockTime!)));

    const company = csvLines(companyCsv(h.db, maker)); // detailed posting: one line per payout
    expect(company.map((l) => l.split(',')[6])).toEqual([0, 1, 2].map((i) => iso(byRow.get(i)!)));
    const recipients = csvLines(recipientCsv(h.db, maker, 'https://testnet.nearblocks.io/txns/'));
    for (const line of recipients) {
      const cells = line.split(',');
      const tx = cells[10]!;
      expect(cells[7]).toBe(iso(fake.blockTimes.get(tx)!)); // the explorer's time for that very tx
    }
  });

  it('is set once: a later confirmation or a direct update cannot change it', async () => {
    await releasing();
    await payRows(h.db, fake, v(), { role: 'worker', workerId: 'w', max: 10, now: APP_NOW });
    const before = actions();
    await workerTick(h.db, fake, { workerId: 'w2', now: new Date(APP_NOW.getTime() + 60_000) });
    await reconcileVersion(h.db, fake, v().id, new Date(APP_NOW.getTime() + 120_000));
    expect(actions()).toEqual(before);
    expect(() => h.sqlite.prepare("update payout_actions set chain_block_time = chain_block_time + 1000 where version_id = ? and kind = 'pay_row'").run(v().id)).toThrow(/block time is final/);
    expect(() => h.sqlite.prepare("update payout_actions set chain_block_time = 1 where version_id = ? and status <> 'succeeded'").run(v().id)).not.toThrow(); // no rows
  });

  it('when the block time cannot be read yet, the run stays out of reports until the worker reads it', async () => {
    await releasing();
    fake.blockTimeUnavailable = true;
    await payRows(h.db, fake, v(), { role: 'worker', workerId: 'w', max: 10, now: APP_NOW });
    expect(v().status).toBe('paid');
    expect(actions().every((a) => a.blockTime === null)).toBe(true); // never guessed from the app clock
    expect(historyFor(h.db, maker).paid).toHaveLength(0);
    expect(csvLines(companyCsv(h.db, maker))).toHaveLength(0);
    fake.blockTimeUnavailable = false;
    const s = await workerTick(h.db, fake, { workerId: 'w', now: APP_NOW });
    expect(s.blockTimes).toBe(4); // three payouts + the release
    expect(actions().every((a) => a.blockTime === fake.blockTimes.get(a.tx)!.getTime())).toBe(true);
    expect(csvLines(companyCsv(h.db, maker))).toHaveLength(3);
  });
});

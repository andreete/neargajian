/**
 * Imported testnet history.
 * - The demo seed imports the SentFund deployment's real runs (Phase 22, vault.sentfund-payroll.testnet).
 * - 09b + 16: operations transfers (vault retirement, vault migration) are labelled and excluded from
 *   payroll counts and totals, checked on the earlier gajian-payroll.testnet history (fixture).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase } from '@/server/db/client';
import { seedDemo } from '@/server/db/seed';
import { importTestnetHistory, readTestnetHistory } from '@/server/db/testnet-history';
import { allTestnetRuns, makerTestnetRuns, operationsTransfers, testnetTotals } from '@/server/dashboard/queries';
import { testnetFacts } from '@/server/landing';

const dir = mkdtempSync(join(tmpdir(), 'sentfund-hist-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('imported testnet history', () => {
  it('seeds the SentFund deployment runs: two paid, one rejected, all on vault.sentfund-payroll.testnet', async () => {
    const h = openDatabase(join(dir, 'h.sqlite'));
    await seedDemo(h.db, { env: { DEMO_MODE: 'true' } });
    const runs = allTestnetRuns(h.db);
    expect(runs.map((r) => r.id).sort()).toEqual(['p22-par-202611100718', 'p22-rej-202611100718', 'p22-seq-202611100718']);
    expect(new Set(runs.map((r) => r.vaultGeneration))).toEqual(new Set(['sentfund (Phase 22)']));
    expect(operationsTransfers(h.db)).toEqual([]);
    expect(testnetTotals(h.db)).toMatchObject({ paidRuns: 2, payouts: 5, paidTotal: 180_000n, rejectedRuns: 1 });
    expect(makerTestnetRuns(h.db, 'usr_maker').find((r) => r.id === 'p22-seq-202611100718')?.lastPaidTxHash).toBe('DMrHt1TcQAZjkKbuNh4RwX66wA25d7cmD5Nxa84Mf4Mc');
    expect(testnetFacts(h.db, 'vault.sentfund-payroll.testnet')).toEqual({
      vault: 'vault.sentfund-payroll.testnet', paidRuns: 2, payouts: 5, doublePayments: 0, repeatAttemptsRefused: 1,
      firstPayout: { txHash: 'UEJ1PEDzaYxXxWQWez4LAassLT93Beje7jzDbS9S8fP', at: new Date('2026-11-10T07:19:19.889Z') },
      latestPayoutAt: new Date('2026-11-10T07:20:20.750Z'),
    });
    h.sqlite.close();
  });

  it('separates operations transfers and keeps them out of payroll totals (earlier deployment fixture)', async () => {
    const h = openDatabase(join(dir, 'g.sqlite'));
    await seedDemo(h.db, { env: { DEMO_MODE: 'true' }, testnetHistory: false });
    importTestnetHistory(h.db, readTestnetHistory(join(process.cwd(), 'tests/fixtures/testnet-history.gajian.json')));
    expect(operationsTransfers(h.db).map((r) => [r.id, r.category, r.total])).toEqual([['p16-migrate-202611091439', 'operations', 700_000n], ['p02-drain', 'operations', 950_000n]]);
    expect(allTestnetRuns(h.db).filter((r) => r.category === 'payroll').map((r) => r.id).sort()).toEqual(['p02-run-1', 'p04-par-202611091047', 'p04-rej-202611091047', 'p04-seq-202611091047']);
    expect(testnetTotals(h.db)).toMatchObject({ paidRuns: 3, payouts: 6, paidTotal: 230_000n, rejectedRuns: 1 });
    // The earlier runs belong to maker.gajian-payroll.testnet, not to today's demo maker.
    expect(makerTestnetRuns(h.db, 'usr_maker')).toEqual([]);
    // Landing facts are per vault: the earlier deployment's first payout (7Dwmqek…) is never shown
    // next to the SentFund vault.
    expect(testnetFacts(h.db, 'vault.sentfund-payroll.testnet')).toMatchObject({ paidRuns: 0, payouts: 0, firstPayout: null, latestPayoutAt: null });
    expect(testnetFacts(h.db, 'vault.gajian-payroll.testnet').firstPayout?.txHash).toBe('7DwmqekZtpB7u2L3JU4wEv9DoXKTdYhaQKaDXWnt5xwL');
    h.sqlite.close();
  });
});

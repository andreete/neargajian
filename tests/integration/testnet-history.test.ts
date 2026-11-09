/** 09b: operations transfers are labelled and excluded from payroll counts and totals. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase } from '@/server/db/client';
import { seedDemo } from '@/server/db/seed';
import { allTestnetRuns, makerTestnetRuns, operationsTransfers, testnetTotals } from '@/server/dashboard/queries';
import { testnetFacts } from '@/server/landing';

const dir = mkdtempSync(join(tmpdir(), 'gajian-hist-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('imported testnet history', () => {
  it('separates the vault retirement as an operations transfer and keeps it out of payroll totals', async () => {
    const h = openDatabase(join(dir, 'h.sqlite'));
    await seedDemo(h.db, { env: { DEMO_MODE: 'true' } });
    expect(operationsTransfers(h.db).map((r) => [r.id, r.category, r.total])).toEqual([['p02-drain', 'operations', 950_000n]]);
    expect(allTestnetRuns(h.db).filter((r) => r.category === 'payroll').map((r) => r.id).sort()).toEqual(['p02-run-1', 'p04-par-202611091047', 'p04-rej-202611091047', 'p04-seq-202611091047']);
    expect(testnetTotals(h.db)).toMatchObject({ paidRuns: 3, payouts: 6, paidTotal: 230_000n, rejectedRuns: 1 });
    expect(makerTestnetRuns(h.db, 'usr_maker').find((r) => r.id === 'p02-drain')?.lastPaidTxHash).toBe('EaqSFT61e1vXPatfps9cDz38yhcarRqqdfieteHcHrGn');
    expect(testnetFacts()).toMatchObject({ paidRuns: 3, payouts: 6, doublePayments: 0, repeatAttemptsRefused: 2 });
    h.sqlite.close();
  });
});

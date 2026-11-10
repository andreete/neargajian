/**
 * Facts for the public landing page, never typed by hand: the sample upload file (committed)
 * and the testnet payout facts (live from this copy's database, see testnetFacts).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { parseAmount } from './money.ts';
import { and, eq, inArray } from 'drizzle-orm';
import type { Queryable } from './db/client.ts';
import { payoutActions, runVersions, testnetRunEvents, testnetRunRows, testnetRuns } from './db/schema.ts';

export const SAMPLE_FILE = 'sentfund-payroll-sample-1000.csv';

export interface SamplePreview {
  fileName: string;
  sizeBytes: number;
  rowCount: number;
  total: bigint;
  firstRows: { line: number; account: string; name: string; amount: bigint }[];
}

let cachedSample: SamplePreview | undefined;
export function samplePreview(): SamplePreview {
  if (cachedSample) return cachedSample;
  const buf = readFileSync(resolve(/* turbopackIgnore: true */ process.cwd(), 'public/templates', SAMPLE_FILE));
  const records = parse(buf, { columns: false, skip_empty_lines: true }) as string[][];
  const data = records.slice(1);
  const amounts = data.map((r) => {
    const p = parseAmount(r[3] ?? '');
    if (!p.ok) throw new Error('sample file contains an invalid amount');
    return p.value;
  });
  cachedSample = {
    fileName: SAMPLE_FILE,
    sizeBytes: buf.length,
    rowCount: data.length,
    total: amounts.reduce((s, a) => s + a, 0n),
    firstRows: data.slice(0, 5).map((r, i) => ({ line: i + 2, account: r[0] ?? '', name: r[1] ?? '', amount: amounts[i] ?? 0n })),
  };
  return cachedSample;
}

export interface TestnetFacts {
  /** The vault the facts are about (this copy's configured vault). */
  vault: string;
  paidRuns: number;
  payouts: number;
  doublePayments: number;
  repeatAttemptsRefused: number;
  /** The first payout made by this vault: the imported chain history or an app run, whichever is earlier. */
  firstPayout: { txHash: string; at: Date } | null;
  /** Block time of the latest payout: the "as of" time of these facts. */
  latestPayoutAt: Date | null;
}

const REPEAT_REFUSED = /already paid|not releasing|already in flight/i;

/**
 * Live facts for the landing page, read from this copy's database on every request and limited
 * to one vault: the imported testnet history (db/seed/testnet-history.json, read from the chain)
 * plus every payroll run this copy has paid since. Operations transfers are not payroll.
 */
export function testnetFacts(db: Queryable, vault: string): TestnetFacts {
  const payouts: { txHash: string; at: Date }[] = [];
  let paidRuns = 0;
  let doublePayments = 0;
  let repeatAttemptsRefused = 0;

  const history = db.select().from(testnetRuns).where(and(eq(testnetRuns.vaultAccount, vault), eq(testnetRuns.category, 'payroll'))).all();
  const historyIds = history.map((r) => r.id);
  paidRuns += history.filter((r) => r.status === 'paid').length;
  if (historyIds.length > 0) {
    for (const r of db.select().from(testnetRunRows).where(inArray(testnetRunRows.runId, historyIds)).all()) {
      if (r.paidTxHash && r.paidAt) payouts.push({ txHash: r.paidTxHash, at: r.paidAt });
    }
    const paidPerRow = new Map<string, number>();
    for (const e of db.select().from(testnetRunEvents).where(and(inArray(testnetRunEvents.runId, historyIds), eq(testnetRunEvents.method, 'pay_row'))).all()) {
      if (e.success) paidPerRow.set(`${e.runId}:${e.rowIndex}`, (paidPerRow.get(`${e.runId}:${e.rowIndex}`) ?? 0) + 1);
      else if (REPEAT_REFUSED.test(e.error ?? '')) repeatAttemptsRefused += 1;
    }
    for (const n of paidPerRow.values()) if (n > 1) doublePayments += n - 1;
  }

  const versions = db.select({ id: runVersions.id, status: runVersions.status }).from(runVersions).where(eq(runVersions.vaultContractId, vault)).all();
  paidRuns += versions.filter((v) => v.status === 'paid').length;
  const versionIds = versions.map((v) => v.id);
  if (versionIds.length > 0) {
    const paidPerRow = new Map<string, number>();
    for (const a of db.select().from(payoutActions).where(and(inArray(payoutActions.versionId, versionIds), eq(payoutActions.kind, 'pay_row'))).all()) {
      if (a.status === 'succeeded' && a.txHash) {
        payouts.push({ txHash: a.txHash, at: a.chainBlockTime ?? a.updatedAt });
        paidPerRow.set(`${a.versionId}:${a.rowIndex}`, (paidPerRow.get(`${a.versionId}:${a.rowIndex}`) ?? 0) + 1);
      } else if (REPEAT_REFUSED.test(a.error ?? '')) repeatAttemptsRefused += 1;
    }
    for (const n of paidPerRow.values()) if (n > 1) doublePayments += n - 1;
  }

  payouts.sort((a, b) => a.at.getTime() - b.at.getTime() || a.txHash.localeCompare(b.txHash));
  return {
    vault,
    paidRuns,
    payouts: payouts.length,
    doublePayments,
    repeatAttemptsRefused,
    firstPayout: payouts[0] ?? null,
    latestPayoutAt: payouts.at(-1)?.at ?? null,
  };
}

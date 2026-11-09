/**
 * Facts for the public landing page, derived from committed files (never typed by hand):
 * the sample upload file and the testnet run history exported from the chain.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { parseAmount } from './money.ts';
import { readTestnetHistory } from './db/testnet-history.ts';

export const SAMPLE_FILE = 'gajian-payroll-sample-1000.csv';

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
  paidRuns: number;
  payouts: number;
  doublePayments: number;
  repeatAttemptsRefused: number;
}

let cachedFacts: TestnetFacts | undefined;
export function testnetFacts(): TestnetFacts {
  if (cachedFacts) return cachedFacts;
  // Payroll runs only: operations transfers (e.g. the vault retirement) are not payroll.
  const runs = readTestnetHistory().filter((r) => (r.category ?? 'payroll') === 'payroll');
  let doublePayments = 0;
  let repeatAttemptsRefused = 0;
  for (const run of runs) {
    const paidPerRow = new Map<number, number>();
    for (const e of run.events) {
      if (e.method !== 'pay_row') continue;
      const idx = e.args.index ?? -1;
      if (e.success) paidPerRow.set(idx, (paidPerRow.get(idx) ?? 0) + 1);
      else if (/already paid|not releasing|already in flight/i.test(e.error ?? '')) repeatAttemptsRefused += 1;
    }
    for (const n of paidPerRow.values()) if (n > 1) doublePayments += n - 1;
  }
  cachedFacts = {
    paidRuns: runs.filter((r) => r.status === 'paid').length,
    payouts: runs.reduce((s, r) => s + r.rows.filter((x) => x.paidTxHash).length, 0),
    doublePayments,
    repeatAttemptsRefused,
  };
  return cachedFacts;
}

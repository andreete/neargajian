/**
 * Loads the real testnet run history (db/seed/testnet-history.json, exported from the chain
 * by scripts/testnet/export-history.mjs) into the testnet_* tables. Idempotent; maps chain
 * accounts to demo users by their chain_account_id.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Db } from './client.ts';
import { testnetRunEvents, testnetRunRows, testnetRuns, users, type ReleaseMode, type WorkflowKind } from './schema.ts';

export interface HistoryRun {
  runId: string; vault: string; vaultGeneration: string; title: string; category?: 'payroll' | 'operations'; kind: WorkflowKind; releaseMode: ReleaseMode;
  approvers: string[]; status: 'paid' | 'rejected' | 'incomplete'; rejectionReason: string | null; maker: string;
  total: string; rowCount: number; payoutRoot: string | null; reviewDigest: string | null; createdAt: string;
  rows: { index: number; receiver: string; amount: string; paidTxHash?: string; paidAt?: string }[];
  events: { txHash: string; signer: string; method: string; at: string; success: boolean; error: string | null; args: { index: number | null } }[];
}

export function readTestnetHistory(path = resolve(/* turbopackIgnore: true */ process.cwd(), 'db/seed/testnet-history.json')): HistoryRun[] {
  return (JSON.parse(readFileSync(path, 'utf8')) as { runs: HistoryRun[] }).runs;
}

export function importTestnetHistory(db: Db, runs: HistoryRun[]): number {
  let imported = 0;
  db.transaction((tx) => {
    for (const run of runs) {
      if (tx.select({ id: testnetRuns.id }).from(testnetRuns).where(eq(testnetRuns.id, run.runId)).get()) continue;
      const maker = tx.select({ id: users.id }).from(users).where(eq(users.chainAccountId, run.maker)).get();
      const create = run.events[0];
      if (!create) throw new Error(`${run.runId}: no events`);
      tx.insert(testnetRuns).values({
        id: run.runId, vaultAccount: run.vault, vaultGeneration: run.vaultGeneration, title: run.title, category: run.category ?? 'payroll', makerUserId: maker?.id ?? null,
        kind: run.kind, releaseMode: run.releaseMode, approverAccounts: JSON.stringify(run.approvers), status: run.status,
        rejectionReason: run.rejectionReason, rowCount: run.rowCount, total: BigInt(run.total), payoutRoot: run.payoutRoot,
        reviewDigest: run.reviewDigest, createdAt: new Date(run.createdAt), createdTxHash: create.txHash,
      }).run();
      for (const r of run.rows) {
        tx.insert(testnetRunRows).values({
          runId: run.runId, rowIndex: r.index, receiverAccount: r.receiver, amount: BigInt(r.amount),
          paidTxHash: r.paidTxHash ?? null, paidAt: r.paidAt ? new Date(r.paidAt) : null,
        }).run();
      }
      run.events.forEach((e, seq) => {
        tx.insert(testnetRunEvents).values({
          runId: run.runId, seq, txHash: e.txHash, signerAccount: e.signer, method: e.method, rowIndex: e.args.index,
          success: e.success, error: e.error, at: new Date(e.at),
        }).run();
      });
      imported += 1;
    }
  });
  return imported;
}

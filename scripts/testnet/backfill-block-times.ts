#!/usr/bin/env node
// Phase 16b one-off correction: sets chain_block_time for every confirmed (succeeded) payout
// and release action that does not have one yet, from the chain only: the timestamp of the
// block that includes the action's transaction (what the explorer shows). Idempotent: rows
// that already have a block time are never touched (a database trigger also forbids it).
// Every value is logged with its block height, the app time it replaces in reports, and an
// audit event. Read-only RPC; no keys. Prints no secrets.
// Usage: node --env-file=.env scripts/testnet/backfill-block-times.ts [--dry-run]
import { mkdirSync, writeFileSync } from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import { closeDatabase, getDatabase } from '../../src/server/db/client.ts';
import { auditEvents, payoutActions, runVersions } from '../../src/server/db/schema.ts';
import { setChainBlockTime } from '../../src/server/payouts/actions.ts';
// @ts-expect-error plain .mjs helper without type declarations
import { GAJIAN_ROLES as ROLES, rpc } from './signer-keys.mjs'; // historical (Phase 16b, gajian-payroll.testnet)

const dryRun = process.argv.includes('--dry-run');
const { db, file } = getDatabase();
const rows = db.select({ a: payoutActions, v: runVersions }).from(payoutActions).innerJoin(runVersions, eq(runVersions.id, payoutActions.versionId))
  .where(and(eq(payoutActions.status, 'succeeded'), isNull(payoutActions.chainBlockTime))).all();
console.log(`database ${file}: ${rows.length} confirmed action(s) without a chain block time${dryRun ? ' (dry run)' : ''}`);

interface Entry { actionId: string; chainRunId: string; vault: string; kind: string; row: number | null; tx: string; signer: string; blockHeight: number; blockHash: string; blockTime: string; previousAppTime: string; deltaMs: number }
const log: Entry[] = [];
const now = new Date();
for (const { a, v } of rows) {
  if (!a.txHash) continue;
  const makerRelease = (JSON.parse(v.workflowSnapshot) as { releaseMode: string }).releaseMode === 'maker';
  const signers: string[] = a.kind === 'release' && makerRelease ? [ROLES.maker, ROLES.worker] : [ROLES.worker, ROLES.maker];
  let found: { signer: string; blockHash: string } | null = null;
  for (const signer of signers) {
    try {
      const tx = await rpc('EXPERIMENTAL_tx_status', { tx_hash: a.txHash, sender_account_id: signer, wait_until: 'FINAL' });
      if (tx.transaction.signer_id !== signer) continue;
      found = { signer, blockHash: tx.transaction_outcome.block_hash };
      break;
    } catch { /* try the other signer */ }
  }
  if (!found) { console.log(`SKIP ${a.txHash}: not found on chain (left empty)`); continue; }
  const block = await rpc('block', { block_id: found.blockHash });
  const blockTime = new Date(Number(BigInt(block.header.timestamp_nanosec) / 1_000_000n));
  const entry: Entry = {
    actionId: a.id, chainRunId: v.chainRunId, vault: v.vaultContractId, kind: a.kind, row: a.rowIndex, tx: a.txHash, signer: found.signer,
    blockHeight: block.header.height, blockHash: found.blockHash, blockTime: blockTime.toISOString(), previousAppTime: a.updatedAt.toISOString(), deltaMs: blockTime.getTime() - a.updatedAt.getTime(),
  };
  if (!dryRun) {
    if (setChainBlockTime(db, a.id, blockTime)) {
      db.insert(auditEvents).values({ at: now, actorUserId: null, action: 'payout.block_time_backfilled', entityType: 'run_version', entityId: v.id, detail: JSON.stringify({ tx: a.txHash, kind: a.kind, row: a.rowIndex, blockHeight: entry.blockHeight, blockTime: entry.blockTime, previousAppTime: entry.previousAppTime }) }).run();
    }
  }
  log.push(entry);
  console.log(`${dryRun ? 'WOULD SET' : 'SET'} ${v.chainRunId} ${a.kind}${a.rowIndex === null ? '' : ` ${a.rowIndex}`} ${a.txHash.slice(0, 8)}… block ${entry.blockHeight} ${entry.blockTime} (app time ${entry.previousAppTime}, ${entry.deltaMs >= 0 ? '+' : ''}${entry.deltaMs} ms)`);
}
mkdirSync('.tmp', { recursive: true });
if (!dryRun && log.length) writeFileSync(`.tmp/backfill-block-times-${now.toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(log, null, 2));
console.log(`${dryRun ? 'would set' : 'set'} ${log.length} block time(s)`);
closeDatabase();

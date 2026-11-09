#!/usr/bin/env node
// Phase 16a: points the app database at the final vault (VAULT_CONTRACT_ID in .env).
// Reads the vault's workflow from the chain (read-only), mirrors it as the active workflow
// revision for that vault, and supersedes the previous vault's active revision. Refuses if
// any version on another vault is still live. Idempotent. Prints no secrets.
// Usage: node --env-file=.env scripts/testnet/switch-vault.ts <deploy-tx-hash>
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { closeDatabase, getDatabase } from '../../src/server/db/client.ts';
import { auditEvents, runVersions, users, workflowConfigs } from '../../src/server/db/schema.ts';
// @ts-expect-error plain .mjs helper without type declarations
import { rpc } from './signer-keys.mjs';

const vault = process.env.VAULT_CONTRACT_ID ?? '';
const deployTx = process.argv[2] ?? '';
if (!/^vault2\./.test(vault)) throw new Error(`VAULT_CONTRACT_ID must be the final vault (got "${vault}")`);
if (!/^\w{40,50}$/.test(deployTx)) throw new Error('usage: switch-vault.ts <deploy-tx-hash>');

interface ChainWorkflow { revision: number; kind: 'One' | 'TwoSequential' | 'TwoParallel'; approvers: string[]; release_mode: 'Automatic' | 'Maker'; max_row_amount: string; max_run_total: string }
const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: vault, method_name: 'get_workflow', args_base64: Buffer.from('{}').toString('base64') });
const wf = JSON.parse(Buffer.from(r.result).toString()) as ChainWorkflow;
const KIND = { One: 'one', TwoSequential: 'two_sequential', TwoParallel: 'two_parallel' } as const;
const RELEASE = { Automatic: 'automatic', Maker: 'maker' } as const;

const { db } = getDatabase();
const live = db.select({ id: runVersions.id, status: runVersions.status }).from(runVersions)
  .where(and(ne(runVersions.vaultContractId, vault), inArray(runVersions.status, ['submitting', 'pending_approval', 'approved', 'releasing']))).all();
if (live.length) throw new Error(`refused: ${live.length} version(s) on the previous vault are still live`);

const approverIds = wf.approvers.map((a) => {
  const u = db.select({ id: users.id }).from(users).where(eq(users.chainAccountId, a)).get();
  if (!u) throw new Error(`no app user for approver ${a}`);
  return u.id;
});
const existing = db.select().from(workflowConfigs).where(and(eq(workflowConfigs.vaultContractId, vault), eq(workflowConfigs.revision, wf.revision), eq(workflowConfigs.chainStatus, 'active'))).get();
if (existing) {
  console.log(`already active: ${vault} revision ${wf.revision} (${existing.id})`);
} else {
  const now = new Date();
  const id = `wf_${vault.split('.')[0]}_rev_${wf.revision}_${randomUUID().slice(0, 8)}`;
  db.transaction((tx) => {
    tx.update(workflowConfigs).set({ chainStatus: 'superseded' }).where(eq(workflowConfigs.chainStatus, 'active')).run();
    tx.insert(workflowConfigs).values({
      id, revision: wf.revision, kind: KIND[wf.kind], approver1UserId: approverIds[0]!, approver2UserId: approverIds[1] ?? null,
      releaseMode: RELEASE[wf.release_mode], maxRowAmount: BigInt(wf.max_row_amount), maxRunTotal: BigInt(wf.max_run_total),
      chainStatus: 'active', chainTxHash: deployTx, vaultContractId: vault, createdByUserId: 'usr_admin', createdAt: now, activatedAt: now,
    }).run();
    tx.insert(auditEvents).values({ at: now, actorUserId: null, action: 'workflow.vault_switched', entityType: 'workflow', entityId: String(wf.revision), detail: JSON.stringify({ vault, revision: wf.revision, deployTx }) }).run();
  });
  console.log(`active: ${vault} revision ${wf.revision} (${wf.kind}, ${wf.release_mode}, caps ${wf.max_row_amount}/${wf.max_run_total}) as ${id}`);
}
closeDatabase();

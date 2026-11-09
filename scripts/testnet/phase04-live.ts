#!/usr/bin/env node
// Phase 04 live testnet runs. Signs every vault action with the role's RESTRICTED
// function-call key (sign-with-access-key-file), computes commitments and proofs with
// src/server/commitments.ts (the same code the app will use), and records each step.
// Usage: node scripts/testnet/phase04-live.ts            (writes .tmp/phase04-live.json)
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  buildPayoutTree, newReviewSalt, proofFor, reviewDigest, toHex, type PayoutLeaf, type ReviewRow,
} from '../../src/server/commitments.ts';
import { formatAmount, parseAmount } from '../../src/server/money.ts';
// @ts-expect-error plain .mjs helper without type declarations
import { MASTER, ROLES, LEGACY_VAULT as VAULT, rpc, vaultKey as finalVaultKey } from './signer-keys.mjs';
// Historical Phase 04 script: it always targets the Phase 04 vault (now LEGACY_VAULT).
const vaultKey = (account: string) => finalVaultKey(account, VAULT);

type Role = keyof typeof ROLES;
interface Step { label: string; signer: string; method: string; expect: 'ok' | 'fail'; tx?: string; ok: boolean; result: string }
const steps: Step[] = [];
const keyPaths: Partial<Record<Role, string>> = {};
const nearSh = new URL('./near.sh', import.meta.url).pathname;

async function keyPath(role: Role): Promise<string> {
  keyPaths[role] ??= (await vaultKey(ROLES[role])).path as string;
  return keyPaths[role] as string;
}

async function call(label: string, role: Role, method: string, args: object, expect: 'ok' | 'fail' = 'ok', gas = '50 Tgas'): Promise<Step> {
  const signer = ROLES[role] as string;
  const out = spawnSync(nearSh, [
    'contract', 'call-function', 'as-transaction', VAULT, method, 'json-args', JSON.stringify(args),
    'prepaid-gas', gas, 'attached-deposit', '0 NEAR', 'sign-as', signer,
    'network-config', 'testnet', 'sign-with-access-key-file', await keyPath(role), 'send',
  ], { encoding: 'utf8' });
  const text = (out.stdout + out.stderr).replace(/\x1b\[[0-9;]*m/g, '');
  const tx = /Transaction ID: (\w+)/.exec(text)?.[1];
  const ok = out.status === 0 && !/Error:/.test(text);
  const panic = /Smart contract panicked: ([^"\\)]+)/.exec(text)?.[1];
  const value = /return value[^\n]*\n([\s\S]*?)(?:\n\n|$)/.exec(text)?.[1]?.trim().split('\n')[0];
  const step: Step = { label, signer, method, expect, ok, result: ok ? (value ?? '') : (panic ?? text.slice(-300)) };
  if (tx) step.tx = tx;
  steps.push(step);
  const mark = ok === (expect === 'ok') ? 'as expected' : 'UNEXPECTED';
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} [${mark}] ${tx ?? '(no tx)'} ${step.result}`);
  if (ok !== (expect === 'ok')) throw new Error(`step "${label}" did not behave as expected`);
  return step;
}

async function view(method: string, args: object): Promise<unknown> {
  const r = await rpc('query', {
    request_type: 'call_function', finality: 'final', account_id: VAULT, method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  return JSON.parse(Buffer.from(r.result).toString());
}

function plan(runId: string, rows: [string, string][]) {
  const leaves: PayoutLeaf[] = rows.map(([accountId, amount], index) => {
    const parsed = parseAmount(amount, 1_000_000n);
    if (!parsed.ok) throw new Error(parsed.message);
    return { index, accountId, amount: parsed.value };
  });
  const tree = buildPayoutTree(leaves);
  // Synthetic private review data (never on-chain); the salt stays local.
  const review: ReviewRow[] = leaves.map((l, i) => ({
    accountId: l.accountId, receiverName: `Demo Recipient ${i + 1}`, currency: 'tUSDC', amount: l.amount,
    mobilePhone: `+44770090000${i}`, email: `recipient${i + 1}@example.com`,
  }));
  const digest = reviewDigest(newReviewSalt(), 'detailed', review);
  return {
    runId, leaves, tree,
    createArgs: (revision: number, supersedes: string | null = null) => ({
      run_id: runId, workflow_revision: revision, row_count: tree.rowCount, total: tree.total.toString(),
      payout_root: toHex(tree.root), review_digest: toHex(digest), supersedes,
    }),
    payArgs: (i: number) => ({
      run_id: runId, index: i, receiver_id: leaves[i]?.accountId, amount: leaves[i]?.amount.toString(),
      proof: proofFor(tree, i).map(toHex),
    }),
  };
}

const r = (n: number) => `recipient${n}.${MASTER}`;
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

// ---- Run 1: two approvers in sequence, automatic release by the worker, 3 recipients.
const run1 = plan(`p04-seq-${stamp}`, [[r(1), '0.03'], [r(2), '0.07'], [r(3), '0.05']]);
const id1 = { run_id: run1.runId };
await call('run1 create (2 in sequence, automatic)', 'maker', 'create_run', run1.createArgs(1));
await call('run1 approver2 before approver1', 'approver2', 'approve', id1, 'fail');
await call('run1 approver1 approves', 'approver1', 'approve', id1);
await call('run1 worker release before final approval', 'worker', 'start_release', id1, 'fail');
await call('run1 approver2 approves', 'approver2', 'approve', id1);
await call('run1 maker release in automatic mode', 'maker', 'start_release', id1, 'fail');
await call('run1 worker reserves total', 'worker', 'start_release', id1);
for (let i = 0; i < 3; i++) await call(`run1 worker pays row ${i}`, 'worker', 'pay_row', run1.payArgs(i));
await call('run1 duplicate payout of row 0', 'worker', 'pay_row', run1.payArgs(0), 'fail');

// ---- Run 2: admin switches to two in parallel + maker release; either order; maker releases.
await call('admin: 2 in parallel + maker release (revision 2)', 'admin', 'update_workflow', {
  kind: 'TwoParallel', approvers: [ROLES.approver1, ROLES.approver2], release_mode: 'Maker',
  maker: ROLES.maker, worker: ROLES.worker, max_row_amount: '1000000', max_run_total: '100000000',
});
const run2 = plan(`p04-par-${stamp}`, [[r(2), '0.02'], [r(3), '0.01']]);
const id2 = { run_id: run2.runId };
await call('run2 create at stale revision 1', 'maker', 'create_run', run2.createArgs(1), 'fail');
await call('run2 create (2 in parallel, maker release)', 'maker', 'create_run', run2.createArgs(2));
await call('run2 approver2 approves first', 'approver2', 'approve', id2);
await call('run2 approver1 approves', 'approver1', 'approve', id2);
await call('run2 worker release in maker mode', 'worker', 'start_release', id2, 'fail');
await call('run2 maker releases', 'maker', 'start_release', id2);
const tampered = { ...run2.payArgs(0), amount: '20001' };
await call('run2 tampered amount', 'maker', 'pay_row', tampered, 'fail');
await call('run2 maker pays row 0', 'maker', 'pay_row', run2.payArgs(0));
await call('run2 worker pays row 1', 'worker', 'pay_row', run2.payArgs(1));

// ---- Run 3: rejection blocks release.
const run3 = plan(`p04-rej-${stamp}`, [[r(1), '0.01']]);
const id3 = { run_id: run3.runId };
await call('run3 create', 'maker', 'create_run', run3.createArgs(2));
await call('run3 approver1 rejects', 'approver1', 'reject', id3);
await call('run3 maker release after rejection', 'maker', 'start_release', id3, 'fail');

// ---- Restore the demo default workflow: two in sequence, automatic release (revision 3).
await call('admin: back to 2 in sequence + automatic (revision 3)', 'admin', 'update_workflow', {
  kind: 'TwoSequential', approvers: [ROLES.approver1, ROLES.approver2], release_mode: 'Automatic',
  maker: ROLES.maker, worker: ROLES.worker, max_row_amount: '1000000', max_run_total: '100000000',
});

const evidence = {
  network: 'testnet', vault: VAULT, finishedAt: new Date().toISOString(),
  runs: await Promise.all([run1, run2, run3].map(async (p) => ({
    runId: p.runId, total: formatAmount(p.tree.total), rows: p.leaves.map((l) => ({ account: l.accountId, amount: formatAmount(l.amount) })),
    state: await view('get_run', { run_id: p.runId }),
  }))),
  balances: await view('get_balances', {}),
  steps,
};
mkdirSync(new URL('../../.tmp/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../.tmp/phase04-live.json', import.meta.url), JSON.stringify(evidence, null, 2));
console.log(`\nbalances ${JSON.stringify(evidence.balances)}`);
for (const run of evidence.runs) console.log(`${run.runId}: ${(run.state as { status: string }).status}`);
console.log('evidence written to .tmp/phase04-live.json');

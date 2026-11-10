#!/usr/bin/env node
// Exports the real testnet runs of the SentFund deployment (Phase 22) into db/seed/testnet-history.json for
// the demo seed. EVERY value (signer, method, arguments, success, block time, transferred
// amounts and receivers) is read from NEAR testnet RPC; nothing is typed in by hand except
// the list of public transaction hashes (from docs/TESTNET.md). Payout roots are recomputed
// from the paid rows and must equal the root stored on-chain at create_run.
//   node scripts/testnet/export-history.mjs           write the JSON
//   node scripts/testnet/export-history.mjs --check   re-read the chain and compare with the JSON
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const RPC = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.fastnear.com';
if (!RPC.includes('testnet')) throw new Error('testnet RPC only');
const OUT = new URL('../../db/seed/testnet-history.json', import.meta.url);
const M = 'sentfund-payroll.testnet';

// Public transaction hashes, in order, per run (docs/TESTNET.md, Phase 22). The SentFund deployment's
// own history: the Phase 04 policy scenarios run on vault.sentfund-payroll.testnet by
// scripts/testnet/phase22-live.ts. (The earlier gajian-payroll.testnet runs stay in
// docs/evidence/testnet-runs.json and are re-checked by npm run judge:verify.)
const RUNS = [
  {
    runId: 'p22-seq-202611100718', vault: `vault.${M}`, vaultGeneration: 'sentfund (Phase 22)',
    title: 'Two approvers in sequence, automatic release', kind: 'two_sequential', releaseMode: 'automatic', approvers: [`approver1.${M}`, `approver2.${M}`],
    txs: ['2MdYti3zCUfRvwPPZ2n2TNSesmB5odATbSZ8XYTutLqD', 'A2neNKRW7tnSRUofR4bmx72BkFZ7Hvc4Arc73KMEAUcN', '9dH6hHfo3PFaJYaBjZMx9ZyrbNrtFGhPVsDFniGNrpZc', '5w5bYf2bGZvgub5RkpMM7TemsEx8HRH9s5J9DWXuTN7K', '9z7wQ6WWyYy4vtmfSi6yvhU5r23ALvRbesgbUNhcLNFK', 'FyY6qrbad9ZKTv5McmbNCHiF9m1wHvPSAzJFVLGps3nd', 'HwrDLPNq6myNu6iqE5ErP7z8CuDV4rX8Wvqg7ApFaYuk', 'UEJ1PEDzaYxXxWQWez4LAassLT93Beje7jzDbS9S8fP', 'CbQSNZo8YkXVSVtfiQ8x5NNcK46s2PLc2NFtveg7KRM4', 'DMrHt1TcQAZjkKbuNh4RwX66wA25d7cmD5Nxa84Mf4Mc', 'BYpZkcQe7td5FnYHk1sqEm3M39oPQ9QjqBqWVhixX8Gv'],
  },
  {
    runId: 'p22-par-202611100718', vault: `vault.${M}`, vaultGeneration: 'sentfund (Phase 22)',
    title: 'Two approvers in parallel, maker release', kind: 'two_parallel', releaseMode: 'maker', approvers: [`approver1.${M}`, `approver2.${M}`],
    txs: ['3nkcd5kKpUB4M6vTtXFVfwX5bAuu9EHzrKud1uQ8qRcM', '7qrHVTvtHfi46MWBS8MZ4nYdQkyBrYaKo6x4pFvWYRKY', 'G94g4x3AKPKFVLCrL4rTnmgfciSjMW8x3j4TpizxpQmS', 'Cooy8qEoNipQZhY5HM3DTJnEnWxFmrr1HjNYUxFFxTYg', 'ZnpShgXjikEr5qzNRmBua9EEyPN4A4tMGfznFZQFdhL', 'GNMH8SJteSD6F836PvcAqobCatVXLBc1hxpdVeZze8sZ', 'huhHZnhiXea9pK9WF9rgmHZzmbMXReRiztMdM3XNptU', 'F3DdLKT6deizv9Aq3dYbSBRSodAoyiyYscEZfcnmKgF8'],
  },
  {
    runId: 'p22-rej-202611100718', vault: `vault.${M}`, vaultGeneration: 'sentfund (Phase 22)',
    title: 'Rejected by approver 1', kind: 'two_parallel', releaseMode: 'maker', approvers: [`approver1.${M}`, `approver2.${M}`],
    // The rejected run never paid, so its single row is not in any transaction. It is
    // declared here and accepted only if its leaf hash reproduces the on-chain payout_root.
    declaredRows: [{ index: 0, receiver: `recipient1.${M}`, amount: '10000' }],
    txs: ['44y8FYv4273e23GLuuZhmGfUZvJ9T6mHUnp93ghqEitZ', '6dQVxBRUXWqXtRg3nSA9xgQNnsuF9To2Kume9xCHvKdz', '2xdpe83TvAA2uqpTUb5Xksbw4kGfAiTbr49jZMz8Mnqv'],
  },
];

async function rpc(method, params) {
  await new Promise((r) => setTimeout(r, 150)); // be gentle with the public RPC
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'g', method, params }) });
      const body = await res.json();
      if (body.error) throw new Error(JSON.stringify(body.error).slice(0, 300));
      return body.result;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const sha = (...parts) => createHash('sha256').update(Buffer.concat(parts)).digest();
function leaf(index, account, amount) {
  const a = Buffer.from(account, 'ascii');
  const idx = Buffer.alloc(4); idx.writeUInt32BE(index);
  const amt = Buffer.alloc(16); const v = BigInt(amount); amt.writeBigUInt64BE(v >> 64n, 0); amt.writeBigUInt64BE(v & ((1n << 64n) - 1n), 8);
  return sha(Buffer.from('GAJIAN:payout-leaf:v1\0', 'ascii'), idx, Buffer.from([a.length]), a, amt);
}
function root(leaves) {
  let level = leaves;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(level[i + 1] ? sha(Buffer.from('GAJIAN:payout-node:v1\0', 'ascii'), level[i], level[i + 1]) : level[i]);
    level = next;
  }
  return level[0].toString('hex');
}

async function describe(hash, signerGuess) {
  const r = await rpc('EXPERIMENTAL_tx_status', { tx_hash: hash, sender_account_id: signerGuess, wait_until: 'FINAL' });
  const action = r.transaction.actions[0].FunctionCall;
  const args = JSON.parse(Buffer.from(action.args, 'base64').toString('utf8'));
  const block = await rpc('block', { block_id: r.transaction_outcome.block_hash });
  const failure = r.receipts_outcome.map((o) => o.outcome.status.Failure).find(Boolean);
  const success = 'SuccessValue' in r.status;
  const transfers = r.receipts_outcome.flatMap((o) => o.outcome.logs)
    .filter((l) => l.startsWith('EVENT_JSON:') && l.includes('"nep141"') && l.includes('"ft_transfer"'))
    .flatMap((l) => JSON.parse(l.slice('EVENT_JSON:'.length)).data);
  let returned = null;
  if (success && r.status.SuccessValue) returned = JSON.parse(Buffer.from(r.status.SuccessValue, 'base64').toString('utf8'));
  const panic = failure ? (JSON.stringify(failure).match(/Smart contract panicked: ([^"\\]+)/)?.[1] ?? JSON.stringify(failure).slice(0, 160)) : null;
  return {
    txHash: hash, signer: r.transaction.signer_id, method: action.method_name, args,
    at: new Date(Math.floor(Number(block.header.timestamp) / 1e6)).toISOString(),
    success: success && !failure, error: panic, returned, transfers,
  };
}

// The signer is needed by the RPC; try the role accounts until the tx is found.
async function find(hash) {
  for (const s of ['maker', 'approver1', 'approver2', 'worker', 'admin']) {
    try { return await describe(hash, `${s}.${M}`); } catch (e) { if (!String(e).includes('UNKNOWN_TRANSACTION') && !String(e).includes('does not exist')) throw e; }
  }
  throw new Error(`transaction ${hash} not found on testnet`);
}

async function exportRun(def) {
  const events = [];
  for (const h of def.txs) events.push(await find(h));
  const create = events[0];
  if (create.method !== 'create_run' || !create.success) throw new Error(`${def.runId}: first tx is not a successful create_run`);
  if (create.args.run_id !== def.runId) throw new Error(`${def.runId}: create_run run_id mismatch`);
  const payEvents = events.filter((e) => e.method === 'pay_row' && e.success && e.returned === true);
  let rows;
  if (create.args.payouts) {
    rows = create.args.payouts.map((p, index) => ({ index, receiver: p.receiver_id, amount: p.amount }));
  } else if (def.declaredRows) {
    rows = def.declaredRows;
  } else {
    rows = payEvents.map((e) => ({ index: e.args.index, receiver: e.args.receiver_id, amount: e.args.amount })).sort((a, b) => a.index - b.index);
  }
  for (const row of rows) {
    const pay = payEvents.find((e) => e.args.index === row.index);
    if (pay) {
      const t = pay.transfers.find((x) => x.memo === `gajian:${def.runId}:${row.index}`);
      if (!t || t.new_owner_id !== row.receiver || t.amount !== row.amount) throw new Error(`${def.runId} row ${row.index}: ft_transfer event does not match`);
      row.paidTxHash = pay.txHash; row.paidAt = pay.at;
    }
  }
  const total = rows.reduce((s, r) => s + BigInt(r.amount), 0n).toString();
  let payoutRoot = null;
  if (create.args.payout_root) {
    payoutRoot = create.args.payout_root;
    const recomputed = root(rows.map((r) => leaf(r.index, r.receiver, r.amount)));
    if (recomputed !== payoutRoot) throw new Error(`${def.runId}: recomputed root ${recomputed} != on-chain ${payoutRoot}`);
    if (create.args.total !== total || create.args.row_count !== rows.length) throw new Error(`${def.runId}: total/row_count mismatch`);
  }
  const rejected = events.find((e) => e.method === 'reject' && e.success);
  const allPaid = rows.every((r) => r.paidTxHash);
  return {
    runId: def.runId, vault: def.vault, vaultGeneration: def.vaultGeneration, title: def.title,
    // payroll = a payroll run; operations = a treasury movement through the vault (not payroll)
    category: def.category ?? 'payroll',
    kind: def.kind, releaseMode: def.releaseMode, approvers: def.approvers,
    status: rejected ? 'rejected' : allPaid ? 'paid' : 'incomplete',
    rejectionReason: null, // reasons are recorded off-chain by the app; these runs predate it
    maker: create.signer, total, rowCount: rows.length, payoutRoot, reviewDigest: create.args.review_digest ?? null,
    createdAt: create.at, rows,
    events: events.map(({ args, transfers, returned, ...e }) => ({ ...e, args: { index: args.index ?? null }, paidReturned: e.method === 'pay_row' ? returned : undefined })),
  };
}

const runs = [];
for (const def of RUNS) {
  runs.push(await exportRun(def));
  process.stdout.write(`${def.runId}: ${runs.at(-1).status}, ${runs.at(-1).rowCount} rows, ${runs.at(-1).events.length} txs\n`);
}
const doc = { network: 'testnet', exportedFrom: RPC, note: 'Read from NEAR testnet by scripts/testnet/export-history.mjs. Do not edit by hand.', runs };
const json = `${JSON.stringify(doc, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const stored = JSON.parse(readFileSync(OUT, 'utf8'));
  const same = JSON.stringify(stored.runs) === JSON.stringify(runs);
  console.log(same ? 'check: db/seed/testnet-history.json matches the chain' : 'check: MISMATCH between JSON and chain');
  process.exitCode = same ? 0 : 1;
} else {
  mkdirSync(new URL('../../db/seed/', import.meta.url), { recursive: true });
  writeFileSync(OUT, json);
  console.log('wrote db/seed/testnet-history.json');
}

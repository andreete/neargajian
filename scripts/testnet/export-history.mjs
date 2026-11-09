#!/usr/bin/env node
// Exports the real Phase 02 / Phase 04 testnet runs into db/seed/testnet-history.json for
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
const M = 'gajian-payroll.testnet';

// Public transaction hashes, in order, per run (docs/TESTNET.md).
const RUNS = [
  {
    runId: 'p02-run-1', vault: `vault.${M}`, vaultGeneration: 'phase-02 (deleted in Phase 04)',
    title: 'First contract-controlled payout', kind: 'one', releaseMode: 'automatic', approvers: [`approver1.${M}`],
    txs: ['9nPkiwHz86SU6E6b9Yr4PWMHq3QSdmnhWFETE3gsV3WV', 'BtkgTjy5sKh2rg7uNnU5XrRKp97ZcovQmH9v63pzaymL', 'CaPgWr2khsPp4oJqXTsYxYwyJj36UTy8N1WNX8MzontM',
      'EYSLrascnRZ4gUT8ikYm2k9WmCWVDKHd47EYkWk11snb', '7DwmqekZtpB7u2L3JU4wEv9DoXKTdYhaQKaDXWnt5xwL', '6Hg4aX2qC3cHWQwNZPVa7oBeZG9HqzMH3EVB8VtAMeXq'],
  },
  {
    runId: 'p02-drain', vault: `vault.${M}`, vaultGeneration: 'phase-02 (deleted in Phase 04)',
    title: 'Vault retirement: funds returned to the admin', kind: 'one', releaseMode: 'automatic', approvers: [`approver1.${M}`],
    txs: ['BZNkzBYvvzKE3fiCeoq4rqWbAi9LBVWofuZwzZgnL1uM', '71wbYGD2wXdhQFcxD1w3ywAiN8TJ8ZsacRqYWikUSovG', 'cVv7s38hiQ33ErYTukK83QR3u7vsYrnrLq49nXtA2Mi',
      'Fet8zYwNr1DC9DDiwycHrANWd2CMwRYmitxkazVJ7zCL', '58sZkJPpUviztiSGx83wugtw9bx89pP5HMpR5ChetxWR', 'J4xBVnczPdX9N4VTqdCw3gUZKTXRWvQ9mcLcBhqkq6iH',
      '9ZRizR2yyCxM8GdoCsghwcpBMRgSYHK9d1LkunpsbUEC', 'G2GzToeS7dsQMgfEKtrsccPptwxSQ2aBJxfGWvahcFTw', '2nBWGQWfTvzmDUmvGJ7FywATPoxHCDgL6Jw2qSqyxUVD',
      'FHqgiUZPtgtn5shuxf6favvYMMPnNnynLWmVjTGssDDZ', 'AQKMPmbzz39Na7GvbDS6zVPeRvRFCBn6fjZoaxg24ZS4', '3hhUC3v8b113rJPSZZtQfS9TAFk7Bc9XGFERRRBcwF1V',
      'EaqSFT61e1vXPatfps9cDz38yhcarRqqdfieteHcHrGn'],
  },
  {
    runId: 'p04-seq-202611091047', vault: `vault.${M}`, vaultGeneration: 'phase-04',
    title: 'Two approvers in sequence, automatic release', kind: 'two_sequential', releaseMode: 'automatic', approvers: [`approver1.${M}`, `approver2.${M}`],
    txs: ['GzCjK9KhBSehhiQ6t2uKjfcpenWc3r5S632P9h2eu7tF', 'GJcGj4WPT4GhtNDowQ8N5QfrE34yHK1EiJBabPVgfNrp', '5JjWMB3D7SxqFozzQ38psj88YpygnQcDkbpAzoyzJMES',
      'CZsAPrnuYM8n6VN6PhzAmtXfSPAWsJVau79Qsgnn7hpv', '3idDNziFG1Y2tWcjUba5uYfD9SNP5ohsabNGkVTN8xty', '5EbiJBsWgSgrYQ3jtoGzAwFngZDhEkbgtQJbN9jYRoEy',
      'CW1asRBq6tJB89tJzoLFiikKMvP5H1nUe8ovxarJJc34', '3JxCtfXomzLrGvSwsFT3AVXB9HnzxLWgEBzAGRkCMKPF', 'GDd9YWkE44AJLptJQ98EdJ7Kmz5fnBio4wwKtQmm9Ff',
      '9DKhPivdPHpMPi82UhA5C3ri9Zr2SygdEiCptHM1euZR', '9rXgzDWGdaFv99rEgw9vdR7cBq3vp4NwRQc6Eck6JKhq'],
  },
  {
    runId: 'p04-par-202611091047', vault: `vault.${M}`, vaultGeneration: 'phase-04',
    title: 'Two approvers in parallel, maker release', kind: 'two_parallel', releaseMode: 'maker', approvers: [`approver1.${M}`, `approver2.${M}`],
    txs: ['HcuQ6rrGrdH5sbhG38CTNm8QL4JwxVDzmP9qqyLVfkxg', '2aRhtrQWy8QcTgLLFtCU3FQkwiu3khPax3Qs34CFQ8Ym', 'EFkkJudvRe9FWy7Y2ihGx1CTGhrwXCmnskhKstRisMwt',
      'G9sgA8X9JJ7wGJZFoqLn6wa36F4Goga2jxhmNRajE8XA', '4av69XHLUMRKrWeXWYF3x8vKGbPMv5wnXgov7RbGZCoe', '7TUUMNJTvUTGTzngZUDqKATiN69PKQCFNdbEph5DU1Tn',
      '8bZ6chcLc6RRAQKpo6ZPyDxSYnLqwph8AiSjhzt2fAVY', 'EnfLJSx231Yo2r42pHRtXPLGBp8H3LF6A4tidP79xuGF'],
  },
  {
    runId: 'p04-rej-202611091047', vault: `vault.${M}`, vaultGeneration: 'phase-04',
    title: 'Rejected by approver 1', kind: 'two_parallel', releaseMode: 'maker', approvers: [`approver1.${M}`, `approver2.${M}`],
    // The rejected run never paid, so its single row is not in any transaction. It is
    // declared here and accepted only if its leaf hash reproduces the on-chain payout_root.
    declaredRows: [{ index: 0, receiver: `recipient1.${M}`, amount: '10000' }],
    txs: ['C32vGB2kaT5QWsvCYq9vLDPQdv3x4bQcZSXdPf1Eg6hQ', '3uW7d5P6WzxYLnv7HQHDEvY5N1a8yAYa7XabKN8M3n7g', 'FB58uo5UpWCLiGaypv2Eurr3hkRFXAehsqTTRPyb1Fen'],
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

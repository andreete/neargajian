#!/usr/bin/env node
// Judge mode: verifies the public testnet evidence in docs/evidence/testnet-runs.json with
// READ-ONLY RPC calls (no keys, no transactions): each vault run's status, total and rows
// (receiver + amount) from the contract's own views, each transaction's final outcome and
// signer, and the ft_transfer event of every payout. Prints PASS/FAIL per check.
//   node scripts/judge/verify-testnet.mjs        (or: npm run judge:verify)
import { readFileSync } from 'node:fs';

const RPC = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.fastnear.com';
if (!/testnet/.test(RPC)) throw new Error('testnet RPC only');
const ev = JSON.parse(readFileSync(new URL('../../docs/evidence/testnet-runs.json', import.meta.url), 'utf8'));
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures += 1; };

async function rpc(method, params) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'judge', method, params }) });
    const body = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    if (!body.error) return body.result;
    if (attempt >= 3) throw new Error(JSON.stringify(body.error));
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}
async function view(contract, method, args) {
  const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  return JSON.parse(Buffer.from(r.result).toString('utf8'));
}
const tusdc = (base) => `${BigInt(base) / 1_000_000n}.${(BigInt(base) % 1_000_000n).toString().padStart(6, '0')}`;

for (const run of ev.runs) {
  console.log(`\n== Phase ${run.phase}: ${run.label}\n   vault ${run.vault} · run ${run.runId}`);
  const r = await view(run.vault, 'get_run', { run_id: run.runId });
  check(r?.status === run.status, `run status ${r?.status} (expected ${run.status})`);
  check(r?.total === run.total, `run total ${tusdc(r?.total ?? 0)} tUSDC (expected ${tusdc(run.total)})`);
  check(r?.row_count === run.rows.length && r?.paid_count === (run.status === 'Paid' ? run.rows.length : r?.paid_count), `rows ${r?.row_count}, paid ${r?.paid_count}`);
  for (const row of run.rows) {
    const onChain = await view(run.vault, 'get_row', { run_id: run.runId, index: row.index });
    check(onChain?.status === 'Paid' && onChain.receiver_id === row.receiver && onChain.amount === row.amount,
      `row ${row.index}: ${onChain?.status} ${tusdc(onChain?.amount ?? 0)} tUSDC → ${onChain?.receiver_id}`);
  }
  for (const tx of run.txs) {
    const out = await rpc('EXPERIMENTAL_tx_status', { tx_hash: tx.hash, sender_account_id: tx.signer, wait_until: 'FINAL' });
    const failed = JSON.stringify(out.status).includes('Failure') || out.receipts_outcome.some((o) => 'Failure' in (o.outcome.status ?? {}));
    if (tx.step.startsWith('pay_row')) {
      const idx = Number(tx.step.split(' ')[1]);
      const want = run.rows.find((x) => x.index === idx);
      const events = out.receipts_outcome.flatMap((o) => o.outcome.logs).filter((l) => l.startsWith('EVENT_JSON:')).map((l) => JSON.parse(l.slice(11)));
      const transfer = events.find((e) => e.event === 'ft_transfer')?.data?.[0];
      const ok = transfer && transfer.new_owner_id === want.receiver && transfer.amount === want.amount;
      check(Boolean(ok), `${tx.step}: ft_transfer event ${transfer ? `${tusdc(transfer.amount)} tUSDC → ${transfer.new_owner_id}` : 'missing'}`);
    }
    check(!failed && out.transaction.signer_id === tx.signer && out.transaction.receiver_id === run.vault, `${tx.step} ${tx.hash.slice(0, 8)}… final, signed by ${out.transaction.signer_id}`);
  }
}
for (const f of ev.expectedFailures ?? []) {
  const out = await rpc('EXPERIMENTAL_tx_status', { tx_hash: f.hash, sender_account_id: f.signer, wait_until: 'FINAL' });
  const text = JSON.stringify(out.status) + JSON.stringify(out.receipts_outcome.map((o) => o.outcome.status));
  check(text.includes(f.error), `${f.step} ${f.hash.slice(0, 8)}… refused on-chain: "${f.error}"`);
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll testnet evidence checks passed.');
process.exitCode = failures ? 1 : 0;

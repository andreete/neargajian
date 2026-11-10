#!/usr/bin/env node
// Shows the receipt chain of a testnet transaction: receiver, method, status and logs.
// Read-only RPC. Usage: node scripts/testnet/tx-receipts.mjs <tx-hash> <signer-account>
const RPC = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.fastnear.com';
if (!RPC.includes('testnet')) throw new Error('testnet RPC only');
const [hash, signer] = process.argv.slice(2);
const res = await fetch(RPC, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 'sentfund', method: 'EXPERIMENTAL_tx_status',
    params: { tx_hash: hash, sender_account_id: signer, wait_until: 'FINAL' } }),
});
const { result, error } = await res.json();
if (error) throw new Error(JSON.stringify(error));
const methods = new Map(result.receipts.map((r) => [r.receipt_id,
  r.receipt.Action?.actions?.map((a) => a.FunctionCall?.method_name ?? Object.keys(a)[0]).join(',') ?? 'data']));
console.log(`tx ${hash} final status: ${Object.keys(result.status)[0]}`);
for (const o of result.receipts_outcome) {
  const status = Object.keys(o.outcome.status)[0];
  const detail = status === 'Failure' ? ` ${JSON.stringify(o.outcome.status.Failure).slice(0, 160)}` : '';
  console.log(`  ${o.outcome.executor_id} ${methods.get(o.id) ?? '(refund)'} -> ${status}${detail} gas ${(o.outcome.gas_burnt / 1e12).toFixed(2)} Tgas`);
  for (const l of o.outcome.logs) console.log(`      log: ${l}`);
}

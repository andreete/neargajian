#!/usr/bin/env node
// Judge mode: verifies the deployed vault's code and locks with READ-ONLY RPC calls.
//   1. the on-chain code_hash equals base58(sha256(<local Wasm>)) built from the release commit
//   2. the vault account has NO full-access key (nobody can redeploy or change its code)
//   3. lists every remaining key (expected: none) and the vault's workflow and balances
// Usage: node scripts/judge/verify-deployment.mjs [path/to/gajian_vault.wasm] [vault-account]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const RPC = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.fastnear.com';
if (!/testnet/.test(RPC)) throw new Error('testnet RPC only');
const wasmPath = process.argv[2] ?? 'contracts/target/near/gajian_vault/gajian_vault.wasm';
const vault = process.argv[3] ?? JSON.parse(readFileSync(new URL('../../docs/evidence/testnet-runs.json', import.meta.url), 'utf8')).finalVault?.account ?? 'vault2.gajian-payroll.testnet';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let out = '';
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = `1${out}`; }
  return out;
}
async function rpc(method, params) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'judge', method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures += 1; };

const wasm = readFileSync(wasmPath);
const digest = createHash('sha256').update(wasm).digest();
const local = base58(digest);
console.log(`local Wasm   ${wasmPath} (${wasm.length} bytes)\n  sha256 hex  ${digest.toString('hex')}\n  base58      ${local}`);
const account = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: vault });
console.log(`on-chain     ${vault}\n  code_hash   ${account.code_hash}`);
check(account.code_hash === local, 'deployed code_hash equals the locally built Wasm');
const { keys } = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: vault });
check(!keys.some((k) => k.access_key.permission === 'FullAccess'), `no full-access key on ${vault} (${keys.length} keys in total)`);
for (const k of keys) console.log(`  key ${k.public_key} ${JSON.stringify(k.access_key.permission)}`);
const view = async (method) => JSON.parse(Buffer.from((await rpc('query', { request_type: 'call_function', finality: 'final', account_id: vault, method_name: method, args_base64: Buffer.from('{}').toString('base64') })).result).toString());
const wf = await view('get_workflow');
const bal = await view('get_balances');
console.log(`  workflow    revision ${wf.revision}, ${wf.kind}, ${wf.release_mode}, approvers ${wf.approvers.join(' → ')}`);
console.log(`  balances    total ${bal.total}, reserved ${bal.reserved}, available ${bal.available} (tUSDC base units)`);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nDeployment verified: the code is the release build and can no longer change.');
process.exitCode = failures ? 1 : 0;

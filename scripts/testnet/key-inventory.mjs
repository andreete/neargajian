#!/usr/bin/env node
// READ-ONLY key inventory (QA-A7-06, docs/KEY-INVENTORY.md). For every testnet account we control it
// lists each access key from the chain (view_access_key_list), its permission (full access, or the
// contract + methods + allowance of a function-call key) and where its private key is kept:
//   - "this server (keychain)" when ~/.near-credentials/testnet/<account>/<public key>.json exists
//     (existence check only: the file is never opened);
//   - "Railway + .hosting" when the public key is one of the hosted demo's keys
//     (.hosting/host-keys.public.json, public data only).
// It never reads .env or any private key, sends no transaction and prints public data only.
// Usage: node scripts/testnet/key-inventory.mjs [--json]
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { rpc } from './signer-keys.mjs';

const SETS = [
  { name: 'SentFund (live since Phase 22)', master: 'sentfund-payroll.testnet', vaults: ['vault'] },
  { name: 'gajian (earlier deployment, retired)', master: 'gajian-payroll.testnet', vaults: ['vault2', 'vault'] },
];
const SUBS = ['tusdc', 'admin', 'maker', 'approver1', 'approver2', 'worker', 'recipient1', 'recipient2', 'recipient3'];

const hostedFile = new URL('../../.hosting/host-keys.public.json', import.meta.url).pathname;
const hosted = existsSync(hostedFile)
  ? new Set(Object.values(JSON.parse(readFileSync(hostedFile, 'utf8')).keys).map((k) => k.publicKey))
  : new Set();

const view = async (account_id, method_name) => {
  const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id, method_name, args_base64: '' });
  return JSON.parse(Buffer.from(r.result).toString());
};
const nearOf = (yocto) => (Number(BigInt(yocto) / 10n ** 19n) / 1e5).toFixed(5);

const rows = [];
for (const set of SETS) {
  const accounts = [set.master, ...set.vaults.map((v) => `${v}.${set.master}`), ...SUBS.map((s) => `${s}.${set.master}`)];
  for (const account of accounts) {
    let info;
    try {
      info = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: account });
    } catch (e) {
      rows.push({ set: set.name, account, exists: false, error: String(e.message).slice(0, 80) });
      continue;
    }
    const { keys } = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: account });
    const hasCode = info.code_hash !== '11111111111111111111111111111111';
    if (keys.length === 0) rows.push({ set: set.name, account, near: nearOf(info.amount), code: hasCode, key: null });
    for (const k of keys) {
      const fc = k.access_key.permission?.FunctionCall;
      const local = existsSync(join(homedir(), '.near-credentials', 'testnet', account, `${k.public_key.replace(':', '_')}.json`));
      const where = [local ? 'this server (keychain)' : null, hosted.has(k.public_key) ? 'Railway + .hosting' : null].filter(Boolean).join(' + ') || 'not on this server';
      rows.push({
        set: set.name,
        account,
        near: nearOf(info.amount),
        code: hasCode,
        key: k.public_key,
        access: fc ? 'function-call' : 'FULL ACCESS',
        contract: fc?.receiver_id ?? '',
        methods: fc ? (fc.method_names.length ? fc.method_names.join(', ') : '(any method, no deposit)') : 'all',
        allowance: fc ? (fc.allowance ? `${nearOf(fc.allowance)} NEAR` : 'unlimited') : '',
        where,
      });
    }
  }
}

const vaults = {};
for (const v of ['vault.sentfund-payroll.testnet', 'vault2.gajian-payroll.testnet', 'vault.gajian-payroll.testnet']) {
  try {
    const wf = await view(v, 'get_workflow');
    const bal = await view(v, 'get_balances');
    vaults[v] = { workflow: wf, balances: bal };
  } catch (e) {
    vaults[v] = { error: String(e.message).slice(0, 120) };
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ at: new Date().toISOString(), rows, vaults }, null, 2));
} else {
  console.log(`Key inventory, read from testnet at ${new Date().toISOString()} (finality final)\n`);
  console.log('| Account | NEAR | Code | Public key | Access | Contract | Methods | Allowance | Private key held |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    if (r.exists === false) console.log(`| \`${r.account}\` | (does not exist) | | | | | | | |`);
    else if (!r.key) console.log(`| \`${r.account}\` | ${r.near} | ${r.code ? 'yes' : 'no'} | **no key** | | | | | nowhere |`);
    else console.log(`| \`${r.account}\` | ${r.near} | ${r.code ? 'yes' : 'no'} | \`${r.key}\` | ${r.access} | ${r.contract ? `\`${r.contract}\`` : ''} | ${r.methods} | ${r.allowance} | ${r.where} |`);
  }
  console.log('\nVault workflows and balances (base units, 6 decimals):');
  for (const [v, d] of Object.entries(vaults)) {
    if (d.error) { console.log(`- ${v}: ${d.error}`); continue; }
    const w = d.workflow;
    console.log(`- ${v}: revision ${w.revision}, ${w.kind}, release ${w.release_mode}, maker ${w.maker}, approvers ${w.approvers.join(' + ')}, worker ${w.worker}, max_row ${w.max_row_amount}, max_run ${w.max_run_total}; balance total ${d.balances.total}, reserved ${d.balances.reserved}, available ${d.balances.available}`);
  }
}

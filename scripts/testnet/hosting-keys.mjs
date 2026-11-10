#!/usr/bin/env node
// Helper for scripts/testnet/hosting-keys.sh (the hosted demo's OWN restricted keys).
//   gen      create one new ed25519 keypair per hosted role. Private keys go ONLY to the
//            git-ignored .hosting/host-keys.env (mode 600) for pasting into Railway; public keys to
//            .hosting/host-keys.public.json. Refuses if the files exist. Prints public keys only.
//   plan     print, one line per role, "account<TAB>allowance<TAB>methods<TAB>publicKey" (public data)
//   status   read-only: every vault2 function-call key of the hosted roles, marked local / host / other
// Never the admin, master or any full-access key: the hosted roles are maker, approver1,
// approver2 and worker, each limited to its vault2 methods and a small NEAR allowance.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { KeyPair } from 'near-api-js';
import { ROLES, VAULT, rpc } from './signer-keys.mjs';

const DIR = new URL('../../.hosting/', import.meta.url).pathname;
const PRIVATE = join(DIR, 'host-keys.env');
const PUBLIC = join(DIR, 'host-keys.public.json');

/** Least privilege for the public demo (automatic release: only the worker releases and pays). */
export const HOSTED = {
  maker: { env: 'MAKER_SIGNER_PRIVATE_KEY', allowance: '0.1 NEAR', methods: ['create_run', 'cancel_run'] },
  approver1: { env: 'APPROVER1_SIGNER_PRIVATE_KEY', allowance: '0.05 NEAR', methods: ['approve', 'reject'] },
  approver2: { env: 'APPROVER2_SIGNER_PRIVATE_KEY', allowance: '0.05 NEAR', methods: ['approve', 'reject'] },
  worker: { env: 'WORKER_SIGNER_PRIVATE_KEY', allowance: '0.25 NEAR', methods: ['start_release', 'pay_row'] },
};

const [cmd] = process.argv.slice(2);
if (!VAULT.endsWith('.testnet')) throw new Error('testnet only');

if (cmd === 'gen') {
  if (existsSync(PRIVATE) || existsSync(PUBLIC)) throw new Error(`refused: ${DIR} already holds host keys. Delete them on-chain first (hosting-keys.sh delete --yes).`);
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const lines = ['# SentFund hosted demo signer keys (vault2, function-call only). Paste each value into Railway', '# Variables. Never commit, print or share. Delete on-chain after the event: hosting-keys.sh delete --yes'];
  const pub = {};
  for (const [role, h] of Object.entries(HOSTED)) {
    const kp = KeyPair.fromRandom('ed25519');
    lines.push(`${h.env}=${kp.toString()}`);
    pub[role] = { account: ROLES[role], publicKey: kp.getPublicKey().toString(), allowance: h.allowance, methods: h.methods, vault: VAULT };
  }
  writeFileSync(PRIVATE, `${lines.join('\n')}\n`, { mode: 0o600 });
  chmodSync(PRIVATE, 0o600);
  writeFileSync(PUBLIC, `${JSON.stringify({ createdAt: new Date().toISOString(), keys: pub }, null, 2)}\n`);
  for (const [role, k] of Object.entries(pub)) console.log(`${role}: ${k.account} ${k.publicKey} (${k.methods.join(', ')}; allowance ${k.allowance})`);
  console.log(`private keys written to ${PRIVATE} (mode 600, git-ignored); not printed`);
} else if (cmd === 'plan') {
  const { keys } = JSON.parse(readFileSync(PUBLIC, 'utf8'));
  for (const k of Object.values(keys)) console.log([k.account, k.allowance, k.methods.join(', '), k.publicKey].join('\t'));
} else if (cmd === 'status') {
  const host = existsSync(PUBLIC) ? new Set(Object.values(JSON.parse(readFileSync(PUBLIC, 'utf8')).keys).map((k) => k.publicKey)) : new Set();
  for (const role of Object.keys(HOSTED)) {
    const account = ROLES[role];
    const { keys } = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: account });
    const fc = keys.filter((k) => k.access_key.permission?.FunctionCall?.receiver_id === VAULT);
    for (const k of fc) {
      const local = existsSync(join(homedir(), '.near-credentials', 'testnet', account, `${k.public_key.replace(':', '_')}.json`));
      const tag = local ? 'local (this server)' : host.has(k.public_key) ? 'HOST (public demo)' : 'other';
      console.log(`${account}\t${k.public_key}\t${tag}\t${k.access_key.permission.FunctionCall.method_names.join(', ')}`);
    }
  }
} else {
  console.error('usage: hosting-keys.mjs gen | plan | status');
  process.exitCode = 2;
}

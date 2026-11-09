#!/usr/bin/env node
// Writes the git-ignored .env (mode 600) from .env.example, filling in the public testnet
// IDs and the restricted function-call signer keys. Prints only variable NAMES and public
// keys, never secrets. Keeps an existing SESSION_SECRET; generates one if missing.
// Never drops a line it does not manage: every other existing value (for example
// ANTHROPIC_API_KEY, added by hand) is kept, and variables missing from .env.example are
// carried over at the end.
// Usage: node scripts/testnet/write-env.mjs
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ROLES, TOKEN, VAULT, readSecret, vaultKey } from './signer-keys.mjs';

const root = new URL('../../', import.meta.url);
const examplePath = new URL('.env.example', root);
const envPath = new URL('.env', root);

const previous = existsSync(envPath)
  ? Object.fromEntries(readFileSync(envPath, 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  : {};

const values = {
  SESSION_SECRET: previous.SESSION_SECRET && previous.SESSION_SECRET !== 'replace-with-random-secret'
    ? previous.SESSION_SECRET : randomBytes(32).toString('base64'),
  TUSDC_CONTRACT_ID: TOKEN,
  VAULT_CONTRACT_ID: VAULT,
  MAKER_ACCOUNT_ID: ROLES.maker,
  APPROVER1_ACCOUNT_ID: ROLES.approver1,
  APPROVER2_ACCOUNT_ID: ROLES.approver2,
  WORKER_ACCOUNT_ID: ROLES.worker,
  ADMIN_SIGNER_ACCOUNT_ID: ROLES.admin,
};
const keyVars = { maker: 'MAKER', approver1: 'APPROVER1', approver2: 'APPROVER2', worker: 'WORKER', admin: 'ADMIN' };
for (const [role, account] of Object.entries(ROLES)) {
  const key = await vaultKey(account);
  values[`${keyVars[role]}_SIGNER_PRIVATE_KEY`] = readSecret(key.path, key.publicKey);
  console.log(`${keyVars[role]}_SIGNER_PRIVATE_KEY <- ${account} function-call key ${key.publicKey} (${key.methods.join(', ')})`);
}

const inExample = new Set();
const lines = readFileSync(examplePath, 'utf8').split('\n').map((line) => {
  const m = /^([A-Z0-9_]+)=/.exec(line);
  if (!m) return line;
  inExample.add(m[1]);
  if (m[1] in values) return `${m[1]}=${values[m[1]]}`;
  return m[1] in previous ? `${m[1]}=${previous[m[1]]}` : line; // keep what is already there
});
const extra = Object.keys(previous).filter((k) => !inExample.has(k));
if (extra.length) lines.push('', '# ---- Kept from the previous .env (not in .env.example) ----', ...extra.map((k) => `${k}=${previous[k]}`));
const header = '# Written by scripts/testnet/write-env.mjs. Git-ignored. Contains secrets: never commit, print or share.\n';
writeFileSync(envPath, header + lines.join('\n'), { mode: 0o600 });
chmodSync(envPath, 0o600);
console.log(`wrote .env (mode 600) with ${Object.keys(values).length} managed values; kept every other existing value${extra.length ? ` (+${extra.length} not in .env.example: ${extra.join(', ')})` : ''}`);

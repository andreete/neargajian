// Locates each role's restricted function-call key file in ~/.near-credentials/testnet.
// Returns PATHS and public keys only. Never reads or prints private key material, except
// readSecret(), which is used by write-env.mjs to copy the key into .env and nowhere else.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const RPC = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.near.org';
if (!RPC.includes('testnet')) throw new Error('testnet RPC only');
export const MASTER = process.env.GAJIAN_MASTER ?? 'gajian-payroll.testnet';
export const VAULT = `vault.${MASTER}`;
export const TOKEN = `tusdc.${MASTER}`;
export const ROLES = {
  maker: `maker.${MASTER}`,
  approver1: `approver1.${MASTER}`,
  approver2: `approver2.${MASTER}`,
  worker: `worker.${MASTER}`,
  admin: `admin.${MASTER}`,
};

export async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'gajian', method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}

/** The account's function-call key for the vault: { publicKey, methods, allowance, path }. */
export async function vaultKey(accountId) {
  const { keys } = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: accountId });
  const fc = keys.filter((k) => k.access_key.permission?.FunctionCall?.receiver_id === VAULT);
  if (fc.length !== 1) throw new Error(`${accountId}: expected exactly one vault function-call key, found ${fc.length}`);
  const { public_key: publicKey, access_key: { permission: { FunctionCall: p } } } = fc[0];
  const path = join(homedir(), '.near-credentials', 'testnet', accountId, `${publicKey.replace(':', '_')}.json`);
  return { publicKey, methods: p.method_names, allowance: p.allowance, path };
}

export function readSecret(path, expectedPublicKey) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.public_key !== expectedPublicKey) throw new Error(`key file ${path} does not match ${expectedPublicKey}`);
  return data.private_key;
}

// Locates each role's restricted function-call key file in ~/.near-credentials/testnet.
// Returns PATHS and public keys only. Never reads or prints private key material, except
// readSecret(), which is used by write-env.mjs to copy the key into .env and nowhere else.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const RPC = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.fastnear.com';
if (!RPC.includes('testnet')) throw new Error('testnet RPC only');
export const MASTER = process.env.GAJIAN_MASTER ?? 'gajian-payroll.testnet';
/** The final vault (Phase 16): deployed from the release commit, no full-access key. */
export const VAULT = process.env.GAJIAN_VAULT ?? `vault2.${MASTER}`;
/** The Phase 04 vault: kept readable; its funds moved to VAULT through an approved run. */
export const LEGACY_VAULT = `vault.${MASTER}`;
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

/**
 * The account's function-call key for a vault (default: the final vault) that THIS machine holds:
 * { publicKey, methods, allowance, path }. An account may also carry the hosted demo's own key
 * (scripts/testnet/hosting-keys.sh), whose private part never lives in ~/.near-credentials, so the
 * local key is the one with a key file here.
 */
export async function vaultKey(accountId, vault = VAULT) {
  const { keys } = await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: accountId });
  const fileOf = (pk) => join(homedir(), '.near-credentials', 'testnet', accountId, `${pk.replace(':', '_')}.json`);
  const fc = keys.filter((k) => k.access_key.permission?.FunctionCall?.receiver_id === vault);
  const local = fc.filter((k) => existsSync(fileOf(k.public_key)));
  if (local.length !== 1) throw new Error(`${accountId}: expected exactly one local vault function-call key, found ${local.length} (of ${fc.length} on-chain)`);
  const { public_key: publicKey, access_key: { permission: { FunctionCall: p } } } = local[0];
  return { publicKey, methods: p.method_names, allowance: p.allowance, path: fileOf(publicKey) };
}

export function readSecret(path, expectedPublicKey) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.public_key !== expectedPublicKey) throw new Error(`key file ${path} does not match ${expectedPublicKey}`);
  return data.private_key;
}

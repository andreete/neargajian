/**
 * Read-only NEAR testnet check for a recipient (Phase 19): does the account exist, and is it
 * registered with the tUSDC token (NEP-145 storage)? A payout to an unregistered account fails.
 * Two view calls, short timeout, no keys. The result is advisory: shown to the admin, never
 * used to move money.
 */
import type { RecipientReadiness } from '../db/schema.ts';

export type CheckedReadiness = Exclude<RecipientReadiness, 'unchecked'>;
export interface ReadinessChecker { check(accountId: string): Promise<CheckedReadiness> }

export const READINESS_LABEL: Record<RecipientReadiness, string> = {
  ready: 'Ready to receive tUSDC',
  no_account: 'Account not found on NEAR testnet',
  not_registered: 'Not registered with tUSDC: a payout would fail',
  check_failed: 'Could not reach NEAR testnet: check again',
  unchecked: 'Not checked yet',
};

const TIMEOUT_MS = 5000;

async function rpc(url: string, params: Record<string, unknown>): Promise<{ result?: { result?: number[] }; error?: unknown }> {
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'sentfund-readiness', method: 'query', params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  return (await res.json()) as { result?: { result?: number[] }; error?: unknown };
}

export function rpcReadinessChecker(env: Readonly<Record<string, string | undefined>> = process.env): ReadinessChecker {
  const url = env.NEAR_RPC_URL ?? 'https://rpc.testnet.fastnear.com';
  if (!/testnet/.test(url)) throw new Error('NEAR_RPC_URL must be a testnet endpoint');
  const token = env.TUSDC_CONTRACT_ID ?? 'tusdc.sentfund-payroll.testnet';
  return {
    async check(accountId) {
      try {
        const account = await rpc(url, { request_type: 'view_account', finality: 'final', account_id: accountId });
        if (account.error) return JSON.stringify(account.error).includes('UNKNOWN_ACCOUNT') ? 'no_account' : 'check_failed';
        const storage = await rpc(url, {
          request_type: 'call_function', finality: 'final', account_id: token, method_name: 'storage_balance_of',
          args_base64: Buffer.from(JSON.stringify({ account_id: accountId })).toString('base64'),
        });
        if (storage.error || !storage.result?.result) return 'check_failed';
        const value = JSON.parse(Buffer.from(storage.result.result).toString('utf8')) as unknown;
        return value === null ? 'not_registered' : 'ready';
      } catch {
        return 'check_failed';
      }
    },
  };
}

let override: ReadinessChecker | undefined;

export function getReadinessChecker(): ReadinessChecker {
  return override ?? rpcReadinessChecker();
}

/** Test-only stand-in (no network). Refused outside NODE_ENV=test. */
export function setReadinessCheckerForTests(checker: ReadinessChecker | undefined): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only');
  override = checker;
}

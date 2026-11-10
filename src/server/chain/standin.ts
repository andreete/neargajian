/**
 * TEST-ONLY stand-in vault mode for the browser tests of whole flows (Phase 23):
 * VAULT_STANDIN=browser-tests makes this server use the in-memory stand-in vault (standin-vault.ts)
 * instead of NEAR testnet, and runs the release worker's tick inside the server process
 * (instrumentation.ts). Nothing is ever sent to NEAR. Refused unless the database lives under
 * .tmp/ and the server is not the hosted demo; every page shows a "Stand-in vault" banner.
 */
import type { VaultClient } from './vault-client.ts';
import { FakeVault } from './standin-vault.ts';

export const STANDIN_LABEL = 'Stand-in vault (browser tests only): nothing is sent to NEAR testnet; transaction IDs are fake.';

export function standinMode(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (env.VAULT_STANDIN !== 'browser-tests') return false;
  if (env.HOSTED_DEMO === 'true') throw new Error('VAULT_STANDIN is refused in the hosted demo.');
  if (!(env.DATABASE_URL ?? '').includes('/.tmp/')) throw new Error('VAULT_STANDIN needs a test database under .tmp/.');
  return true;
}

const g = globalThis as unknown as { sentfundStandinVault?: FakeVault };

/** One stand-in vault per server process, funded with 100 tUSDC. */
export function standinVault(): VaultClient {
  if (!g.sentfundStandinVault) {
    const v = new FakeVault();
    v.balance = 100_000_000n;
    v.chainClock = new Date();
    g.sentfundStandinVault = v;
  }
  return g.sentfundStandinVault;
}

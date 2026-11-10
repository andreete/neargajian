/**
 * TEST-ONLY (VAULT_STANDIN=browser-tests): the release worker's tick inside the web server process,
 * against the in-memory stand-in vault (the real worker is a separate process and could not see
 * that memory). Started by src/instrumentation.ts; never in production or the hosted demo.
 */
import { getDb } from '../db/client.ts';
import { workerTick } from '../payouts/release.ts';
import { getVaultClient } from './vault-client.ts';
import { standinMode } from './standin.ts';

const g = globalThis as unknown as { sentfundStandinWorker?: ReturnType<typeof setInterval> };

export function startStandinWorker(intervalMs = 1000): void {
  if (!standinMode() || g.sentfundStandinWorker) return;
  let busy = false;
  g.sentfundStandinWorker = setInterval(() => {
    if (busy) return;
    busy = true;
    workerTick(getDb(), getVaultClient(), { workerId: 'standin-worker' })
      .catch((e: unknown) => process.stdout.write(`${JSON.stringify({ worker: 'standin', error: e instanceof Error ? e.message.slice(0, 200) : String(e) })}\n`))
      .finally(() => { busy = false; });
  }, intervalMs);
}

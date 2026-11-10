#!/usr/bin/env node
/**
 * SentFund release worker: a separate long-running process (not inside the web server).
 * Every few seconds it reconciles live versions with the vault, releases approved runs in
 * automatic mode, and pays releasing runs one row per transaction. All state is durable in
 * SQLite (payout_actions), so it resumes safely after a crash or restart.
 *   node --env-file=.env src/worker/index.ts        (npm run worker)
 * Stop with Ctrl+C or SIGTERM: it finishes the current step and exits.
 * Logs are JSON lines without personal data.
 * With HOSTED_READONLY=true (kill switch) it stays up but sends nothing until the switch is off.
 */
import { closeDatabase, getDb } from '../server/db/client.ts';
import { getVaultClient } from '../server/chain/vault-client.ts';
import { workerTick } from '../server/payouts/release.ts';
import { hostedMode } from '../server/hosted.ts';

const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 3000);
const workerId = `worker-${process.pid}`;
let stopping = false;
let wake: (() => void) | undefined;

const logLine = (event: string, detail: Record<string, unknown> = {}) =>
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), worker: workerId, event, ...detail })}\n`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopping = true;
    logLine('stopping', { signal: sig });
    wake?.();
  });
}

logLine('started', { intervalMs, vault: process.env.VAULT_CONTRACT_ID ?? 'vault.sentfund-payroll.testnet' });
const db = getDb();
const client = getVaultClient();
if (!client.canSign('worker')) {
  logLine('no_signer', { message: 'WORKER_SIGNER_PRIVATE_KEY is not configured: this copy cannot send transactions. Exiting.' });
  process.exit(1);
}
let paused = false;
while (!stopping) {
  const readOnly = hostedMode().readOnly;
  if (readOnly !== paused) { paused = readOnly; logLine(paused ? 'paused' : 'resumed', { reason: 'HOSTED_READONLY' }); }
  if (!paused) {
    try {
      const s = await workerTick(db, client, { workerId, maxRowsPerTick: Number(process.env.WORKER_MAX_ROWS ?? 5) });
      if (s.released || s.paidRows || s.blockTimes) logLine('tick', s);
    } catch (error) {
      logLine('error', { message: error instanceof Error ? error.message.slice(0, 300) : String(error) });
    }
  }
  await new Promise<void>((resolve) => {
    wake = resolve;
    setTimeout(resolve, intervalMs);
  });
}
closeDatabase();
logLine('stopped');

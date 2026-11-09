#!/usr/bin/env node
// Clean demo database for the video and for hosting. Never deletes data:
//   1. refuses while the app (127.0.0.1:8092) or the release worker is running;
//   2. MOVES the current database file into data/backups/gajian-<UTC time>.sqlite (after a WAL
//      checkpoint) and checks that the moved copy opens with the same row counts;
//   3. creates a fresh database: migrations, the four demo users, the final vault's CURRENT
//      workflow read from the chain (read-only), and the recipient directory (3 live testnet
//      recipients checked read-only on testnet + 1,000 sample employees; "Pay registered
//      recipients only" on). No demo draft, no rehearsal runs, no history.
// Live evidence stays in docs/TESTNET.md and in the backup. Appends to data/backups/RESET-LOG.jsonl.
// Usage: npm run demo:reset            (uses DATABASE_URL and VAULT_CONTRACT_ID from .env)
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { closeDatabase, databaseFileFromUrl, getDatabase } from '../src/server/db/client.ts';
import { seedDemo, SEED_WORKFLOW } from '../src/server/db/seed.ts';
import { currentVaultId } from '../src/server/workflow/vault.ts';
import { eq } from 'drizzle-orm';
import { recipients } from '../src/server/db/schema.ts';
import { checkReadiness } from '../src/server/recipients/directory.ts';
import { READINESS_LABEL, rpcReadinessChecker } from '../src/server/recipients/readiness.ts';

const file = databaseFileFromUrl(process.env.DATABASE_URL);
const vault = currentVaultId();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

// 1. Nothing may hold the database open.
const up = await fetch('http://127.0.0.1:8092/api/health').then(() => true, () => false);
if (up) throw new Error('refused: the app is running on 127.0.0.1:8092. Stop the server (and the worker) first.');
for (const pidFile of ['.tmp/review-server.pid', '.tmp/worker.pid']) {
  if (!existsSync(pidFile)) continue;
  const pid = readFileSync(pidFile, 'utf8').trim();
  if (pid && spawnSync('ps', ['-p', pid], { encoding: 'utf8' }).status === 0) throw new Error(`refused: process ${pid} from ${pidFile} is still running. Stop it first.`);
}
if (process.env.DEMO_MODE !== 'true') throw new Error('refused: DEMO_MODE is not "true" in .env');

// 2. Move the current database aside (kept, never deleted).
const backups = join(dirname(file), 'backups');
mkdirSync(backups, { recursive: true });
const counts = (db: Database.Database) => Object.fromEntries((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
  .map(({ name }) => [name, (db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n]));
let backup: string | null = null;
let before: Record<string, number> = {};
if (existsSync(file)) {
  const src = new Database(file);
  src.pragma('wal_checkpoint(TRUNCATE)');
  before = counts(src);
  src.close();
  backup = join(backups, `gajian-${stamp}.sqlite`);
  renameSync(file, backup);
  for (const ext of ['-wal', '-shm']) if (existsSync(file + ext)) renameSync(file + ext, backup + ext);
  const check = new Database(backup, { readonly: true });
  const after = counts(check);
  check.close();
  if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error(`backup check failed: ${JSON.stringify({ before, after })}`);
  console.log(`moved the current database to ${backup} (row counts verified: ${Object.entries(before).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(', ')})`);
}

// 3. Fresh database with the vault's current workflow (read from the chain).
const rpcUrl = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.fastnear.com';
if (!/testnet/.test(rpcUrl)) throw new Error('testnet RPC only');
const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: vault, method_name: 'get_workflow', args_base64: Buffer.from('{}').toString('base64') } }) }).then((x) => x.json()) as { result: { result: number[] } };
const wf = JSON.parse(Buffer.from(r.result.result).toString()) as { revision: number; kind: string; release_mode: string; approvers: string[]; max_row_amount: string; max_run_total: string };
if (wf.revision !== SEED_WORKFLOW.revision || wf.kind !== 'TwoSequential' || wf.release_mode !== 'Automatic') {
  throw new Error(`refused: ${vault} is at revision ${wf.revision} (${wf.kind}, ${wf.release_mode}) but the seed mirrors revision ${SEED_WORKFLOW.revision} (TwoSequential, Automatic). Update SEED_WORKFLOW first.${backup ? ` Your previous database is safe at ${backup}; move it back to ${file} to undo.` : ''}`);
}
const { db, sqlite } = getDatabase();
const created = await seedDemo(db, { demoDraft: false, testnetHistory: false, recipientDirectory: true, env: { ...process.env, DEMO_CAP_PER_ROW_BASE_UNITS: wf.max_row_amount, DEMO_CAP_PER_RUN_BASE_UNITS: wf.max_run_total } });
// Read-only testnet check of the three live recipients (exists + registered with tUSDC).
const live = db.select({ id: recipients.id }).from(recipients).where(eq(recipients.sample, false)).all().map((x) => x.id);
const checked = await checkReadiness(db, rpcReadinessChecker(), 'usr_admin', live);
console.log(`recipient check on testnet: ${Object.values(checked).map((c) => READINESS_LABEL[c]).join('; ')}`);
const fresh = counts(sqlite);
closeDatabase();
console.log(`fresh database ${file}: ${created.join(', ')}`);
console.log(`workflow mirrors ${vault} revision ${wf.revision}: two in sequence (${wf.approvers.join(' → ')}), automatic release, caps ${wf.max_row_amount} / ${wf.max_run_total} base units`);
appendFileSync(join(backups, 'RESET-LOG.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), backup, before, fresh, vault, revision: wf.revision })}\n`);

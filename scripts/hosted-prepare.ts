#!/usr/bin/env node
// Runs in the hosted container before the web app and the release worker start
// (scripts/hosted-start.sh). The database lives on the Railway volume (/data).
//   - First boot (no database file yet) or a NEW value of DEMO_RESET_TOKEN:
//     `demo-reset.ts --with-testnet-history` (moves any old database to /data/backups, never
//     deletes; fresh demo users, the vault's workflow, the recipient directory with the
//     read-only testnet check, the real Phase 02/04 testnet runs). The token is then remembered
//     in /data/.demo-reset-token, so the reset happens once per token value.
//   - Otherwise: open the database, which applies any pending migrations.
// To reset the hosted demo: set DEMO_RESET_TOKEN to a new value (for example today's date) in
// Railway Variables; Railway redeploys and the reset runs once.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { closeDatabase, databaseFileFromUrl, getDatabase } from '../src/server/db/client.ts';

const log = (event: string, detail: Record<string, unknown> = {}) => process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), service: 'hosted-prepare', event, ...detail })}\n`);
const file = databaseFileFromUrl(process.env.DATABASE_URL);
const marker = join(dirname(file), '.demo-reset-token');
const token = (process.env.DEMO_RESET_TOKEN ?? '').trim();
const last = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null;
const firstBoot = !existsSync(file);

if (firstBoot || (token && token !== last)) {
  log('demo_reset', { reason: firstBoot ? 'first boot: no database on the volume' : 'new DEMO_RESET_TOKEN', file });
  const r = spawnSync(process.execPath, ['scripts/demo-reset.ts', '--with-testnet-history'], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    log('demo_reset_failed', { status: r.status });
    process.exit(r.status ?? 1);
  }
  writeFileSync(marker, `${token || 'initial'}\n`);
  log('demo_reset_done');
} else {
  getDatabase(); // applies pending migrations
  closeDatabase();
  log('migrations_applied', { file });
}

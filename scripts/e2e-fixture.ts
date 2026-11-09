#!/usr/bin/env node
/**
 * TEST-ONLY fixture for the browser tests (scripts/e2e-server.sh). Adds payroll runs in every
 * lifecycle state to the ISOLATED e2e database (.tmp/e2e), built through the real lifecycle
 * code against the contract-faithful stand-in vault (tests/helpers/fake-vault.ts). Nothing here
 * touches testnet; tx hashes are fake ("TX…") and exist only in the e2e database.
 * Refuses to run against any database outside .tmp/.
 */
import { readFileSync } from 'node:fs';
import { closeDatabase, getDatabase } from '../src/server/db/client.ts';
import { createRun } from '../src/server/runs/repository.ts';
import { uploadToDraft } from '../src/server/runs/draft-service.ts';
import { decide, latestVersion, reconcileVersion, submitRun } from '../src/server/runs/lifecycle.ts';
import { payRows, requestRelease } from '../src/server/payouts/release.ts';
import { FakeVault } from '../tests/helpers/fake-vault.ts';

const { db, file } = getDatabase();
if (!file.includes('/.tmp/')) throw new Error(`Refusing to write the e2e fixture outside .tmp/: ${file}`);

const maker = { id: 'usr_maker', role: 'maker' as const };
const app1 = { id: 'usr_app1', role: 'approver' as const };
const app2 = { id: 'usr_app2', role: 'approver' as const };
const fake = new FakeVault();
fake.balance = 100_000_000n; // 100 tUSDC in the stand-in vault
let clock = new Date('2026-11-05T09:00:00Z');
const tick = (min = 1) => (clock = new Date(clock.getTime() + min * 60_000));

type Stop = 'pending' | 'rejected' | 'releasing' | 'awaiting_funding' | 'paid';
async function run(title: string, posting: 'consolidated' | 'detailed', csv: string, stop: Stop) {
  const id = createRun(db, { makerUserId: maker.id, title, postingMode: posting, source: 'upload', now: tick() });
  uploadToDraft(db, maker, id, { filename: csv.split('/').at(-1)!, bytes: readFileSync(csv), expectedRevision: 0, now: tick() });
  await submitRun(db, fake, maker, id, { expectedRevision: 1, now: tick() });
  const v = () => latestVersion(db, id)!;
  await reconcileVersion(db, fake, v().id, tick());
  if (stop === 'pending') return id;
  if (stop === 'rejected') {
    await decide(db, fake, app1, id, { versionId: v().id, decision: 'reject', reason: 'Amounts for two contractors need a second check.', now: tick() });
    await reconcileVersion(db, fake, v().id, tick());
    return id;
  }
  await decide(db, fake, app1, id, { versionId: v().id, decision: 'approve', now: tick() });
  await reconcileVersion(db, fake, v().id, tick());
  await decide(db, fake, app2, id, { versionId: v().id, decision: 'approve', now: tick() });
  await reconcileVersion(db, fake, v().id, tick());
  if (stop === 'awaiting_funding') {
    const saved = fake.balance;
    fake.balance = fake.reserved; // nothing available
    await requestRelease(db, fake, v(), { role: 'worker', workerId: 'fixture', now: tick() });
    fake.balance = saved;
    return id;
  }
  await requestRelease(db, fake, v(), { role: 'worker', workerId: 'fixture', now: tick() });
  await payRows(db, fake, v(), { role: 'worker', workerId: 'fixture', max: stop === 'releasing' ? 1 : 1000, now: tick() });
  return id;
}

const three = 'tests/live/live-3-rows.csv';
const ids = {
  paidDetailed: await run('October contractors', 'detailed', three, 'paid'),
  paidConsolidated: await run('October staff payroll (1,000 rows)', 'consolidated', 'public/templates/gajian-payroll-uniform-1000.csv', 'paid'),
  releasing: await run('November freelancers', 'detailed', three, 'releasing'),
  awaitingFunding: await run('November bonuses', 'consolidated', three, 'awaiting_funding'),
  pending: await run('November contractors', 'detailed', three, 'pending'),
  rejected: await run('November expenses', 'consolidated', three, 'rejected'),
};
console.log(JSON.stringify(ids));
closeDatabase();

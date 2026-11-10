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
import { createDraftFromPreview, interpretRequest } from '../src/server/assistant/service.ts';
import { stubModel } from '../src/server/assistant/stub-model.ts';
import { setIdentityVerifiedOnly } from '../src/server/identity/service.ts';

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

/** A run drafted by the payroll assistant (TEST STUB model) and submitted: waiting for approver 1. */
async function assistantRun() {
  const reply = await interpretRequest(db, stubModel(), maker, [{ role: 'user', text: 'Create a disbursement for the Sales division, 0.04 tUSDC each, called November commissions' }], tick());
  if (reply.kind !== 'preview') throw new Error(`fixture: expected a preview, got ${reply.kind}`);
  const { runId } = createDraftFromPreview(db, maker, reply.requestId, tick());
  await submitRun(db, fake, maker, runId, { expectedRevision: 1, now: tick() });
  await reconcileVersion(db, fake, latestVersion(db, runId)!.id, tick());
  return runId;
}

const three = 'tests/live/live-3-rows.csv';
// These runs are history from before the identity check existed (Phase 21, dated 5 Nov), and the
// 1,000 sample employees are never identity-verified: the gate is off while they are built, then
// back on (the demo default) for the browser tests.
const admin = { id: 'usr_admin', role: 'admin' as const };
setIdentityVerifiedOnly(db, admin, false, clock);
const ids = {
  paidDetailed: await run('October contractors', 'detailed', three, 'paid'),
  paidConsolidated: await run('October staff payroll (1,000 rows)', 'consolidated', 'public/templates/sentfund-payroll-uniform-1000.csv', 'paid'),
  releasing: await run('November freelancers', 'detailed', three, 'releasing'),
  awaitingFunding: await run('November bonuses', 'consolidated', three, 'awaiting_funding'),
  pending: await run('November contractors', 'detailed', three, 'pending'),
  rejected: await run('November expenses', 'consolidated', three, 'rejected'),
  longTitle: await run('November contractors and freelance designers: second payroll batch for the product team', 'detailed', three, 'pending'),
  assistantPending: await assistantRun(),
};
setIdentityVerifiedOnly(db, admin, true, tick());
console.log(JSON.stringify(ids));
closeDatabase();

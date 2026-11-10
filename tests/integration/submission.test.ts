/** Phase 10: immutable submission, honest pending state, reconcile, no duplicates, new versions, cancellation. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import { runVersions } from '@/server/db/schema';
import { seedDemo, DEMO_DRAFT_RUN_ID } from '@/server/db/seed';
import { cancelVersion, latestVersion, reconcileVersion, submitRun } from '@/server/runs/lifecycle';
import { saveManualDraft, uploadToDraft } from '@/server/runs/draft-service';
import { FakeVault } from '../helpers/fake-vault';

const dir = mkdtempSync(join(tmpdir(), 'sentfund-sub-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const maker = { id: 'usr_maker', role: 'maker' as const };
let h: DatabaseHandle;
let fake: FakeVault;
let k = 0;

beforeEach(async () => {
  k += 1;
  h = openDatabase(join(dir, `s${k}.sqlite`));
  await seedDemo(h.db, { env: { DEMO_MODE: 'true' } });
  fake = new FakeVault();
});

const submit = (extra: { supersede?: boolean } = {}) =>
  submitRun(h.db, fake, maker, DEMO_DRAFT_RUN_ID, { expectedRevision: currentRevision(), ...extra });
function currentRevision() {
  return (h.sqlite.prepare('select draft_revision as r from payroll_runs where id = ?').get(DEMO_DRAFT_RUN_ID) as { r: number }).r;
}

describe('submission', () => {
  it('freezes the draft, sends create_run once, stays pending until the vault confirms', async () => {
    const r = await submit();
    expect(r).toMatchObject({ versionNo: 1, status: 'submitting', txHash: 'TX1' });
    const v = latestVersion(h.db, DEMO_DRAFT_RUN_ID)!;
    expect(v).toMatchObject({ status: 'submitting', submitTxHash: 'TX1', rowCount: 3, total: 150_000n });
    expect(fake.calls).toEqual([expect.objectContaining({ role: 'maker', method: 'create_run', args: expect.objectContaining({ run_id: v.chainRunId, workflow_revision: 3, row_count: 3, total: '150000', payout_root: v.payoutRoot, supersedes: null }) })]);
    expect((await reconcileVersion(h.db, fake, v.id)).status).toBe('pending_approval');
    // A retry cannot create a second run.
    await expect(submit()).rejects.toThrow(/still waiting for approval/);
    expect(fake.calls.filter((c) => c.method === 'create_run')).toHaveLength(1);
  });

  it('a retry while still submitting reconciles instead of sending again', async () => {
    fake.modes.set('create_run', 'unknown-landed');
    await submit();
    const again = await submit();
    expect(again.status).toBe('pending_approval');
    expect(fake.calls.filter((c) => c.method === 'create_run')).toHaveLength(1);
  });

  it('keeps an unknown, never-landed submission pending, then marks it failed once proven', async () => {
    fake.modes.set('create_run', 'unknown-lost');
    await submit();
    const v = latestVersion(h.db, DEMO_DRAFT_RUN_ID)!;
    expect(v.status).toBe('submitting');
    expect((await reconcileVersion(h.db, fake, v.id)).status).toBe('submit_failed');
  });

  it('records a vault refusal (workflow changed) as submit_failed with its reason and reopens the draft', async () => {
    fake.wf.revision = 6;
    const r = await submit();
    expect(r).toMatchObject({ status: 'submit_failed', error: 'Workflow changed since review: reload and confirm again' });
    expect(latestVersion(h.db, DEMO_DRAFT_RUN_ID)?.statusDetail).toBe('Workflow changed since review: reload and confirm again');
    expect(saveManualDraft(h.db, maker, DEMO_DRAFT_RUN_ID, { expectedRevision: currentRevision(), rows: [], now: new Date() }).revision).toBe(currentRevision());
  });

  it('locks the draft while a version is live: edits and uploads are refused', async () => {
    await submit();
    expect(() => saveManualDraft(h.db, maker, DEMO_DRAFT_RUN_ID, { expectedRevision: currentRevision(), rows: [], now: new Date() })).toThrow(/is submitted/);
    expect(() => uploadToDraft(h.db, maker, DEMO_DRAFT_RUN_ID, { filename: 'x.csv', bytes: new Uint8Array([1]), expectedRevision: currentRevision(), now: new Date() })).toThrow(/is submitted/);
  });

  it('cancel on-chain reopens the draft; a new version needs fresh approvals', async () => {
    await submit();
    const v1 = latestVersion(h.db, DEMO_DRAFT_RUN_ID)!;
    await reconcileVersion(h.db, fake, v1.id);
    expect((await cancelVersion(h.db, fake, maker, DEMO_DRAFT_RUN_ID)).status).toBe('cancelled');
    const r2 = await submit();
    expect(r2.versionNo).toBe(2);
    const v2 = latestVersion(h.db, DEMO_DRAFT_RUN_ID)!;
    expect((await reconcileVersion(h.db, fake, v2.id)).status).toBe('pending_approval');
    expect(fake.runs.get(v2.chainRunId)?.approvals).toEqual([]);
  });

  it('a new version can supersede a pending one atomically on-chain', async () => {
    await submit();
    const v1 = latestVersion(h.db, DEMO_DRAFT_RUN_ID)!;
    await reconcileVersion(h.db, fake, v1.id);
    // The supersede path is used when the maker explicitly replaces a pending version.
    const r2 = await submit({ supersede: true });
    expect(fake.calls.at(-1)?.args.supersedes).toBe(v1.chainRunId);
    await reconcileVersion(h.db, fake, r2.versionId);
    const old = h.db.select().from(runVersions).where(eq(runVersions.id, v1.id)).get()!;
    expect(old.status).toBe('cancelled');
    expect(old.supersededByVersionId).toBe(r2.versionId);
  });

  it('only the run maker can submit or cancel', async () => {
    await expect(submitRun(h.db, fake, { id: 'usr_app1', role: 'approver' }, DEMO_DRAFT_RUN_ID, { expectedRevision: currentRevision() })).rejects.toThrow(/not found/);
    await expect(cancelVersion(h.db, fake, { id: 'usr_admin', role: 'admin' }, DEMO_DRAFT_RUN_ID)).rejects.toThrow(/not found/);
    await expect(submitRun(h.db, fake, maker, DEMO_DRAFT_RUN_ID, { expectedRevision: 99 })).rejects.toThrow(/changed since you reviewed/);
  });
});

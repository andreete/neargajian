/** Phase 11: approver decisions against the stand-in vault (order, stale versions, rejection, access). */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import { DEMO_DRAFT_RUN_ID, seedDemo } from '@/server/db/seed';
import { cancelVersion, decide, latestVersion, reconcileVersion, runDetail, submitRun } from '@/server/runs/lifecycle';
import { approverQueue } from '@/server/dashboard/queries';
import { FakeVault } from '../helpers/fake-vault';

const dir = mkdtempSync(join(tmpdir(), 'sentfund-dec-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const maker = { id: 'usr_maker', role: 'maker' as const };
const app1 = { id: 'usr_app1', role: 'approver' as const };
const app2 = { id: 'usr_app2', role: 'approver' as const };
let h: DatabaseHandle;
let fake: FakeVault;
let k = 0;
const rev = () => (h.sqlite.prepare('select draft_revision as r from payroll_runs where id = ?').get(DEMO_DRAFT_RUN_ID) as { r: number }).r;

async function submitted() {
  await submitRun(h.db, fake, maker, DEMO_DRAFT_RUN_ID, { expectedRevision: rev() });
  const v = latestVersion(h.db, DEMO_DRAFT_RUN_ID)!;
  await reconcileVersion(h.db, fake, v.id);
  return v;
}
const reconcile = async () => (await reconcileVersion(h.db, fake, latestVersion(h.db, DEMO_DRAFT_RUN_ID)!.id)).status;

beforeEach(async () => {
  k += 1;
  h = openDatabase(join(dir, `d${k}.sqlite`));
  await seedDemo(h.db, { env: { DEMO_MODE: 'true' } });
  fake = new FakeVault();
});

describe('approver decisions', () => {
  it('two in sequence: approver 2 cannot go first; each approval waits for NEAR before counting', async () => {
    const v = await submitted();
    await expect(decide(h.db, fake, app2, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' })).rejects.toThrow(/only after approver 1/);
    expect(fake.calls.filter((c) => c.method === 'approve')).toHaveLength(0);
    const r1 = await decide(h.db, fake, app1, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' });
    expect(r1).toMatchObject({ status: 'pending', step: 1 });
    // While step 1 is still pending on NEAR, step 2 is not open yet.
    await expect(decide(h.db, fake, app2, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' })).rejects.toThrow(/only after approver 1/);
    expect(await reconcile()).toBe('pending_approval');
    expect(runDetail(h.db, app1, DEMO_DRAFT_RUN_ID).events[0]).toMatchObject({ status: 'confirmed', step: 1 });
    await decide(h.db, fake, app2, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' });
    expect(await reconcile()).toBe('approved');
    expect(fake.calls.filter((c) => c.method === 'approve').map((c) => c.role)).toEqual(['approver1', 'approver2']);
  });

  it('repeated, wrong-role and stale-version decisions are refused', async () => {
    const v = await submitted();
    await decide(h.db, fake, app1, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' });
    await expect(decide(h.db, fake, app1, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' })).rejects.toThrow(/already decided/);
    await expect(decide(h.db, fake, maker, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' })).rejects.toThrow(/not found/);
    await expect(decide(h.db, fake, { id: 'usr_admin', role: 'admin' }, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' })).rejects.toThrow(/not found/);
    await reconcile();
    await cancelVersion(h.db, fake, maker, DEMO_DRAFT_RUN_ID);
    const v2 = await submitted();
    await expect(decide(h.db, fake, app2, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' })).rejects.toThrow(/replaced/);
    expect(v2.versionNo).toBe(2);
    expect(runDetail(h.db, app1, DEMO_DRAFT_RUN_ID).events).toEqual([]); // fresh approvals for version 2
  });

  it('rejection needs a reason, is terminal and blocks release', async () => {
    const v = await submitted();
    await expect(decide(h.db, fake, app1, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'reject', reason: '  ' })).rejects.toThrow(/reason/);
    await decide(h.db, fake, app1, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'reject', reason: 'Row 2 has the wrong amount' });
    expect(await reconcile()).toBe('rejected');
    expect(runDetail(h.db, maker, DEMO_DRAFT_RUN_ID).events[0]).toMatchObject({ decision: 'reject', status: 'confirmed', reason: 'Row 2 has the wrong amount' });
    const release = await fake.call('worker', 'start_release', { run_id: v.chainRunId });
    expect(release).toMatchObject({ status: 'failure', error: 'Run is not approved for release' });
    // The reason never goes on-chain.
    expect(JSON.stringify(fake.calls)).not.toContain('wrong amount');
  });

  it('a refused decision is recorded as failed and can be retried', async () => {
    const v = await submitted();
    fake.runs.get(v.chainRunId)!.status = 'Cancelled'; // e.g. cancelled elsewhere
    await expect(decide(h.db, fake, app1, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' })).rejects.toThrow(/refused/);
    expect(runDetail(h.db, app1, DEMO_DRAFT_RUN_ID).events[0]).toMatchObject({ status: 'failed', error: 'Run is not waiting for approval' });
  });

  it('assigned approvers keep access after the run; unassigned people do not', async () => {
    const v = await submitted();
    expect(() => runDetail(h.db, app1, DEMO_DRAFT_RUN_ID)).not.toThrow();
    expect(runDetail(h.db, app2, DEMO_DRAFT_RUN_ID).canViewRecipients).toBe(true);
    expect(() => runDetail(h.db, { id: 'usr_admin', role: 'admin' }, DEMO_DRAFT_RUN_ID)).toThrow(/not found/);
    await decide(h.db, fake, app1, DEMO_DRAFT_RUN_ID, { versionId: v.id, decision: 'approve' });
    await reconcile();
    const q = approverQueue(h.db, 'usr_app1');
    expect(q.reviewed[0]).toMatchObject({ myDecision: 'approve', myDecisionStatus: 'confirmed' });
    expect(approverQueue(h.db, 'usr_app2').pending[0]).toMatchObject({ actionable: true, myStep: 2 });
  });
});

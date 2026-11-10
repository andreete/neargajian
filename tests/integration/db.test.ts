import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import {
  approvalEvents, payoutActions, payrollRuns, runVersions, users, versionRows, workflowConfigs,
} from '@/server/db/schema';
import { DEMO_DRAFT_RUN_ID, seedDemo } from '@/server/db/seed';
import {
  DomainError, chainRunIdFor, createRun, createVersion, getDraftRows, replaceDraft, setVersionStatus,
  type WorkflowSnapshot,
} from '@/server/runs/repository';
import { claimPayoutAction, updatePayoutAction } from '@/server/payouts/actions';
import { verifyPassword } from '@/server/auth/password';
import { toDelimited, validRows, withInvalidRow } from '@/server/fixtures/payroll';
import { parseAmount } from '@/server/money';

const ENV = { DEMO_MODE: 'true' };
const NOW = new Date('2026-11-10T03:00:00Z');
const WORKFLOW: WorkflowSnapshot = {
  revision: 3, kind: 'two_sequential', releaseMode: 'automatic',
  approvers: [{ userId: 'usr_app1', chainAccountId: 'approver1.gajian-payroll.testnet' }, { userId: 'usr_app2', chainAccountId: 'approver2.gajian-payroll.testnet' }],
  maxRowAmount: '1000000', maxRunTotal: '100000000',
};
const ROWS = [
  { accountId: 'recipient1.gajian-payroll.testnet', receiverName: 'Emma', currency: 'tUSDC', amount: 30_000n, mobilePhone: '+447700900101', email: 'emma@example.com' },
  { accountId: 'recipient2.gajian-payroll.testnet', receiverName: 'Daniel', currency: 'tUSDC', amount: 70_000n, mobilePhone: '+447700900102', email: 'daniel@example.com' },
];

let dir: string;
let h: DatabaseHandle;
const open = () => openDatabase(join(dir, 'sentfund.sqlite'));

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sentfund-db-'));
  h = open();
  await seedDemo(h.db, { now: NOW, env: ENV });
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const expectSqlError = (fn: () => unknown, pattern: RegExp) => expect(fn).toThrow(pattern);

describe('migrations and seed', () => {
  it('applies migrations, enables WAL and foreign keys, seeds idempotently', async () => {
    expect(h.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(h.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(await seedDemo(h.db, { now: NOW, env: ENV })).toEqual([]);
    expect(h.db.select().from(users).all()).toHaveLength(4);
    expect(h.db.select().from(workflowConfigs).where(eq(workflowConfigs.chainStatus, 'active')).all()).toHaveLength(1);
    expect(getDraftRows(h.db, DEMO_DRAFT_RUN_ID)).toHaveLength(3);
  });

  it('stores argon2id hashes, never the demo password', async () => {
    const maker = h.db.select().from(users).where(eq(users.email, 'maker@sentfund.my.id')).get();
    expect(maker?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(maker?.passwordHash).not.toContain('12345678');
    expect(await verifyPassword('12345678', maker?.passwordHash ?? '')).toBe(true);
    expect(await verifyPassword('12345679', maker?.passwordHash ?? '')).toBe(false);
  });

  it('refuses to seed demo users outside demo mode', async () => {
    await expect(seedDemo(h.db, { env: { DEMO_MODE: 'false' } })).rejects.toThrow('DEMO_MODE');
  });
});

describe('uniqueness and constraints', () => {
  it('rejects duplicate or non-lowercase emails and duplicate chain accounts', () => {
    const base = { displayName: 'X', role: 'maker' as const, passwordHash: 'x', createdAt: NOW };
    expectSqlError(() => h.db.insert(users).values({ ...base, id: 'u1', email: 'maker@sentfund.my.id' }).run(), /UNIQUE/);
    expectSqlError(() => h.db.insert(users).values({ ...base, id: 'u2', email: 'Upper@sentfund.my.id' }).run(), /CHECK/);
    expectSqlError(() => h.db.insert(users).values({ ...base, id: 'u3', email: 'x@sentfund.my.id', chainAccountId: 'maker.gajian-payroll.testnet' }).run(), /UNIQUE/);
  });

  it('enforces workflow shape and a single active revision', () => {
    const base = { releaseMode: 'automatic' as const, maxRowAmount: 1n, maxRunTotal: 1n, createdByUserId: 'usr_admin', createdAt: NOW };
    expectSqlError(() => h.db.insert(workflowConfigs).values({ ...base, id: 'w1', revision: 4, kind: 'two_sequential', approver1UserId: 'usr_app1', approver2UserId: 'usr_app1', chainStatus: 'pending' }).run(), /CHECK/);
    expectSqlError(() => h.db.insert(workflowConfigs).values({ ...base, id: 'w2', revision: 5, kind: 'one', approver1UserId: 'usr_app1', approver2UserId: 'usr_app2', chainStatus: 'pending' }).run(), /CHECK/);
    expectSqlError(() => h.db.insert(workflowConfigs).values({ ...base, id: 'w3', revision: 6, kind: 'one', approver1UserId: 'usr_app1', chainStatus: 'active' }).run(), /UNIQUE/);
    expectSqlError(() => h.db.insert(workflowConfigs).values({ ...base, id: 'w4', revision: 3, vaultContractId: 'vault2.gajian-payroll.testnet', kind: 'one', approver1UserId: 'usr_app1', chainStatus: 'pending' }).run(), /UNIQUE/);
    // Revisions restart in a new vault: the same number in another vault is a different revision.
    h.db.insert(workflowConfigs).values({ ...base, id: 'w4b', revision: 3, vaultContractId: 'vault.gajian-payroll.testnet', kind: 'one', approver1UserId: 'usr_app1', chainStatus: 'superseded' }).run();
    // A failed attempt does not block a retry of the same revision.
    h.db.insert(workflowConfigs).values({ ...base, id: 'w5', revision: 6, kind: 'one', approver1UserId: 'usr_app1', chainStatus: 'failed' }).run();
    h.db.insert(workflowConfigs).values({ ...base, id: 'w6', revision: 6, kind: 'one', approver1UserId: 'usr_app1', chainStatus: 'pending' }).run();
  });

  it('requires a reason for rejections and allows one live decision per approver', () => {
    const v = createVersion(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', rows: ROWS, workflow: WORKFLOW, postingMode: 'detailed', now: NOW });
    const base = { versionId: v.id, approverUserId: 'usr_app1', step: 1, status: 'pending' as const, createdAt: NOW };
    expectSqlError(() => h.db.insert(approvalEvents).values({ ...base, id: 'a0', decision: 'reject', reason: '  ' }).run(), /CHECK/);
    h.db.insert(approvalEvents).values({ ...base, id: 'a1', decision: 'approve' }).run();
    expectSqlError(() => h.db.insert(approvalEvents).values({ ...base, id: 'a2', decision: 'approve' }).run(), /UNIQUE/);
    h.db.update(approvalEvents).set({ status: 'failed' }).where(eq(approvalEvents.id, 'a1')).run();
    h.db.insert(approvalEvents).values({ ...base, id: 'a3', decision: 'approve' }).run();
  });
});

describe('drafts', () => {
  const row = (i: number) => ({ nearAccountId: `a${i}.testnet`, receiverName: `R${i}`, currency: 'tUSDC', amount: '0.01', mobilePhone: '+447700900000', email: `r${i}@example.com` });

  it('replaces a draft atomically with optimistic concurrency', () => {
    const rev = replaceDraft(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', expectedRevision: 1, rows: [row(1), row(2)], now: NOW });
    expect(rev).toBe(2);
    expect(getDraftRows(h.db, DEMO_DRAFT_RUN_ID).map((r) => r.nearAccountId)).toEqual(['a1.testnet', 'a2.testnet']);
    expect(() => replaceDraft(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', expectedRevision: 1, rows: [row(3)], now: NOW }))
      .toThrow(DomainError);
  });

  it('keeps the earlier draft when a replacement fails half-way', () => {
    const before = getDraftRows(h.db, DEMO_DRAFT_RUN_ID);
    const bad = [row(1), { ...row(2), receiverName: null as unknown as string }];
    expect(() => replaceDraft(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', expectedRevision: 1, rows: bad, now: NOW })).toThrow();
    expect(getDraftRows(h.db, DEMO_DRAFT_RUN_ID)).toEqual(before);
    expect(h.db.select().from(payrollRuns).where(eq(payrollRuns.id, DEMO_DRAFT_RUN_ID)).get()?.draftRevision).toBe(1);
  });

  it('only the run maker can replace the draft', () => {
    expect(() => replaceDraft(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_app1', expectedRevision: 1, rows: [row(1)], now: NOW }))
      .toThrow(/Only the run maker/);
  });
});

describe('immutable versions', () => {
  it('creates numbered versions with deterministic chain IDs and commitments', () => {
    const v1 = createVersion(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', rows: ROWS, workflow: WORKFLOW, postingMode: 'detailed', now: NOW });
    setVersionStatus(h.db, v1.id, 'pending_approval', NOW);
    const v2 = createVersion(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', rows: ROWS, workflow: WORKFLOW, postingMode: 'detailed', now: NOW });
    expect([v1.versionNo, v2.versionNo]).toEqual([1, 2]);
    expect(v1.chainRunId).toBe(chainRunIdFor(DEMO_DRAFT_RUN_ID, 1));
    expect(v1.chainRunId).toMatch(/^[a-z0-9_-]{1,64}$/);
    expect(v1.total).toBe(100_000n);
    expect(v1.payoutRoot).toBe(v2.payoutRoot);
    const stored = h.db.select().from(runVersions).where(eq(runVersions.id, v1.id)).get();
    expect(stored?.reviewDigest).not.toBe(h.db.select().from(runVersions).where(eq(runVersions.id, v2.id)).get()?.reviewDigest); // fresh salt
  });

  it('refuses to change or delete submitted data, rows, or terminal statuses', () => {
    const v = createVersion(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', rows: ROWS, workflow: WORKFLOW, postingMode: 'detailed', now: NOW });
    expectSqlError(() => h.db.update(runVersions).set({ total: 1n }).where(eq(runVersions.id, v.id)).run(), /immutable/);
    expectSqlError(() => h.db.update(runVersions).set({ payoutRoot: 'f'.repeat(64) }).where(eq(runVersions.id, v.id)).run(), /immutable/);
    expectSqlError(() => h.db.delete(runVersions).where(eq(runVersions.id, v.id)).run(), /never deleted/);
    expectSqlError(() => h.db.update(versionRows).set({ amount: 1n }).where(eq(versionRows.versionId, v.id)).run(), /immutable/);
    expectSqlError(() => h.db.delete(versionRows).where(eq(versionRows.versionId, v.id)).run(), /never deleted/);
    setVersionStatus(h.db, v.id, 'pending_approval', NOW);
    expectSqlError(() => h.db.insert(versionRows).values({ versionId: v.id, rowIndex: 2, nearAccountId: 'x.testnet', receiverName: 'x', currency: 'tUSDC', amount: 1n, mobilePhone: '+447700900000', email: 'x@example.com' }).run(), /no longer accepting rows/);
    setVersionStatus(h.db, v.id, 'rejected', NOW);
    expectSqlError(() => setVersionStatus(h.db, v.id, 'approved', NOW), /terminal/);
  });

  it('enforces caps when freezing a version', () => {
    const big = [{ ...ROWS[0]!, amount: 1_000_001n }];
    expect(() => createVersion(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', rows: big, workflow: WORKFLOW, postingMode: 'detailed', now: NOW })).toThrow(/per-row cap/);
  });
});

describe('payout action claims', () => {
  const setup = () => {
    const v = createVersion(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', rows: ROWS, workflow: WORKFLOW, postingMode: 'detailed', now: NOW });
    setVersionStatus(h.db, v.id, 'releasing', NOW);
    return v;
  };
  const claim = (db: DatabaseHandle['db'], versionId: string, worker = 'w1') =>
    claimPayoutAction(db, { versionId, kind: 'pay_row', rowIndex: 0, workerId: worker, now: NOW, leaseMs: 60_000 });

  it('claims once, returns the live action on repeat, and allows a new attempt only after failure', () => {
    const v = setup();
    const first = claim(h.db, v.id);
    expect(first.claimed).toBe(true);
    if (!first.claimed) return;
    expect(first.action.id).toBe(`${v.chainRunId}:pay_row:0:1`);
    const again = claim(h.db, v.id, 'w2');
    expect(again).toMatchObject({ claimed: false, existing: { id: first.action.id } });
    updatePayoutAction(h.db, first.action.id, { status: 'unknown', now: NOW, txHash: 'TX1' });
    expect(claim(h.db, v.id).claimed).toBe(false); // unknown outcome: never re-claimed
    updatePayoutAction(h.db, first.action.id, { status: 'failed', now: NOW, error: 'receiver not registered' });
    const retry = claim(h.db, v.id);
    expect(retry).toMatchObject({ claimed: true, action: { attempt: 2 } });
    if (!retry.claimed) return;
    updatePayoutAction(h.db, retry.action.id, { status: 'succeeded', now: NOW, txHash: 'TX2' });
    updatePayoutAction(h.db, retry.action.id, { status: 'failed', now: NOW }); // a late answer leaves a confirmed record untouched
    expect(h.sqlite.prepare('select status from payout_actions where id = ?').get(retry.action.id)).toEqual({ status: 'succeeded' });
    expectSqlError(() => h.sqlite.prepare("update payout_actions set status = 'failed' where id = ?").run(retry.action.id), /final/); // and the trigger enforces it
    expect(claim(h.db, v.id).claimed).toBe(false);
  });

  it('two processes cannot both hold a live claim for the same row', () => {
    const v = setup();
    const other = open(); // second connection = second process (worker restart, web + worker)
    try {
      const a = claim(h.db, v.id, 'web');
      const b = claim(other.db, v.id, 'worker');
      expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);
      // Even a raw insert that bypasses the claim function is refused by the partial index.
      expectSqlError(() => other.db.insert(payoutActions).values({
        id: 'manual', versionId: v.id, kind: 'pay_row', rowIndex: 0, attempt: 9, status: 'claimed', workerId: 'x',
        leaseExpiresAt: NOW, createdAt: NOW, updatedAt: NOW,
      }).run(), /UNIQUE/);
    } finally {
      other.sqlite.close();
    }
  });
});

describe('restart persistence', () => {
  it('keeps committed data after the connection closes and reopens', () => {
    const v = createVersion(h.db, { runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', rows: ROWS, workflow: WORKFLOW, postingMode: 'consolidated', now: NOW });
    const runId = createRun(h.db, { makerUserId: 'usr_maker', title: 'Persisted run', postingMode: 'consolidated', source: 'upload', now: NOW });
    h.sqlite.close();
    h = open();
    expect(h.db.select().from(runVersions).where(eq(runVersions.id, v.id)).get()?.total).toBe(100_000n);
    expect(h.db.select().from(versionRows).where(eq(versionRows.versionId, v.id)).all()).toHaveLength(2);
    expect(h.db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get()?.title).toBe('Persisted run');
  });
});

describe('fixtures', () => {
  it('are deterministic and valid at 1,000 rows', () => {
    const csv = toDelimited(validRows(1000));
    expect(createHash('sha256').update(csv).digest('hex')).toBe(createHash('sha256').update(toDelimited(validRows(1000))).digest('hex'));
    const rows = validRows(1000);
    const total = rows.reduce((sum, r) => {
      const p = parseAmount(r.amount, 1_000_000n);
      if (!p.ok) throw new Error(r.amount);
      return sum + p.value;
    }, 0n);
    expect(total).toBeGreaterThanOrEqual(10_000_000n);
    expect(total).toBeLessThanOrEqual(100_000_000n);
    expect(new Set(rows.map((r) => r.near_account_id)).size).toBe(1000);
    expect(csv.split('\r\n')).toHaveLength(1002); // header + 1,000 rows + trailing empty
  });

  it('produce one broken row per invalid variant', () => {
    const rows = validRows(60);
    const broken = withInvalidRow(rows, 54, 'comma_decimal');
    expect(broken[54]?.amount).toBe('0,05');
    expect(broken.filter((r, i) => JSON.stringify(r) !== JSON.stringify(rows[i]))).toHaveLength(1);
    expect(toDelimited([withInvalidRow(rows, 0, 'formula_name')[0]!])).toContain('"=HYPERLINK(""http://example.com"",""x"")"');
  });
});

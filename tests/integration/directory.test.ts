/**
 * Phase 19: recipient directory and "Pay registered recipients only".
 * Upload / manual draft / submit-time re-check, frozen directory check, change log, bulk import,
 * read-only testnet check (stand-in checker), admin-only API.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import { DEMO_DRAFT_RUN_ID, seedDemo } from '@/server/db/seed';
import { recipients } from '@/server/db/schema';
import {
  applyImport, checkReadiness, createRecipient, directoryDrift, recentDirectoryEvents, registeredOnly,
  setRecipientActive, setRegisteredOnly, updateRecipient,
} from '@/server/recipients/directory';
import { importRecipientFile } from '@/server/recipients/import';
import type { ReadinessChecker } from '@/server/recipients/readiness';
import { draftView, saveManualDraft, uploadToDraft } from '@/server/runs/draft-service';
import { createRun } from '@/server/runs/repository';
import { latestVersion, submitRun } from '@/server/runs/lifecycle';
import { FakeVault } from '../helpers/fake-vault';
import { eq } from 'drizzle-orm';

const dir = mkdtempSync(join(tmpdir(), 'sentfund-dir-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const maker = { id: 'usr_maker', role: 'maker' as const };
const admin = { id: 'usr_admin', role: 'admin' as const };
const CAP = 1_000_000n;
const NOW = new Date('2026-11-10T05:00:00Z');
let h: DatabaseHandle;
let k = 0;

beforeEach(async () => {
  k += 1;
  h = openDatabase(join(dir, `d${k}.sqlite`));
  await seedDemo(h.db, { env: { DEMO_MODE: 'true' }, now: NOW, recipientDirectory: true, testnetHistory: false });
});

const HEADER = 'near_account_id,receiver_name,currency,amount,mobile_phone,email';
const csv = (...rows: string[]) => new TextEncoder().encode([HEADER, ...rows].join('\n'));
const emma = (amount = '0.05') => `recipient1.sentfund-payroll.testnet,Emma Clark,tUSDC,${amount},+44 7700 900101,emma.clark@example.com`;
const daniel = (amount = '0.04') => `recipient2.sentfund-payroll.testnet,Daniel Hall,tUSDC,${amount},+44 7700 900102,daniel.hall@example.com`;
const uploadRun = (bytes: Uint8Array, name = 'p.csv') => {
  const id = createRun(h.db, { makerUserId: maker.id, title: 'Directory test', postingMode: 'detailed', source: 'upload', now: NOW });
  return { id, out: uploadToDraft(h.db, maker, id, { filename: name, bytes, expectedRevision: 0, now: NOW }) };
};
const recipientId = (account: string) => h.db.select({ id: recipients.id }).from(recipients).where(eq(recipients.nearAccountId, account)).get()!.id;

describe('seeded directory', () => {
  it('has the three live recipients, 1,000 sample employees and the setting on; the sample upload still passes', () => {
    expect(registeredOnly(h.db)).toBe(true);
    const all = h.db.select().from(recipients).all();
    expect(all).toHaveLength(1003);
    const live = all.filter((r) => !r.sample).map((r) => [r.name, r.division, r.nearAccountId]);
    expect(live).toEqual(expect.arrayContaining([
      ['Emma Clark', 'Sales', 'recipient1.sentfund-payroll.testnet'], ['Daniel Hall', 'Sales', 'recipient2.sentfund-payroll.testnet'], ['Grace Lewis', 'Operations', 'recipient3.sentfund-payroll.testnet'],
    ]));
    expect(new Set(all.filter((r) => r.sample).map((r) => r.division))).toEqual(new Set(['Engineering', 'Customer Support', 'Logistics']));
    for (const f of ['sentfund-payroll-sample-1000.csv', 'sentfund-payroll-uniform-1000.csv', 'sentfund-payroll-sample-1000.txt']) {
      const { out } = uploadRun(readFileSync(`public/templates/${f}`), f);
      expect(out.result.ok, f).toBe(true);
    }
  });
});

describe('Pay registered recipients only', () => {
  it('rejects an upload row that is not in the directory, inactive, or above the recipient maximum, with file row and column', () => {
    setRecipientActive(h.db, admin, recipientId('recipient2.sentfund-payroll.testnet'), false, NOW);
    const { out } = uploadRun(csv(emma(), daniel(), 'hacker.testnet,Mallory,tUSDC,0.05,+44 7700 900999,m@example.com', emma('0.50')));
    expect(out.result.ok).toBe(false);
    if (out.result.ok) return;
    expect(out.result.errors).toEqual([
      { line: 3, record: 2, column: 'near_account_id', message: 'This recipient is inactive in the recipient directory.' },
      { line: 4, record: 3, column: 'near_account_id', message: 'No active recipient with this NEAR account in the recipient directory. Ask the admin to add it.' },
      { line: 5, record: 4, column: 'amount', message: "Amount is above this recipient's maximum of 0.30 tUSDC per payout." },
    ]);
  });

  it('flags manual rows the same way, and accepts anything valid when the setting is off', () => {
    saveManualDraft(h.db, maker, DEMO_DRAFT_RUN_ID, { expectedRevision: 1, now: NOW, rows: [
      { near_account_id: 'recipient1.sentfund-payroll.testnet', receiver_name: 'Emma Clark', currency: 'tUSDC', amount: '0.05', mobile_phone: '+44 7700 900101', email: 'e@example.com' },
      { near_account_id: 'someone.testnet', receiver_name: 'Someone', currency: 'tUSDC', amount: '0.05', mobile_phone: '+44 7700 900101', email: 's@example.com' },
    ] });
    const on = draftView(h.db, maker, DEMO_DRAFT_RUN_ID).summary;
    expect(on.invalidCount).toBe(1);
    expect(on.rows[1]?.errors[0]?.field).toBe('near_account_id');
    setRegisteredOnly(h.db, admin, false, NOW);
    expect(draftView(h.db, maker, DEMO_DRAFT_RUN_ID).summary.invalidCount).toBe(0);
  });

  it('re-checks on the server at submit time: a recipient deactivated after upload blocks submission and nothing is sent', async () => {
    const { id, out } = uploadRun(csv(emma(), daniel()));
    expect(out.result.ok).toBe(true);
    setRecipientActive(h.db, admin, recipientId('recipient2.sentfund-payroll.testnet'), false, NOW);
    const fake = new FakeVault();
    await expect(submitRun(h.db, fake, maker, id, { expectedRevision: 1, now: NOW })).rejects.toThrow(/Pay registered recipients only: 1 row \(row 3\)/);
    expect(fake.calls).toEqual([]);
    expect(latestVersion(h.db, id)).toBeNull();
  });

  it('freezes the directory check into the version; approvers see drift after a later change', async () => {
    const { id } = uploadRun(csv(emma(), daniel()));
    const fake = new FakeVault();
    await submitRun(h.db, fake, maker, id, { expectedRevision: 1, now: NOW });
    const v = latestVersion(h.db, id)!;
    expect(JSON.parse(v.directoryCheck!)).toEqual({ enforced: true, matched: 2, rows: 2, identity: { enforced: true, verified: 2 } });
    const rows = [{ accountId: 'recipient1.sentfund-payroll.testnet', amount: 50_000n }, { accountId: 'recipient2.sentfund-payroll.testnet', amount: 40_000n }];
    expect(directoryDrift(h.db, rows)).toBe(0);
    updateRecipient(h.db, admin, recipientId('recipient2.sentfund-payroll.testnet'), { name: 'Daniel Hall', division: 'Sales', email: 'daniel.hall@example.com', mobilePhone: '+44 7700 900102', maxAmount: '0.03' }, CAP, NOW);
    expect(directoryDrift(h.db, rows)).toBe(1);
    expect(() => h.sqlite.prepare('update run_versions set directory_check = ? where id = ?').run('{"enforced":false}', v.id)).toThrow(/immutable/);
  });
});

describe('directory changes', () => {
  it('validates input, never exceeds the per-row cap, refuses a duplicate account, and logs every change with who and when', () => {
    const bad = createRecipient(h.db, admin, { nearAccountId: 'Bad Account', name: '', division: '', email: 'x', mobilePhone: '1', maxAmount: '2' }, CAP, NOW);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.map((e) => e.field).sort()).toEqual(['division', 'email', 'maxAmount', 'mobilePhone', 'name', 'nearAccountId']);
    const over = createRecipient(h.db, admin, { nearAccountId: 'new.testnet', name: 'New Person', division: 'sales', email: 'n@example.com', mobilePhone: '+44 7700 900200', maxAmount: '1.5' }, CAP, NOW);
    expect(over.ok || over.errors).toEqual([{ field: 'maxAmount', message: "The maximum is above the workflow's per-row cap of 1.00 tUSDC." }]);
    const ok = createRecipient(h.db, admin, { nearAccountId: 'new.testnet', name: 'New Person', division: 'sales', email: 'n@example.com', mobilePhone: '+44 7700 900200', maxAmount: '0.2' }, CAP, NOW);
    expect(ok.ok && ok.recipient.division).toBe('Sales'); // existing spelling kept
    expect(() => createRecipient(h.db, admin, { nearAccountId: 'new.testnet', name: 'Again', division: 'Sales', email: 'a@example.com', mobilePhone: '+44 7700 900201', maxAmount: '0.1' }, CAP, NOW)).toThrow(/already in the directory/);
    expect(() => createRecipient(h.db, maker, { nearAccountId: 'x.testnet' }, CAP, NOW)).toThrow(/Only the admin/);

    const id = recipientId('new.testnet');
    const later = new Date(NOW.getTime() + 60_000);
    const edit = updateRecipient(h.db, admin, id, { name: 'New Person', division: 'Operations', email: 'n@example.com', mobilePhone: '+44 7700 900200', maxAmount: '0.3' }, CAP, later);
    expect(edit.ok && edit.changed.sort()).toEqual(['division', 'maxAmount']);
    expect(() => updateRecipient(h.db, admin, id, { name: 'X', division: 'Sales', email: 'n@example.com', mobilePhone: '+44 7700 900200', maxAmount: '0.3' }, CAP, later, NOW.getTime())).toThrow(/changed in another window/);
    setRecipientActive(h.db, admin, id, false, later);
    setRecipientActive(h.db, admin, id, true, later);
    const log = recentDirectoryEvents(h.db, 10, id);
    expect(log.map((e) => [e.action, e.actor])).toEqual([['reactivated', 'Adam Admin'], ['deactivated', 'Adam Admin'], ['updated', 'Adam Admin'], ['created', 'Adam Admin']]);
    expect(log[2]?.changes).toEqual({ division: ['Sales', 'Operations'], maxAmount: ['200000', '300000'] });
    expect(log[2]?.at).toEqual(later);
    // Never deleted; the log is append-only; the account never changes.
    expect(() => h.sqlite.prepare('delete from recipients where id = ?').run(id)).toThrow(/deactivate/);
    expect(() => h.sqlite.prepare('delete from recipient_events').run()).toThrow(/append-only/);
    expect(() => h.sqlite.prepare('update recipient_events set actor_user_id = ?').run('usr_maker')).toThrow(/append-only/);
    expect(() => h.sqlite.prepare('update recipients set near_account_id = ? where id = ?').run('other.testnet', id)).toThrow(/never changes/);
  });

  it('records the read-only testnet check (stand-in checker) and logs a changed result', async () => {
    const answers: Record<string, 'ready' | 'no_account' | 'not_registered'> = {
      'recipient1.sentfund-payroll.testnet': 'ready', 'recipient2.sentfund-payroll.testnet': 'not_registered', 'recipient3.sentfund-payroll.testnet': 'no_account',
    };
    const checker: ReadinessChecker = { check: async (a) => answers[a] ?? 'check_failed' };
    const ids = Object.keys(answers).map(recipientId);
    const out = await checkReadiness(h.db, checker, 'usr_admin', ids, () => NOW);
    expect(Object.values(out).sort()).toEqual(['no_account', 'not_registered', 'ready']);
    expect(h.db.select().from(recipients).where(eq(recipients.id, ids[0]!)).get()?.readiness).toBe('ready');
    expect(recentDirectoryEvents(h.db, 1, ids[1])[0]?.changes).toEqual({ readiness: ['unchecked', 'not_registered'] });
  });
});

describe('bulk import', () => {
  const DIR_HEADER = `${HEADER},division`;
  const file = (...rows: string[]) => new TextEncoder().encode([DIR_HEADER, ...rows].join('\r\n'));

  it('reports every problem with its row and column and imports nothing', () => {
    const r = importRecipientFile({ filename: 'd.csv', perRowCap: CAP, bytes: file(
      'a1.testnet,Ann One,tUSDC,0.05,+44 7700 900300,a1@example.com,Sales',
      'a2.testnet,Ann Two,tUSDC,2.00,+44 7700 900301,a2@example.com,Sales',
      'a1.testnet,Ann Again,tUSDC,0.05,+44 7700 900302,a3@example.com,Sales',
      'a4.testnet,Ann Four,USD,0.05,+44 7700 900303,a4@example.com,',
    ) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => [e.line, e.column])).toEqual([[3, 'amount'], [4, 'near_account_id'], [5, 'currency'], [5, 'division']]);
    expect(r.errors[0]?.message).toMatch(/maximum is above the workflow's per-row cap .*amount is the maximum per payout/);
  });

  it('adds new accounts, updates existing ones field by field (keeping their status) and logs the source', () => {
    setRecipientActive(h.db, admin, recipientId('recipient3.sentfund-payroll.testnet'), false, NOW);
    const r = importRecipientFile({ filename: 'd.csv', perRowCap: CAP, bytes: file(
      'b1.testnet,Ben One,tUSDC,0.05,+44 7700 900310,b1@example.com,Engineering',
      'recipient1.sentfund-payroll.testnet,Emma Clark,tUSDC,0.30,+44 7700 900101,emma.clark@example.com,Sales',
      'recipient3.sentfund-payroll.testnet,Grace Lewis,tUSDC,0.20,+44 7700 900103,grace.lewis@example.com,Operations',
    ) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const applied = applyImport(h.db, admin, r.rows.map(({ line: _l, ...x }) => x), NOW);
    expect(applied).toMatchObject({ created: 1, updated: 1, unchanged: 1, inactiveKept: 1 });
    const grace = h.db.select().from(recipients).where(eq(recipients.nearAccountId, 'recipient3.sentfund-payroll.testnet')).get()!;
    expect([grace.active, grace.maxAmount]).toEqual([false, 200_000n]);
    expect(recentDirectoryEvents(h.db, 1, grace.id)[0]).toMatchObject({ action: 'updated', source: 'import', changes: { maxAmount: ['300000', '200000'] } });
  });
});

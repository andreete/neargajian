/**
 * Deterministic demo seed (DEMO_MODE only): four demo users mapped to the existing testnet
 * signer accounts, the active workflow mirroring the live vault (D-049), and one editable
 * manual draft for the maker paying the three demo recipients. Idempotent: running it
 * again keeps existing rows (and password hashes) and only fills in what is missing.
 */
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password.ts';
import type { Db } from './client.ts';
import { payrollRuns, users, workflowConfigs } from './schema.ts';
import { createRun, replaceDraft } from '../runs/repository.ts';
import { importTestnetHistory, readTestnetHistory } from './testnet-history.ts';
import { currentVaultId } from '../workflow/vault.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importPayrollFile } from '../payroll/import.ts';
import { applyImport, setRegisteredOnly, type CleanRecipient } from '../recipients/directory.ts';
import { recipients } from './schema.ts';
import { seedIdentity } from '../identity/service.ts';
import { loadConfig } from '../config.ts';

// The demo sign-ins live in their own small module so the public landing page does not import the
// seed (and through it the identity engine).
export { DEMO_PASSWORD, demoUsers, type DemoUser, type SeedEnv } from './demo-users.ts';
import { DEMO_EMPLOYEES, DEMO_PASSWORD, MASTER, demoUsers, type SeedEnv } from './demo-users.ts';
import { seedPayFields } from '../recipients/directory.ts';

export const DEMO_DRAFT_RUN_ID = 'run_demo_november';

/** Mirrors the live vault's active workflow (docs/TESTNET.md): revision 5, set through the
 *  app's admin workflow editor on 9 Nov 2026 (two approvers in sequence, automatic release). */
/** The final vault's active workflow (Phase 16: revision 3, two in sequence, automatic release). */
export const SEED_WORKFLOW = { revision: 3, txHash: 'GvJxnx9eyVnKz6rLKa2C7stMoLoEb1YaM6JPNCyu4Ruc' } as const;

export interface SeedOptions {
  now?: Date;
  env?: SeedEnv;
  /** Add the "November contractors (demo)" draft (default true). */
  demoDraft?: boolean;
  /** Import the real testnet runs from db/seed/testnet-history.json (default true). */
  testnetHistory?: boolean;
  /** Seed the recipient directory and turn on "Pay registered recipients only" (default false). */
  recipientDirectory?: boolean;
}

/** The three live testnet recipients (docs/TESTNET.md): Sales and Operations hold only these. */
export const LIVE_RECIPIENTS: CleanRecipient[] = [
  { nearAccountId: `recipient1.${MASTER}`, name: 'Emma Clark', division: 'Sales', email: 'emma.clark@example.com', mobilePhone: '+44 7700 900101', maxAmount: 100_000n },
  { nearAccountId: `recipient2.${MASTER}`, name: 'Daniel Hall', division: 'Sales', email: 'daniel.hall@example.com', mobilePhone: '+44 7700 900102', maxAmount: 100_000n },
  { nearAccountId: `recipient3.${MASTER}`, name: 'Grace Lewis', division: 'Operations', email: 'grace.lewis@example.com', mobilePhone: '+44 7700 900103', maxAmount: 100_000n },
];
/** The 1,000 synthetic sample employees (accounts not on testnet) are spread over these. */
export const SAMPLE_DIVISIONS = ['Engineering', 'Customer Support', 'Logistics'] as const;
export const SAMPLE_FILE = 'public/templates/sentfund-payroll-sample-1000.csv';

/** Directory seed: live recipients + the sample employees (max 0.10 tUSDC each), setting on. */
export function seedRecipientDirectory(db: Db, now: Date): string[] {
  if (db.select({ id: recipients.id }).from(recipients).limit(1).get()) return [];
  const admin = { id: 'usr_admin', role: 'admin' as const };
  const sample = importPayrollFile({ filename: 'sentfund-payroll-sample-1000.csv', bytes: readFileSync(resolve(process.cwd(), SAMPLE_FILE)), limits: { maxRowAmount: 1_000_000n, maxRunTotal: 10n ** 30n } });
  if (!sample.ok) throw new Error('the sample payroll file does not validate');
  const employees: CleanRecipient[] = sample.rows.map((r, i) => ({
    nearAccountId: r.valid.accountId, name: r.valid.receiverName, division: SAMPLE_DIVISIONS[i % SAMPLE_DIVISIONS.length]!,
    email: r.valid.email, mobilePhone: r.valid.mobilePhone, maxAmount: 100_000n,
  }));
  applyImport(db, admin, LIVE_RECIPIENTS, now, { source: 'seed' });
  applyImport(db, admin, employees, now, { source: 'seed', sample: true });
  setRegisteredOnly(db, admin, true, now);
  return [`recipient directory (${LIVE_RECIPIENTS.length} testnet recipients + ${employees.length} sample employees), "Pay registered recipients only" on`,
    seedIdentity(db, admin, loadConfig().sessionSecret, now)];
}

/**
 * Payroll Advance demo (Phase 23), idempotent: the three live recipients get a monthly net pay of
 * 0.10 tUSDC, start dates more than 90 days ago and a maximum per payout of 0.30; the employee
 * sign-ins emma@, daniel@ and grace@ are linked to them. Runs at every hosted start (after the
 * migrations) and in the seed; does nothing when the directory has no live recipients yet.
 */
export async function seedPayrollAdvance(db: Db, now = new Date()): Promise<string[]> {
  const out: string[] = [];
  let fields = 0;
  for (const e of DEMO_EMPLOYEES) {
    const r = db.select().from(recipients).where(eq(recipients.nearAccountId, e.account)).get();
    if (!r) continue;
    if (seedPayFields(db, 'usr_admin', e.account, { maxAmount: e.maxAmount, monthlyNetPay: e.monthlyNetPay, startDate: e.startDate }, now)) fields += 1;
    if (db.select({ id: users.id }).from(users).where(eq(users.email, e.email)).get()) continue;
    db.insert(users).values({ id: e.id, email: e.email, displayName: e.displayName, role: 'employee', recipientId: r.id, chainAccountId: null, passwordHash: await hashPassword(DEMO_PASSWORD), createdAt: now }).run();
    out.push(e.email);
  }
  if (fields) out.push(`Payroll Advance fields for ${fields} live recipient${fields === 1 ? '' : 's'} (net pay 0.10, maximum 0.30)`);
  return out;
}

export async function seedDemo(db: Db, options: SeedOptions = {}) {
  const env = options.env ?? process.env;
  if (env.DEMO_MODE !== 'true') throw new Error('Refusing to seed demo users: DEMO_MODE is not "true".');
  const now = options.now ?? new Date();
  const created: string[] = [];

  for (const u of demoUsers(env)) {
    const existing = db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).get();
    if (existing) continue;
    db.insert(users).values({ ...u, passwordHash: await hashPassword(DEMO_PASSWORD), createdAt: now }).run();
    created.push(u.email);
  }

  const active = db.select({ id: workflowConfigs.id }).from(workflowConfigs).where(eq(workflowConfigs.chainStatus, 'active')).get();
  if (!active) {
    db.insert(workflowConfigs).values({
      id: `wf_rev_${SEED_WORKFLOW.revision}`, revision: SEED_WORKFLOW.revision, kind: 'two_sequential', approver1UserId: 'usr_app1', approver2UserId: 'usr_app2',
      releaseMode: 'automatic',
      maxRowAmount: BigInt(env.DEMO_CAP_PER_ROW_BASE_UNITS ?? '1000000'),
      maxRunTotal: BigInt(env.DEMO_CAP_PER_RUN_BASE_UNITS ?? '100000000'),
      chainStatus: 'active', chainTxHash: SEED_WORKFLOW.txHash, vaultContractId: currentVaultId(env),
      createdByUserId: 'usr_admin', createdAt: now, activatedAt: now,
    }).run();
    created.push(`workflow revision ${SEED_WORKFLOW.revision}`);
  }

  const draft = db.select({ id: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.id, DEMO_DRAFT_RUN_ID)).get();
  if (!draft && options.demoDraft !== false) {
    createRun(db, { id: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', title: 'November contractors (demo)', postingMode: 'detailed', source: 'manual', now });
    replaceDraft(db, {
      runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', expectedRevision: 0, now,
      rows: [
        { nearAccountId: `recipient1.${MASTER}`, receiverName: 'Emma Clark', currency: 'tUSDC', amount: '0.03', mobilePhone: '+44 7700 900101', email: 'emma.clark@example.com' },
        { nearAccountId: `recipient2.${MASTER}`, receiverName: 'Daniel Hall', currency: 'tUSDC', amount: '0.07', mobilePhone: '+44 7700 900102', email: 'daniel.hall@example.com' },
        { nearAccountId: `recipient3.${MASTER}`, receiverName: 'Grace Lewis', currency: 'tUSDC', amount: '0.05', mobilePhone: '+44 7700 900103', email: 'grace.lewis@example.com' },
      ],
    });
    created.push('demo draft run');
  }

  if (options.recipientDirectory) created.push(...seedRecipientDirectory(db, now));
  created.push(...(await seedPayrollAdvance(db, now)));

  const history = options.testnetHistory === false ? 0 : importTestnetHistory(db, readTestnetHistory());
  if (history) created.push(`${history} testnet runs from db/seed/testnet-history.json`);
  return created;
}

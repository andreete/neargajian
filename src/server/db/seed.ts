/**
 * Deterministic demo seed (DEMO_MODE only): four demo users mapped to the existing testnet
 * signer accounts, the active workflow mirroring the live vault (D-049), and one editable
 * manual draft for the maker paying the three demo recipients. Idempotent: running it
 * again keeps existing rows (and password hashes) and only fills in what is missing.
 */
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/password.ts';
import type { Db } from './client.ts';
import { payrollRuns, users, workflowConfigs, type Role } from './schema.ts';
import { createRun, replaceDraft } from '../runs/repository.ts';
import { importTestnetHistory, readTestnetHistory } from './testnet-history.ts';
import { currentVaultId } from '../workflow/vault.ts';

export type SeedEnv = Readonly<Record<string, string | undefined>>;

export const DEMO_PASSWORD = '12345678';
const MASTER = 'gajian-payroll.testnet';

export interface DemoUser { id: string; email: string; displayName: string; role: Role; chainAccountId: string }

export function demoUsers(env: SeedEnv = process.env): DemoUser[] {
  return [
    { id: 'usr_maker', email: 'maker@gajian.my.id', displayName: 'Maya Maker', role: 'maker', chainAccountId: env.MAKER_ACCOUNT_ID ?? `maker.${MASTER}` },
    { id: 'usr_app1', email: 'app1@gajian.my.id', displayName: 'Alex Approver', role: 'approver', chainAccountId: env.APPROVER1_ACCOUNT_ID ?? `approver1.${MASTER}` },
    { id: 'usr_app2', email: 'app2@gajian.my.id', displayName: 'Riley Reviewer', role: 'approver', chainAccountId: env.APPROVER2_ACCOUNT_ID ?? `approver2.${MASTER}` },
    { id: 'usr_admin', email: 'admin@gajian.my.id', displayName: 'Adam Admin', role: 'admin', chainAccountId: env.ADMIN_SIGNER_ACCOUNT_ID ?? `admin.${MASTER}` },
  ];
}

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

  const history = options.testnetHistory === false ? 0 : importTestnetHistory(db, readTestnetHistory());
  if (history) created.push(`${history} testnet runs from db/seed/testnet-history.json`);
  return created;
}

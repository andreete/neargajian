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

export type SeedEnv = Readonly<Record<string, string | undefined>>;

export const DEMO_PASSWORD = '12345678';
const MASTER = 'gajian-payroll.testnet';

export interface DemoUser { id: string; email: string; displayName: string; role: Role; chainAccountId: string }

export function demoUsers(env: SeedEnv = process.env): DemoUser[] {
  return [
    { id: 'usr_maker', email: 'maker@gajian.my.id', displayName: 'Maya Maker', role: 'maker', chainAccountId: env.MAKER_ACCOUNT_ID ?? `maker.${MASTER}` },
    { id: 'usr_app1', email: 'app1@gajian.my.id', displayName: 'Arif Approver', role: 'approver', chainAccountId: env.APPROVER1_ACCOUNT_ID ?? `approver1.${MASTER}` },
    { id: 'usr_app2', email: 'app2@gajian.my.id', displayName: 'Rina Reviewer', role: 'approver', chainAccountId: env.APPROVER2_ACCOUNT_ID ?? `approver2.${MASTER}` },
    { id: 'usr_admin', email: 'admin@gajian.my.id', displayName: 'Ade Admin', role: 'admin', chainAccountId: env.ADMIN_SIGNER_ACCOUNT_ID ?? `admin.${MASTER}` },
  ];
}

export const DEMO_DRAFT_RUN_ID = 'run_demo_november';

export async function seedDemo(db: Db, options: { now?: Date; env?: SeedEnv } = {}) {
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
      id: 'wf_rev_3', revision: 3, kind: 'two_sequential', approver1UserId: 'usr_app1', approver2UserId: 'usr_app2',
      releaseMode: 'automatic',
      maxRowAmount: BigInt(env.DEMO_CAP_PER_ROW_BASE_UNITS ?? '1000000'),
      maxRunTotal: BigInt(env.DEMO_CAP_PER_RUN_BASE_UNITS ?? '100000000'),
      chainStatus: 'active', chainTxHash: '5cK2gf4zTy9R7itMZ7YZrGnXg96mGfW9L5H893n6fh8S',
      createdByUserId: 'usr_admin', createdAt: now, activatedAt: now,
    }).run();
    created.push('workflow revision 3');
  }

  const draft = db.select({ id: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.id, DEMO_DRAFT_RUN_ID)).get();
  if (!draft) {
    createRun(db, { id: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', title: 'November contractors (demo)', postingMode: 'detailed', source: 'manual', now });
    replaceDraft(db, {
      runId: DEMO_DRAFT_RUN_ID, makerUserId: 'usr_maker', expectedRevision: 0, now,
      rows: [
        { nearAccountId: `recipient1.${MASTER}`, receiverName: 'Dewi Lestari', currency: 'tUSDC', amount: '0.03', mobilePhone: '+62 800-0000-1001', email: 'dewi.lestari@example.com' },
        { nearAccountId: `recipient2.${MASTER}`, receiverName: 'Budi Santoso', currency: 'tUSDC', amount: '0.07', mobilePhone: '+62 800-0000-1002', email: 'budi.santoso@example.com' },
        { nearAccountId: `recipient3.${MASTER}`, receiverName: 'Sari Wulandari', currency: 'tUSDC', amount: '0.05', mobilePhone: '+62 800-0000-1003', email: 'sari.wulandari@example.com' },
      ],
    });
    created.push('demo draft run');
  }
  return created;
}

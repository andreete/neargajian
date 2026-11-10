/** The demo sign-ins (DEMO_MODE): kept apart from seed.ts so pages can show them cheaply. */
import type { Role } from './schema.ts';

export type SeedEnv = Readonly<Record<string, string | undefined>>;

export const DEMO_PASSWORD = '12345678';
/** The testnet master account (on-chain name, unchanged by the SentFund rebrand). */
export const MASTER = 'sentfund-payroll.testnet';

export interface DemoUser { id: string; email: string; displayName: string; role: Role; chainAccountId: string }

export function demoUsers(env: SeedEnv = process.env): DemoUser[] {
  return [
    { id: 'usr_maker', email: 'maker@sentfund.my.id', displayName: 'Maya Maker', role: 'maker', chainAccountId: env.MAKER_ACCOUNT_ID ?? `maker.${MASTER}` },
    { id: 'usr_app1', email: 'app1@sentfund.my.id', displayName: 'Alex Approver', role: 'approver', chainAccountId: env.APPROVER1_ACCOUNT_ID ?? `approver1.${MASTER}` },
    { id: 'usr_app2', email: 'app2@sentfund.my.id', displayName: 'Riley Reviewer', role: 'approver', chainAccountId: env.APPROVER2_ACCOUNT_ID ?? `approver2.${MASTER}` },
    { id: 'usr_admin', email: 'admin@sentfund.my.id', displayName: 'Adam Admin', role: 'admin', chainAccountId: env.ADMIN_SIGNER_ACCOUNT_ID ?? `admin.${MASTER}` },
  ];
}

/**
 * Phase 23: the employee sign-ins, each linked to one of the three live testnet recipients
 * (Payroll Advance self-service). Employees never sign chain transactions.
 */
export interface DemoEmployee { id: string; email: string; displayName: string; account: string; monthlyNetPay: bigint; startDate: string; maxAmount: bigint }

export const DEMO_EMPLOYEES: DemoEmployee[] = [
  { id: 'usr_emp_emma', email: 'emma@sentfund.my.id', displayName: 'Emma Clark', account: `recipient1.${MASTER}`, monthlyNetPay: 100_000n, startDate: '2025-09-01', maxAmount: 300_000n },
  { id: 'usr_emp_daniel', email: 'daniel@sentfund.my.id', displayName: 'Daniel Hall', account: `recipient2.${MASTER}`, monthlyNetPay: 100_000n, startDate: '2026-01-12', maxAmount: 300_000n },
  { id: 'usr_emp_grace', email: 'grace@sentfund.my.id', displayName: 'Grace Lewis', account: `recipient3.${MASTER}`, monthlyNetPay: 100_000n, startDate: '2026-03-02', maxAmount: 300_000n },
];

/** Every demo email for the sign-in dialog and the landing page. */
export function demoEmails(env: SeedEnv = process.env): string[] {
  return [...demoUsers(env).map((u) => u.email), ...DEMO_EMPLOYEES.map((e) => e.email)];
}

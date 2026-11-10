/** The four demo sign-ins (DEMO_MODE): kept apart from seed.ts so pages can show them cheaply. */
import type { Role } from './schema.ts';

export type SeedEnv = Readonly<Record<string, string | undefined>>;

export const DEMO_PASSWORD = '12345678';
/** The testnet master account (on-chain name, unchanged by the SentFund rebrand). */
export const MASTER = 'gajian-payroll.testnet';

export interface DemoUser { id: string; email: string; displayName: string; role: Role; chainAccountId: string }

export function demoUsers(env: SeedEnv = process.env): DemoUser[] {
  return [
    { id: 'usr_maker', email: 'maker@sentfund.my.id', displayName: 'Maya Maker', role: 'maker', chainAccountId: env.MAKER_ACCOUNT_ID ?? `maker.${MASTER}` },
    { id: 'usr_app1', email: 'app1@sentfund.my.id', displayName: 'Alex Approver', role: 'approver', chainAccountId: env.APPROVER1_ACCOUNT_ID ?? `approver1.${MASTER}` },
    { id: 'usr_app2', email: 'app2@sentfund.my.id', displayName: 'Riley Reviewer', role: 'approver', chainAccountId: env.APPROVER2_ACCOUNT_ID ?? `approver2.${MASTER}` },
    { id: 'usr_admin', email: 'admin@sentfund.my.id', displayName: 'Adam Admin', role: 'admin', chainAccountId: env.ADMIN_SIGNER_ACCOUNT_ID ?? `admin.${MASTER}` },
  ];
}

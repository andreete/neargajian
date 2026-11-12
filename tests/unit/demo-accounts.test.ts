import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, demoAccounts, demoEmails } from '../../src/server/db/demo-users.ts';

describe('demo accounts for the sign-in dialog (Phase 25)', () => {
  it('lists the seven demo sign-ins in the agreed order with role and name', () => {
    expect(demoAccounts({}).map((a) => `${a.email} | ${a.role} · ${a.name}`)).toEqual([
      'maker@sentfund.my.id | Maker · Maya Maker',
      'app1@sentfund.my.id | Approver 1 · Alex Approver',
      'app2@sentfund.my.id | Approver 2 · Riley Reviewer',
      'admin@sentfund.my.id | Admin · Adam Admin',
      'emma@sentfund.my.id | Employee · Emma Clark',
      'daniel@sentfund.my.id | Employee · Daniel Hall',
      'grace@sentfund.my.id | Employee · Grace Lewis',
    ]);
    expect(demoEmails({})).toEqual(demoAccounts({}).map((a) => a.email));
    expect(DEMO_PASSWORD).toBe('12345678');
  });
});

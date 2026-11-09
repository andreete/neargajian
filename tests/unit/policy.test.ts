import { describe, expect, it } from 'vitest';
import { can, homeFor, type Action, type Principal, type RunContext } from '@/server/auth/policy';

const maker: Principal = { id: 'm1', role: 'maker' };
const otherMaker: Principal = { id: 'm2', role: 'maker' };
const app1: Principal = { id: 'a1', role: 'approver' };
const app2: Principal = { id: 'a2', role: 'approver' };
const admin: Principal = { id: 'ad', role: 'admin' };
const run: RunContext = { makerUserId: 'm1', assignedApproverIds: ['a1'] };

describe('authorization matrix', () => {
  it('maker ownership', () => {
    for (const a of ['run.view', 'run.view_recipients', 'run.edit_draft', 'run.submit', 'run.cancel', 'run.release'] as Action[]) {
      expect(can(maker, a, run), a).toBe(true);
      expect(can(otherMaker, a, run), a).toBe(false);
      expect(can(admin, a, run), a).toBe(false);
    }
    expect(can(maker, 'run.decide', run)).toBe(false);
  });

  it('assigned approvers only, and never for maker actions', () => {
    expect(can(app1, 'run.decide', run)).toBe(true);
    expect(can(app1, 'run.view_recipients', run)).toBe(true);
    expect(can(app2, 'run.decide', run)).toBe(false);
    expect(can(app2, 'run.view_recipients', run)).toBe(false);
    for (const a of ['run.edit_draft', 'run.submit', 'run.release', 'run.cancel'] as Action[]) expect(can(app1, a, run), a).toBe(false);
  });

  it('role-only actions', () => {
    expect(can(admin, 'workflow.update')).toBe(true);
    expect(can(maker, 'workflow.update')).toBe(false);
    expect(can(app1, 'workflow.update')).toBe(false);
    expect(can(maker, 'run.create')).toBe(true);
    expect(can(app1, 'run.create')).toBe(false);
    expect(can(app1, 'queue.view')).toBe(true);
    expect(can(admin, 'queue.view')).toBe(false);
    expect(can(admin, 'report.recipients', run)).toBe(false);
  });

  it('denies without a principal or without resource context', () => {
    expect(can(null, 'run.create')).toBe(false);
    expect(can(maker, 'run.view')).toBe(false);
    expect(can(app1, 'run.decide')).toBe(false);
  });

  it('chooses the dashboard from the role', () => {
    expect([homeFor('maker'), homeFor('approver'), homeFor('admin')]).toEqual(['/maker', '/approver', '/admin']);
  });
});

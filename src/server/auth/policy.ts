/**
 * Server-owned authorization matrix. The ONLY source of truth for who may do what; the UI
 * merely hides what the server would refuse. Documented in docs/SECURITY.md.
 *
 * Resource context comes from the database (run owner, the approvers snapshotted into the
 * run version), never from the request.
 */
import type { Role } from '../db/schema.ts';

export interface Principal {
  id: string;
  role: Role;
}

export interface RunContext {
  makerUserId: string;
  /** Approvers assigned in the snapshot of any submitted version of the run. */
  assignedApproverIds: readonly string[];
}

export type Action =
  | 'run.create'
  | 'run.list_own'
  | 'run.view'
  | 'run.view_recipients'
  | 'run.edit_draft'
  | 'run.submit'
  | 'run.cancel'
  | 'run.release'
  | 'run.decide'
  | 'queue.view'
  | 'workflow.view'
  | 'workflow.update'
  | 'report.company'
  | 'report.recipients'
  | 'recipients.manage'
  | 'settings.update'
  | 'assistant.use';

const isOwner = (p: Principal, run?: RunContext) => run !== undefined && p.role === 'maker' && run.makerUserId === p.id;
const isAssigned = (p: Principal, run?: RunContext) => run !== undefined && p.role === 'approver' && run.assignedApproverIds.includes(p.id);

/** Role-only rules (no resource needed). */
const ROLE_RULES: Partial<Record<Action, readonly Role[]>> = {
  'run.create': ['maker'],
  'run.list_own': ['maker'],
  'queue.view': ['approver'],
  'workflow.view': ['admin', 'maker', 'approver'],
  'workflow.update': ['admin'],
  'report.company': ['admin', 'maker', 'approver'],
  'recipients.manage': ['admin'],
  'settings.update': ['admin'],
  // The payroll assistant drafts runs for the signed-in maker only (never submit/approve/release).
  'assistant.use': ['maker'],
};

/** Resource rules: maker ownership or assignment to the run's snapshotted workflow. */
const RESOURCE_RULES: Partial<Record<Action, (p: Principal, run?: RunContext) => boolean>> = {
  'run.view': (p, r) => isOwner(p, r) || isAssigned(p, r),
  'run.view_recipients': (p, r) => isOwner(p, r) || isAssigned(p, r),
  'report.recipients': (p, r) => isOwner(p, r) || isAssigned(p, r),
  'run.edit_draft': isOwner,
  'run.submit': isOwner,
  'run.cancel': isOwner,
  'run.release': isOwner,
  'run.decide': isAssigned,
};

export function can(principal: Principal | null | undefined, action: Action, run?: RunContext): boolean {
  if (!principal) return false;
  const roles = ROLE_RULES[action];
  if (roles) return roles.includes(principal.role);
  const rule = RESOURCE_RULES[action];
  return rule ? rule(principal, run) : false;
}

/** Dashboard path chosen by the server from the session role. */
export function homeFor(role: Role): string {
  switch (role) {
    case 'maker':
      return '/maker';
    case 'approver':
      return '/approver';
    case 'admin':
      return '/admin';
  }
}

export const ROLE_LABEL: Record<Role, string> = { maker: 'Maker', approver: 'Approver', admin: 'Admin' };

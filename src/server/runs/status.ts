/**
 * The derived display status of a version (Awaiting funding, Needs attention, never "Paid"
 * before every payout is confirmed) for lists: the same rule the run page uses (view.ts).
 */
import { eq } from 'drizzle-orm';
import type { RunStatus } from '../../components/status-chip.tsx';
import type { Queryable } from '../db/client.ts';
import { payoutActions, runVersions, versionRows } from '../db/schema.ts';
import { paymentState } from './view.ts';

export function displayStatusFor(db: Queryable, version: typeof runVersions.$inferSelect): RunStatus {
  if (!['approved', 'releasing', 'paid', 'partially_paid'].includes(version.status)) return version.status;
  const rows = db.select().from(versionRows).where(eq(versionRows.versionId, version.id)).orderBy(versionRows.rowIndex).all();
  const actions = db.select().from(payoutActions).where(eq(payoutActions.versionId, version.id)).orderBy(payoutActions.createdAt).all();
  return paymentState({ version, rows, actions }).status;
}

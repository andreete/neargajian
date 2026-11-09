import { getDb } from '@/server/db/client';
import { can } from '@/server/auth/policy';
import { runContext } from '@/server/dashboard/queries';
import { getDraftRows } from '@/server/runs/repository';
import { json, problem, requireApiSession } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/**
 * Run detail including recipient fields. Only the run's maker or an approver assigned to
 * one of its versions may read it; everyone else gets 404 so run IDs leak nothing.
 */
export async function GET(request: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const guarded = requireApiSession(request);
  if (!guarded.ok) return guarded.response;
  const { runId } = await ctx.params;
  const db = getDb();
  const run = runContext(db, runId);
  if (!run || !can(guarded.session.user, 'run.view_recipients', run)) return problem(404, 'not_found', 'Payroll run not found.');
  const draft = can(guarded.session.user, 'run.edit_draft', run) ? getDraftRows(db, runId) : [];
  return json({ run: { id: runId, title: run.title }, draftRows: draft.map(({ runId: _r, ...row }) => row) });
}

import { getDb } from '@/server/db/client';
import { getVaultClient } from '@/server/chain/vault-client';
import { can } from '@/server/auth/policy';
import { contextOf, latestVersion, reconcileVersion } from '@/server/runs/lifecycle';
import { domainErrorResponse, json, problem, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Maker or an assigned approver: re-read the run from the vault and update pending states. */
export async function POST(request: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['maker', 'approver']);
  if (!guarded.ok) return guarded.response;
  const runId = (await ctx.params).runId;
  const db = getDb();
  const rc = contextOf(db, runId);
  if (!rc || !can(guarded.session.user, 'run.view', rc)) return problem(404, 'not_found', 'Payroll run not found.');
  const v = latestVersion(db, runId);
  if (!v) return json({ status: 'draft' });
  try {
    const r = await reconcileVersion(db, getVaultClient(), v.id);
    return json({ status: r.status });
  } catch (error) {
    return domainErrorResponse(error);
  }
}

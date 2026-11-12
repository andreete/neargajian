import { getDb } from '@/server/db/client';
import { getVaultClient } from '@/server/chain/vault-client';
import { can } from '@/server/auth/policy';
import { contextOf, latestVersion, snapshotOf } from '@/server/runs/lifecycle';
import { requestRelease } from '@/server/payouts/release';
import { domainErrorResponse, json, problem, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Maker only, maker-release runs only: reserve the total in the vault; the worker then pays the rows. */
export async function POST(request: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  const runId = (await ctx.params).runId;
  const db = getDb();
  const rc = contextOf(db, runId);
  if (!rc || !can(guarded.session.user, 'run.release', rc)) return problem(404, 'not_found', 'Payroll run not found.');
  const v = latestVersion(db, runId);
  if (!v || v.status !== 'approved') return problem(409, 'conflict', 'Only an approved version can be released.');
  if (snapshotOf(v).releaseMode !== 'maker') return problem(409, 'conflict', 'This run is released automatically by the release worker.');
  // Phase 26 (QA-A4/A7-07): a refusal before signing (no maker signer on this copy, or the vault was
  // switched since this run) is a 409 with its message, like every other route, not a bare 500.
  let r: Awaited<ReturnType<typeof requestRelease>>;
  try {
    r = await requestRelease(db, getVaultClient(), v, { role: 'maker', workerId: `maker-${guarded.session.user.id}` });
  } catch (error) {
    return domainErrorResponse(error);
  }
  if (r.outcome?.status === 'failure') return problem(409, 'refused', r.outcome.error ?? 'The vault refused the release.');
  return json({ status: r.status, txHash: r.outcome?.txHash ?? null }, 202);
}

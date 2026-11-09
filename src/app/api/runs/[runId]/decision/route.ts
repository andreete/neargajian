import { getDb } from '@/server/db/client';
import { getVaultClient } from '@/server/chain/vault-client';
import { decide } from '@/server/runs/lifecycle';
import { domainErrorResponse, json, problem, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Assigned approver only: approve or reject the exact version (signed with the approver's restricted key). */
export async function POST(request: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['approver']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ versionId?: unknown; decision?: unknown; reason?: unknown }>(request, 4096);
  if (body instanceof Response) return body;
  if (typeof body.versionId !== 'string' || (body.decision !== 'approve' && body.decision !== 'reject')) return problem(400, 'bad_request', 'versionId and decision are required.');
  try {
    const r = await decide(getDb(), getVaultClient(), guarded.session.user, (await ctx.params).runId, {
      versionId: body.versionId, decision: body.decision, ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
    });
    return json(r, 202);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
